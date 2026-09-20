import { NextRequest, NextResponse } from 'next/server';
import { isSafePublicSlugSegment, isValidSlug } from '@/lib/slug';
import { adminClient, callerClient, requireOwner } from '@/lib/server/requireAdmin';
import { buildAreaNames } from '@/lib/localityNewsMatch';
import { collectContentRevalidationPaths, type RevalidationLookups } from '@/lib/server/contentRevalidation';
import { propagatePublicIndexing } from '@/lib/server/publicIndexing';

export const runtime = 'nodejs';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SLUG_LENGTH = 220;

type SlugCorrectionBody = {
  expectedOldSlug?: unknown;
  newSlug?: unknown;
};

type CorrectedNews = {
  id: string;
  title: string;
  old_slug: string;
  slug: string;
  category: string | null;
  is_published: boolean;
  published_at: string | null;
  content_version: number;
  updated_at: string;
  area_id?: string | null;
  geo_area?: string | null;
};

async function loadNewsLookups(token: string): Promise<RevalidationLookups> {
  const client = callerClient(token);
  const [areasResult, categoriesResult] = await Promise.all([
    client.from('areas').select('id,slug,name'),
    client.from('news_categories').select('label,slug'),
  ]);
  if (areasResult.error || categoriesResult.error) throw new Error('Không tải được dữ liệu URL công khai.');
  return {
    areaSlugs: new Map((areasResult.data ?? []).filter(row => row.id && row.slug).map(row => [row.id, row.slug])),
    areaNames: buildAreaNames(areasResult.data ?? []),
    categorySlugs: new Map((categoriesResult.data ?? []).filter(row => row.label && row.slug).map(row => [row.label, row.slug])),
  };
}

function newsSnapshot(article: CorrectedNews) {
  return {
    id: article.id,
    slug: article.slug,
    category: article.category,
    area_id: article.area_id ?? null,
    geo_area: article.geo_area ?? null,
    is_published: article.is_published,
  };
}

function parseBody(value: unknown): { expectedOldSlug: string; newSlug: string } | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const body = value as SlugCorrectionBody;
  if (typeof body.expectedOldSlug !== 'string' || typeof body.newSlug !== 'string') return null;

  const expectedOldSlug = body.expectedOldSlug.trim();
  const newSlug = body.newSlug.trim();
  if (!expectedOldSlug || !newSlug || newSlug.length > MAX_SLUG_LENGTH || !isValidSlug(newSlug)) return null;
  return { expectedOldSlug, newSlug };
}

function errorResponse(error: { code?: string; message?: string }) {
  const code = error.code ?? '';
  if (code === '23505') return NextResponse.json({ error: 'Slug mới đã được bài viết khác sử dụng.', code: 'SLUG_CONFLICT' }, { status: 409 });
  if (code === '40001') return NextResponse.json({ error: 'Bài viết đã thay đổi hoặc slug cũ không còn khớp. Hãy đọc lại source trước khi thử lại.', code: 'STALE_SOURCE' }, { status: 409 });
  if (code === '22023') return NextResponse.json({ error: 'Payload slug không hợp lệ.', code: 'INVALID_SLUG' }, { status: 400 });
  if (code === '42501') return NextResponse.json({ error: 'Không được phép thực hiện slug correction.', code: 'NOT_ALLOWED' }, { status: 403 });
  console.error('[news-slug-correction] RPC failed:', error.message ?? error);
  return NextResponse.json({ error: 'Không hoàn tất được sửa slug.', code: 'SLUG_CORRECTION_FAILED' }, { status: 503 });
}

export async function POST(
  req: NextRequest,
  context: { params: { id: string } },
) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg, code: 'NOT_ALLOWED' }, { status: auth.status });

  const newsId = context.params.id;
  if (!UUID_RE.test(newsId)) {
    return NextResponse.json({ error: 'ID bài viết không hợp lệ.', code: 'INVALID_ID' }, { status: 400 });
  }

  const payload = parseBody(await req.json().catch(() => null));
  if (!payload) {
    return NextResponse.json({ error: 'Payload slug correction không hợp lệ.', code: 'INVALID_PAYLOAD' }, { status: 400 });
  }

  const admin = adminClient();
  if (!admin) {
    return NextResponse.json({ error: 'Server chưa cấu hình service role cho slug correction.', code: 'SERVER_CONFIGURATION' }, { status: 503 });
  }

  const caller = callerClient(auth.token);
  const { data: before, error: beforeError } = await caller.from('news').select('id,slug,category,is_published,area_id,geo_area').eq('id', newsId).maybeSingle();
  if (beforeError) return NextResponse.json({ error: 'Không đọc được bài viết trước khi sửa slug.', code: 'READ_FAILED' }, { status: 503 });
  if (!before) return NextResponse.json({ error: 'Không tìm thấy bài viết.', code: 'NOT_FOUND' }, { status: 404 });

  const { data, error } = await admin.rpc('correct_news_slug_server', {
    p_news_id: newsId,
    p_expected_old_slug: payload.expectedOldSlug,
    p_new_slug: payload.newSlug,
    p_actor_id: auth.userId,
  });
  if (error) return errorResponse(error);

  const row = (Array.isArray(data) ? data[0] : data) as CorrectedNews | undefined;
  if (!row || row.id !== newsId) {
    return NextResponse.json({ error: 'Slug correction không trả về row hợp lệ.', code: 'INVALID_RESULT' }, { status: 503 });
  }

  const paths = new Set([
    `/tin-tuc/${isSafePublicSlugSegment(row.old_slug) ? row.old_slug : payload.expectedOldSlug}`,
    `/tin-tuc/${row.slug}`,
    '/tin-tuc',
  ]);
  let lookups: RevalidationLookups;
  try {
    lookups = await loadNewsLookups(auth.token);
  } catch {
    return NextResponse.json({ error: 'Không tải được dữ liệu URL công khai.', code: 'LOOKUP_FAILED' }, { status: 503 });
  }
  const content = {
    entity: 'news' as const,
    action: 'update' as const,
    targets: [{
      previous: { ...before, slug: before.slug ?? payload.expectedOldSlug } as CorrectedNews,
      current: newsSnapshot({
        ...before,
        ...row,
        area_id: row.area_id ?? before.area_id ?? null,
        geo_area: row.geo_area ?? before.geo_area ?? null,
      }),
    }],
  };
  for (const path of collectContentRevalidationPaths(content, lookups)) paths.add(path);
  const propagation = row.is_published
    ? await propagatePublicIndexing({ content, lookups, actorId: auth.userId, paths: [...paths] })
    : { paths: [...paths], freshness: { status: 'skipped' as const, queuedCount: 0, error: null }, searchVisibility: { status: 'skipped' as const, runId: null, summary: null, error: null } };

  return NextResponse.json({
    ok: true,
    result: row,
    revalidatedPaths: propagation.paths,
    propagation,
  });
}
