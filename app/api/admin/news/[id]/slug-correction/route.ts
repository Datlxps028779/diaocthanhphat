import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { categoryToSlug } from '@/lib/newsCategories';
import { isValidSlug } from '@/lib/slug';
import { adminClient, requireOwner } from '@/lib/server/requireAdmin';

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
};

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
    `/tin-tuc/${row.old_slug}`,
    `/tin-tuc/${row.slug}`,
    '/tin-tuc',
  ]);
  const categorySlug = row.category ? categoryToSlug(row.category) : undefined;
  if (categorySlug && isValidSlug(categorySlug)) paths.add(`/tin-tuc/danh-muc/${categorySlug}`);
  for (const path of paths) revalidatePath(path);

  return NextResponse.json({
    ok: true,
    result: row,
    revalidatedPaths: [...paths],
    propagation: {
      searchVisibility: 'not_started',
      freshness: 'not_started',
      aiRag: 'not_called',
    },
  });
}
