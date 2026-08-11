import { NextRequest, NextResponse } from 'next/server';
import { adminClient } from '@/lib/server/requireAdmin';
import { requireIngestAuth } from '@/lib/server/ingestAuth';
import { normalizeArticlePayload, type ArticleRow } from '@/lib/apiIngest';
import { evaluateArticleIngestQuality } from '@/lib/articleIngestQuality';
import { pickRelated } from '@/lib/relatedNews';
import { buildNewsJsonLd } from '@/lib/seo';
import type { NewsArticle } from '@/lib/supabase';
import { buildSlug } from '@/lib/slug';

// POST /api/public/articles — tạo bài viết từ nguồn ngoài (make.com).
// Luôn lưu NHÁP (is_published=false); caller không thể tự đặt slug, views hay xuất bản.

export const runtime = 'nodejs';

const MAX_BODY_BYTES = 512 * 1024;
const MAX_SLUG_ATTEMPTS = 50;

type Admin = NonNullable<ReturnType<typeof adminClient>>;
type ExistingArticle = { id: string; slug: string; is_published: boolean };
type DbError = { code?: string; message: string };

async function findByExternalId(
  admin: Admin,
  externalId: string,
): Promise<{ data: ExistingArticle | null; error: DbError | null }> {
  const { data, error } = await admin
    .from('news')
    .select('id, slug, is_published')
    .eq('external_id', externalId)
    .maybeSingle();

  return {
    data: (data as ExistingArticle | null) ?? null,
    error: error ? { code: error.code, message: error.message } : null,
  };
}

function duplicateResponse(article: ExistingArticle) {
  return NextResponse.json({
    id: article.id,
    slug: article.slug,
    is_published: article.is_published,
    duplicate: true,
  });
}

function isUniqueViolation(error: DbError): boolean {
  return error.code === '23505';
}

function articleSnapshot(
  row: ArticleRow,
  slug: string,
  relatedIds: string[],
  schemaMarkup: Record<string, unknown> | null,
  timestamp: string,
): NewsArticle {
  return {
    id: `ingest:${row.external_id}`,
    title: row.title,
    slug,
    excerpt: row.excerpt,
    content: row.content,
    image_url: row.image_url,
    category: row.category,
    author: row.author,
    is_published: false,
    views: 0,
    meta_title: row.meta_title,
    meta_description: row.meta_description,
    focus_keywords: row.focus_keywords,
    schema_markup: schemaMarkup,
    related_ids: relatedIds,
    geo_area: row.geo_area,
    geo_entity: row.geo_entity,
    geo_notes: row.geo_notes,
    faq: row.faq,
    citations: row.citations,
    created_at: timestamp,
    updated_at: timestamp,
  };
}

