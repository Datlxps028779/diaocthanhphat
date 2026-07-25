import { supabase, type PriceStat, type PriceStatScope } from '../supabase';

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
  return (data as number) ?? 0;
}
