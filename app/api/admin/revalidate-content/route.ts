import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { callerClient, requireOwner } from '@/lib/server/requireAdmin';
import {
  collectContentRevalidationPaths,
  parseContentRevalidationInput,
  type RevalidationLookups,
} from '@/lib/server/contentRevalidation';

export const runtime = 'nodejs';

async function loadLookups(token: string): Promise<RevalidationLookups> {
  const client = callerClient(token);
  const [areasResult, categoriesResult] = await Promise.all([
    client.from('areas').select('id,slug'),
    client.from('news_categories').select('label,slug'),
  ]);
  if (areasResult.error || categoriesResult.error) {
    throw new Error('Không tải được dữ liệu URL công khai.');
  }
  return {
    areaSlugs: new Map((areasResult.data ?? [])
      .filter(row => row.id && row.slug)
      .map(row => [row.id, row.slug])),
    categorySlugs: new Map((categoriesResult.data ?? [])
      .filter(row => row.label && row.slug)
      .map(row => [row.label, row.slug])),
  };
}

// Revalidate theo entity/snapshot do server allowlist dựng ra. Không có trường path
// trong payload. Route này yêu cầu owner MFA như chính các mutation CMS, tránh mở
// một quyền purge cache mới cho staff khi staff không được phép sửa News/Sản phẩm.
export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const raw = await req.json().catch(() => null);
  const parsed = parseContentRevalidationInput(raw);
  if (!parsed.input) return NextResponse.json({ error: parsed.error ?? 'Payload không hợp lệ.' }, { status: 400 });

  try {
    const lookups = await loadLookups(auth.token);
    const paths = collectContentRevalidationPaths(parsed.input, lookups);
    for (const path of paths) revalidatePath(path);
    return NextResponse.json({ ok: true, paths });
  } catch (error) {
    console.error('[revalidate-content] thất bại:', error);
    return NextResponse.json({ error: 'Đã lưu dữ liệu nhưng chưa làm mới được cache.' }, { status: 503 });
  }
}