export async function POST(req: NextRequest) {
  const auth = requireIngestAuth(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) {
    return NextResponse.json({ error: 'Body quá lớn (tối đa 512KB).' }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Body không phải JSON hợp lệ.' }, { status: 400 });
  }

  const parsed = normalizeArticlePayload(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ.', details: parsed.errors }, { status: 400 });
  }

  const admin = adminClient();
  if (!admin) {
    return NextResponse.json(
      { error: 'Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY trên server.' },
      { status: 503 },
    );
  }

  // Fast path cho retry thông thường. Unique index external_id vẫn là nguồn sự thật
  // và nhánh 23505 bên dưới khép race khi hai request tới đồng thời.
  if (parsed.row.external_id) {
    const existing = await findByExternalId(admin, parsed.row.external_id);
    if (existing.error) {
      console.error('[api/public/articles] kiểm tra external_id lỗi:', existing.error.message);
      return NextResponse.json({ error: 'Không kiểm tra được external_id.' }, { status: 503 });
    }
    if (existing.data) return duplicateResponse(existing.data);
  }

  const bodyObject = body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown>
    : null;
  const rawContent = typeof bodyObject?.content === 'string' ? bodyObject.content : undefined;
  const quality = evaluateArticleIngestQuality(parsed.row, { rawContent });
  if (!quality.passed) {
    return NextResponse.json(
      {
        error: 'ARTICLE_QUALITY_GATE_FAILED',
        message: 'Bài viết chưa đạt cổng chất lượng SEO–GEO–AIO.',
        quality_gate: quality,
      },
      { status: 422 },
    );
  }

  const { data: categoryRows, error: categoryError } = await admin
    .from('news_categories')
    .select('label')
    .order('order_index');

  if (categoryError) {
    console.error('[api/public/articles] đọc danh mục lỗi:', categoryError.message);
    return NextResponse.json({ error: 'Không kiểm tra được danh mục tin tức.' }, { status: 503 });
  }

  const allowedCategories = (categoryRows ?? [])
    .map(row => (typeof row.label === 'string' ? row.label.trim() : ''))
    .filter(Boolean);

  if (!allowedCategories.length) {
    return NextResponse.json({ error: 'Chưa cấu hình danh mục tin tức.' }, { status: 503 });
  }

  if (!allowedCategories.includes(parsed.row.category)) {
    return NextResponse.json(
      {
        error: 'Danh mục tin tức không tồn tại.',
        allowed_categories: allowedCategories,
      },
      { status: 400 },
    );
  }

  const { data: relatedRows, error: relatedError } = await admin
    .from('news')
    .select('*')
    .eq('is_published', true)
    .order('created_at', { ascending: false })
    .limit(100);

  if (relatedError) {
    console.error('[api/public/articles] đọc bài liên quan lỗi:', relatedError.message);
    return NextResponse.json({ error: 'Không tải được bài viết liên quan.' }, { status: 503 });
  }

  const baseSlug = buildSlug(parsed.row.title) || 'bai-viet';
  const timestamp = new Date().toISOString();
  const relatedIds = pickRelated(
    articleSnapshot(parsed.row, baseSlug, [], null, timestamp),
    [],
    (relatedRows ?? []) as NewsArticle[],
    5,
    Date.parse(timestamp),
  ).map(article => article.id);
  const warnings = [...quality.warnings];
  if (!relatedIds.length) {
    warnings.push({
      code: 'RELATED_POOL_EMPTY',
      field: 'related_ids',
      message: 'Chưa có bài public phù hợp để tự chọn bài liên quan; server lưu mảng rỗng.',
    });
  }
  const qualityResponse = {
    ...quality,
    warnings,
    metrics: { ...quality.metrics, related_count: relatedIds.length },
  };
  let lastError: DbError | null = null;

  for (let attempt = 0; attempt < MAX_SLUG_ATTEMPTS; attempt += 1) {
    const slug = attempt === 0 ? baseSlug : `${baseSlug}-${attempt + 1}`;
    const snapshot = articleSnapshot(parsed.row, slug, relatedIds, null, timestamp);
    const schemaMarkup = buildNewsJsonLd(snapshot);
    const { data, error } = await admin
      .from('news')
      .insert({
        ...parsed.row,
        slug,
        related_ids: relatedIds,
        schema_markup: schemaMarkup,
        created_at: timestamp,
        updated_at: timestamp,
      })
      .select('id, slug, is_published')
      .single();

    if (!error) {
      return NextResponse.json(
        {
          id: data.id,
          slug: data.slug,
          is_published: data.is_published,
          duplicate: false,
          quality_gate: qualityResponse,
          message: 'Bài viết đã lưu nháp. Vào admin để xem lại và xuất bản.',
        },
        { status: 201 },
      );
    }

    lastError = { code: error.code, message: error.message };
    if (!isUniqueViolation(lastError)) break;

    if (parsed.row.external_id) {
      const existing = await findByExternalId(admin, parsed.row.external_id);
      if (existing.error) {
        console.error('[api/public/articles] đọc lại external_id lỗi:', existing.error.message);
        return NextResponse.json({ error: 'Không kiểm tra được external_id.' }, { status: 503 });
      }
      if (existing.data) return duplicateResponse(existing.data);
    }
    // Nếu external_id chưa tồn tại thì 23505 đến từ slug vừa bị request khác chiếm.
    // Thử hậu tố kế tiếp thay vì trả lỗi giả cho Make.com.
  }

  console.error(
    '[api/public/articles] insert lỗi:',
    lastError?.code ?? 'unknown',
    lastError?.message ?? 'Không rõ lỗi',
  );
  const status = lastError && isUniqueViolation(lastError) ? 409 : 500;
  return NextResponse.json({ error: 'Không lưu được bài viết.' }, { status });
}
