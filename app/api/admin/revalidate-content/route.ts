import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { adminClient, callerClient, requireOwner } from '@/lib/server/requireAdmin';
import {
  collectContentRevalidationPaths,
  parseContentRevalidationInput,
  type RevalidationLookups,
} from '@/lib/server/contentRevalidation';

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

async function queueFreshnessJobs(
  input: NonNullable<ReturnType<typeof parseContentRevalidationInput>['input']>,
  paths: string[],
): Promise<number> {
  const admin = adminClient();
  if (!admin || paths.length === 0) return 0;
  const fingerprint = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  const rows = paths.map(path => ({
    dedupe_key: `${fingerprint}:${path}`.slice(0, 320),
    event_kind: input.entity,
    event_action: input.action,
    path,
  }));
  const { error } = await admin.from('seo_freshness_jobs').upsert(rows, { onConflict: 'dedupe_key', ignoreDuplicates: true });
  if (error) throw error;
  return rows.length;
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
    const paths = collectContentRevalidationPaths(parsed.input, lookups);
    let queuedCount = 0;
    try {
      queuedCount = await queueFreshnessJobs(parsed.input, paths);
    } catch (queueError) {
      // Queue is an operational retry aid; preserve the existing synchronous
      // revalidation path if the optional queue migration is not deployed yet.
      console.error('[revalidate-content] không ghi được freshness queue:', queueError);
    }
    for (const path of paths) revalidatePath(path);
    return NextResponse.json({ ok: true, paths, queuedCount });
  } catch (error) {
    console.error('[revalidate-content] thất bại:', error);
    return NextResponse.json({ error: 'Đã lưu dữ liệu nhưng chưa làm mới được cache.' }, { status: 503 });
  }
}
