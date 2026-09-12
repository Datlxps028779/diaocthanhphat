import { supabase, type PriceStat, type PriceStatScope } from '../supabase';
import { isSafePublicSlugSegment } from '../slug';
import { revalidateRouteContent, routeRevalidationSnapshot } from './contentRevalidation';

// Đọc dữ liệu giá đã tổng hợp (sinh từ tin đăng thật qua RPC refresh_price_stats).
// Trả cả 2 loại giao dịch cho 1 scope_key; caller tự lọc mua_ban/cho_thue.
export async function getPriceStats(scope: PriceStatScope, scopeKey: string): Promise<PriceStat[]> {
  const { data } = await supabase
    .from('price_stats')
    .select('*')
    .eq('scope', scope)
    .eq('scope_key', scopeKey);
  return (data ?? []) as PriceStat[];
}

// Admin bấm "Làm mới dữ liệu giá" → gọi RPC (guard is_admin phía DB). Trả số nhóm đã ghi.
export async function adminRefreshPriceStats(): Promise<number> {
  const { data, error } = await supabase.rpc('refresh_price_stats');
  if (error) throw error;
  const [{ data: areas, error: areasError }, { data: neighborhoods, error: neighborhoodsError }] = await Promise.all([
    supabase.from('areas').select('slug'),
    supabase.from('neighborhoods').select('slug'),
  ]);
  if (areasError) throw areasError;
  if (neighborhoodsError) throw neighborhoodsError;

  const paths = [
    '/du-lieu-gia', '/khu-vuc', '/khu-dan-cu', '/mua-ban', '/cho-thue',
    ...(areas ?? [])
      .map(row => row.slug)
      .filter((slug): slug is string => isSafePublicSlugSegment(slug))
      .flatMap(slug => [`/khu-vuc/${slug.trim()}`, `/mua-ban/${slug.trim()}`, `/cho-thue/${slug.trim()}`]),
    ...(neighborhoods ?? [])
      .map(row => row.slug)
      .filter((slug): slug is string => isSafePublicSlugSegment(slug))
      .map(slug => `/khu-dan-cu/${slug.trim()}`),
  ];
  await revalidateRouteContent('update', [...new Set(paths)].map(path => ({ current: routeRevalidationSnapshot(path) })));
  return (data as number) ?? 0;
}
