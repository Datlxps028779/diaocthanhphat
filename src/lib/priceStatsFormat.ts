import type { PriceStat, ListingType } from './supabase';

// Câu miễn trừ BẮT BUỘC theo mục 6 updateweb.md — giá tổng hợp chỉ là tham khảo.
export const PRICE_DISCLAIMER =
  'Giá tham khảo tại thời điểm cập nhật và có thể thay đổi theo vị trí, diện tích, pháp lý, chất lượng tài sản và điều kiện giao dịch.';

// Chọn dòng thống kê tổng (property_type_id = null) cho 1 loại giao dịch.
export function pickOverallStat(stats: PriceStat[], listingType: ListingType): PriceStat | null {
  return stats.find(s => s.listing_type === listingType && s.property_type_id === null) ?? null;
}

// Làm tròn triệu/m² gọn cho hiển thị (1 chữ số thập phân nếu < 100).
export function formatPricePerSqm(trieu: number | null): string {
  if (trieu === null || !Number.isFinite(trieu) || trieu <= 0) return '—';
  const rounded = trieu >= 100 ? Math.round(trieu) : Math.round(trieu * 10) / 10;
  return `${rounded.toLocaleString('vi-VN')} triệu/m²`;
}

// dd/mm/yyyy từ ISO — dùng cho "cập nhật ngày…". Không phụ thuộc locale runtime.
export function formatUpdateDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

// Answer Block cho AIO: câu trả lời trực tiếp, có số liệu + số mẫu + ngày cập nhật.
// Trả null nếu không đủ dữ liệu (không bịa) → trang ẩn khối giá.
export function buildPriceAnswer(entityName: string, stats: PriceStat[], listingType: ListingType = 'mua_ban'): string | null {
  const stat = pickOverallStat(stats, listingType);
  if (!stat || stat.sample_count < 1) return null;
  const median = formatPricePerSqm(stat.median_price_per_sqm);
  if (median === '—') return null;
  const kind = listingType === 'cho_thue' ? 'giá thuê' : 'giá nhà đất';
  const date = formatUpdateDate(stat.computed_at);
  const datePart = date ? `, cập nhật ${date}` : '';
  return `Trung vị ${kind} tại ${entityName} khoảng ${median} (dựa trên ${stat.sample_count} tin đăng thực tế${datePart}).`;
}
