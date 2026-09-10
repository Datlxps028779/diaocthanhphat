import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { adminClient, callerClient, requireOwner } from '@/lib/server/requireAdmin';
import {
  buildNewsPublicationQualityReport,
  isPublishQualityAccepted,
  newsPublishBoundaryMode,
} from '@/lib/server/newsPublishing';
import type { NewsArticle } from '@/lib/supabase';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type PublicationResult = {
  id: string;
  slug: string;
  category: string;
  is_published: boolean;
  published_at: string | null;
  content_version: number;
  event_id: string | null;
  changed: boolean;
};

function parseBody(value: unknown): { publish: boolean; expectedContentVersion: number } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as Record<string, unknown>;
  if (typeof body.publish !== 'boolean') return null;
  if (
    typeof body.expectedContentVersion !== 'number'
    || !Number.isSafeInteger(body.expectedContentVersion)
    || body.expectedContentVersion < 1
  ) return null;
  return { publish: body.publish, expectedContentVersion: body.expectedContentVersion };
}

function errorCode(error: { code?: string; message?: string } | null | undefined) {
  if (error?.code === '40001') return 'STALE_VERSION';
  if (error?.code === '42501') return 'NOT_ALLOWED';
  if (error?.code === '23514') return 'QUALITY_GATE';
  if (error?.code === 'P0002') return 'NOT_FOUND';
  return 'PUBLISH_FAILED';
}

async function affectedPaths(article: Pick<NewsArticle, 'slug' | 'category'>, token: string) {
  const paths = new Set(['/','/tin-tuc','/kien-thuc','/sitemap.xml','/sitemap-images.xml']);
  if (article.slug) paths.add(`/tin-tuc/${article.slug}`);
  const client = callerClient(token);
  const { data } = await client.from('news_categories').select('slug').eq('label', article.category).maybeSingle();
  if (data?.slug) paths.add(`/tin-tuc/danh-muc/${data.slug}`);
  return [...paths].sort();
}

async function queueFreshness(paths: string[], result: PublicationResult) {
  const admin = adminClient();
  if (!admin || paths.length === 0 || !result.event_id) return;
  const fingerprint = createHash('sha256').update(result.event_id).digest('hex');
  const rows = paths.map(path => ({
    dedupe_key: `${fingerprint}:${path}`.slice(0, 320),
    event_kind: 'news',
    event_action: result.is_published ? 'publish' : 'unpublish',
    path,
  }));
  const { error } = await admin.from('seo_freshness_jobs').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  if (error) throw error;
}


async function observeLegacyPublish({
  client,
  article,
  publish,
  mode,
  report,
  paths,
}: {
  client: ReturnType<typeof callerClient>;
  article: NewsArticle;
  publish: boolean;
  mode: ReturnType<typeof newsPublishBoundaryMode>;
  report: ReturnType<typeof buildNewsPublicationQualityReport>;
  paths: string[];
}) {
  const previousPublished = Boolean(article.is_published);
  const nextPublishedAt = publish
    ? (article.published_at ?? new Date().toISOString())
    : article.published_at;
  if (previousPublished === publish) {
    return NextResponse.json({
      ok: true,
      mode,
      result: {
        id: article.id,
        slug: article.slug,
        category: article.category,
        is_published: previousPublished,
        published_at: article.published_at,
        content_version: article.content_version ?? 1,
        event_id: null,
        changed: false,
      },
      quality_gate: report,
      paths,
    });
  }

  const { data, error } = await client
    .from('news')
    .update({
      is_published: publish,
      published_at: nextPublishedAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', article.id)
    .select('id,slug,category,is_published,published_at')
    .single();
  if (error || !data) {
    return NextResponse.json({ error: 'Không thể cập nhật trạng thái xuất bản.', code: 'PUBLISH_FAILED' }, { status: 503 });
  }

  const updated = data as Pick<PublicationResult, 'id' | 'slug' | 'category' | 'is_published' | 'published_at'>;
  const result: PublicationResult = {
    id: updated.id,
    slug: updated.slug,
    category: updated.category,
    is_published: updated.is_published,
    published_at: updated.published_at,
    content_version: 1,
    event_id: null,
    changed: true,
  };
  for (const path of paths) revalidatePath(path);
  return NextResponse.json({ ok: true, mode, result, quality_gate: report, paths });
}

export async function POST(
  req: NextRequest,
  context: { params: { id: string } },
) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg, code: 'NOT_ALLOWED' }, { status: auth.status });

  const id = context.params.id;
  if (!UUID_RE.test(id)) return NextResponse.json({ error: 'ID bài viết không hợp lệ.', code: 'INVALID_ID' }, { status: 400 });
  const body = parseBody(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: 'Payload xuất bản không hợp lệ.', code: 'INVALID_PAYLOAD' }, { status: 400 });

  const client = callerClient(auth.token);
  const { data: article, error: readError } = await client
    .from('news')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: 'Không đọc được bài viết.', code: 'READ_FAILED' }, { status: 503 });
  if (!article) return NextResponse.json({ error: 'Không tìm thấy bài viết.', code: 'NOT_FOUND' }, { status: 404 });

  const typedArticle = article as NewsArticle;
  const mode = newsPublishBoundaryMode();
  const report = buildNewsPublicationQualityReport(typedArticle);
  if (body.publish && !isPublishQualityAccepted(report)) {
    return NextResponse.json(
      { error: 'Bài viết chưa đạt cổng chất lượng SEO–GEO–AIO.', code: 'QUALITY_GATE', quality_gate: report },
      { status: 422 },
    );
  }

  const hasContentVersion = Number.isSafeInteger(typedArticle.content_version) && (typedArticle.content_version ?? 0) >= 1;
  const paths = await affectedPaths({ slug: typedArticle.slug, category: typedArticle.category }, auth.token);

  if (!hasContentVersion) {
    if (mode === 'enforce') {
      return NextResponse.json({ error: 'Production chưa có migration News publication boundary.', code: 'MIGRATION_REQUIRED' }, { status: 503 });
    }
    return observeLegacyPublish({
      client,
      article: typedArticle,
      publish: body.publish,
      mode,
      report,
      paths,
    });
  }

  const { data, error } = await client.rpc('publish_news_article', {
    p_news_id: id,
    p_expected_content_version: body.expectedContentVersion,
    p_publish: body.publish,
    p_quality_report: report,
    p_affected_paths: paths,
  });
  if (error) {
    const code = errorCode(error);
    const status = code === 'STALE_VERSION' ? 409 : code === 'NOT_ALLOWED' ? 403 : code === 'NOT_FOUND' ? 404 : code === 'QUALITY_GATE' ? 422 : 503;
    return NextResponse.json({ error: code === 'STALE_VERSION' ? 'Bài viết đã thay đổi, vui lòng tải lại.' : 'Không thể cập nhật trạng thái xuất bản.', code }, { status });
  }

  const result = (Array.isArray(data) ? data[0] : data) as PublicationResult | null;
  if (!result) return NextResponse.json({ error: 'Boundary không trả kết quả hợp lệ.', code: 'INVALID_RESULT' }, { status: 503 });
  if (!result.changed) return NextResponse.json({ ok: true, mode, result, quality_gate: report, paths });

  for (const path of paths) revalidatePath(path);
  try {
    await queueFreshness(paths, result);
  } catch (queueError) {
    console.error('[news-publish] đã đổi trạng thái nhưng chưa enqueue freshness:', queueError);
  }

  return NextResponse.json({ ok: true, mode, result, quality_gate: report, paths });
}
