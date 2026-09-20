// Giữ URL namespace của landing địa phương khi người dùng sửa các bộ lọc KHÔNG
// thuộc phạm vi route (từ khóa, diện tích, phòng ngủ, hướng, pháp lý, sort, trang).
//
// Vấn đề: effect đồng bộ filter → URL hiện dựng lại href bằng pageToHref(); hàm đó
// chỉ biết cây route cũ (/mua-ban/{tỉnh}/{huyện}) và KHÔNG biết các namespace mới
// `/mua-ban/a/loai/t`, `/mua-ban/a/gia/{b}`, `/mua-ban/a/d/phuong-xa/w`. Chạy nó trên
// landing địa phương là ghi đè path mới bằng path cũ → URL và nội dung lệch nhau.
//
// Cách xử lý: giữ nguyên pathname gốc, chỉ thay đổi phần query. Hàm ở đây thuần và
// test được, không đụng tới window/history.
export interface ListingUrlState {
  pathname: string;
  search: string;
}

// Query param do pageToHref sinh ra cho các filter phụ. Không đụng tới các param
// phạm vi (route sở hữu) vì landing địa phương không bao giờ đặt chúng ở query.
const MANAGED_QUERY_KEYS = [
  'area',
  'district',
  'ward',
  'loai',
  'type',
  'locationSource',
  'legal',
  'q',
  'sort',
  'minPrice',
  'maxPrice',
  'minArea',
  'maxArea',
  'bedrooms',
  'direction',
  'featured',
  'hot',
  'page',
] as const;

// Sinh href mới: pathname giữ nguyên (route vẫn là thẩm quyền phạm vi), query được
// dựng lại từ href do pageToHref trả về. Param không nằm trong allowlist (ví dụ
// tham số tracking của chiến dịch) được giữ lại thay vì bị xóa âm thầm.
export function preserveLocalityPath(current: ListingUrlState, nextHref: string): string {
  if (!current.pathname) return nextHref;
  const nextQueryIndex = nextHref.indexOf('?');
  const nextQuery = nextQueryIndex >= 0 ? nextHref.slice(nextQueryIndex + 1) : '';
  const next = new URLSearchParams(nextQuery);

  // Param hiện có KHÔNG do effect quản lý → giữ nguyên (không mất dấu chiến dịch/UTM).
  const currentQuery = new URLSearchParams(current.search.replace(/^\?/, ''));
  for (const [key, value] of currentQuery) {
    if (!(MANAGED_QUERY_KEYS as readonly string[]).includes(key) && !next.has(key)) {
      next.set(key, value);
    }
  }

  // Giữ thứ tự key ổn định để effect không ghi lại URL y hệt mỗi render.
  next.sort();
  const qs = next.toString();
  return qs ? `${current.pathname}?${qs}` : current.pathname;
}

// URL hiện tại đã là chính href mong muốn chưa (bỏ qua thứ tự key) — tránh gọi
// history.replaceState vô ích và tránh đẩy lịch sử bẩn.
export function isSameListingUrl(current: ListingUrlState, href: string): boolean {
  const [path, query = ''] = href.split('?');
  if (path !== current.pathname) return false;
  const a = new URLSearchParams(current.search.replace(/^\?/, ''));
  const b = new URLSearchParams(query);
  a.sort();
  b.sort();
  return a.toString() === b.toString();
}
