import { unstable_cache } from 'next/cache';
import { loadHomeLocationStats } from '@/lib/server/homeLocationStats';

export const dynamic = 'force-dynamic';

// Only fulfilled aggregates reach the Data Cache. A minute-bucket argument prevents
// stale-while-revalidate from returning an expired snapshot when the new read fails.
// The endpoint itself has no user-controlled query/cache variants or auth context.
const getCachedStats = unstable_cache(
  async (_minuteBucket: number) => loadHomeLocationStats(),
  ['public-location-stats-v1'],
  { revalidate: 60 },
);

export async function GET() {
  try {
    const stats = await getCachedStats(Math.floor(Date.now() / 60_000));
    return Response.json(stats, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'Chưa tải được số liệu khu vực.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store', 'Retry-After': '60' },
    });
  }
}
