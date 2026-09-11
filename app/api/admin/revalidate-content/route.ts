import { NextRequest, NextResponse } from 'next/server';
import { callerClient, requireOwner } from '@/lib/server/requireAdmin';
import { parseContentRevalidationInput, type RevalidationLookups } from '@/lib/server/contentRevalidation';
import { propagatePublicIndexing } from '@/lib/server/publicIndexing';

export const runtime = 'nodejs';

async function loadLookups(token: string): Promise<RevalidationLookups> {
  const client = callerClient(token);
  const [areasResult, categoriesResult, districtsResult, propertyTypesResult] = await Promise.all([
    client.from('areas').select('id,slug'),
    client.from('news_categories').select('label,slug'),
    client.from('districts').select('id,area_id,slug'),
    client.from('property_types').select('id,slug'),
  ]);
  if (areasResult.error || categoriesResult.error || districtsResult.error || propertyTypesResult.error) {
    throw new Error('Không tải được dữ liệu URL công khai.');
  }
  return {
    areaSlugs: new Map((areasResult.data ?? [])
      .filter(row => row.id && row.slug)
      .map(row => [row.id, row.slug])),
    categorySlugs: new Map((categoriesResult.data ?? [])
      .filter(row => row.label && row.slug)
      .map(row => [row.label, row.slug])),
    districtSlugs: new Map((districtsResult.data ?? [])
      .filter(row => row.id && row.area_id && row.slug)
      .map(row => [row.id, { areaId: row.area_id, slug: row.slug }])),
    propertyTypeSlugs: new Map((propertyTypesResult.data ?? [])
      .filter(row => row.id && row.slug)
      .map(row => [row.id, row.slug])),
  };
}

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
    const propagation = await propagatePublicIndexing({
      content: parsed.input,
      lookups,
      actorId: auth.userId,
    });
    return NextResponse.json({ ok: true, ...propagation, queuedCount: propagation.freshness.queuedCount });
  } catch (error) {
    console.error('[revalidate-content] thất bại:', error);
    return NextResponse.json({ error: 'Đã lưu dữ liệu nhưng chưa làm mới được cache.' }, { status: 503 });
  }
}
