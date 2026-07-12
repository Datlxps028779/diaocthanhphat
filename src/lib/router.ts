export type Page =
  | { name: 'home' }
  | {
      name: 'listings';
      listingType?: 'mua_ban' | 'cho_thue';
      areaId?: string; typeId?: string; district?: string; ward?: string; keyword?: string;
      minPrice?: number; maxPrice?: number; minArea?: number; maxArea?: number;
      bedrooms?: string; direction?: string; legal?: string;
      isFeatured?: boolean; isHot?: boolean; sort?: string;
    }
  | { name: 'property'; id: string; slug?: string }
  | { name: 'projects'; areaId?: string; phase?: string }
  | { name: 'invest' }
  | { name: 'regions'; areaId?: string }
  | { name: 'news'; articleId?: string; slug?: string; category?: string }
  | { name: 'about' }
  | { name: 'valuation' }
  | { name: 'compare' }
  | { name: 'post-listing' }
  | { name: 'my-listings' }
  | { name: 'account' }
  | { name: 'quantri-login' }
  | { name: 'quantri'; tab?: string };

export function scrollTop() {
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
}

export const ADMIN_PATH = '/quantrihethong';

// Đọc ngược query string của trang danh sách (Next App Router truyền searchParams
// dạng Record<string, string | string[]>) → mảnh filter để seed initialFilters.
// Là chiều nghịch của phần 'listings' trong pageToHref.
type RawSearchParams = Record<string, string | string[] | undefined> | undefined;
export function parseListingParams(sp: RawSearchParams): { areaId?: string; typeId?: string; district?: string; ward?: string; legal?: string } {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const out: { areaId?: string; typeId?: string; district?: string; ward?: string; legal?: string } = {};
  const area = first(sp?.area);
  const type = first(sp?.type);
  const district = first(sp?.district);
  const ward = first(sp?.ward);
  const legal = first(sp?.legal);
  if (area) out.areaId = area;
  if (type) out.typeId = type;
  if (district) out.district = district;
  if (ward) out.ward = ward;
  if (legal) out.legal = legal;
  return out;
}

// Ánh xạ một Page → URL path. Là nguồn chân lý duy nhất cho điều hướng trong Next
// (thay window.history.pushState của SPA cũ). Dùng cho <Link> và router.push.
export function pageToHref(page: Page): string {
  switch (page.name) {
    case 'home': return '/';
    case 'property': return `/bat-dong-san/${(page.slug && page.slug.trim()) || page.id}`;
    case 'news':
      return page.slug ? `/tin-tuc/${page.slug}` : (page.articleId ? `/tin-tuc/${page.articleId}` : '/tin-tuc');
    case 'listings': {
      const base = page.listingType === 'mua_ban' ? '/mua-ban'
        : page.listingType === 'cho_thue' ? '/cho-thue'
        : '/danh-sach';
      const q = new URLSearchParams();
      if (page.areaId) q.set('area', page.areaId);
      if (page.typeId) q.set('type', page.typeId);
      if (page.district) q.set('district', page.district);
      if (page.ward) q.set('ward', page.ward);
      if (page.legal) q.set('legal', page.legal);
      const qs = q.toString();
      return qs ? `${base}?${qs}` : base;
    }
    case 'projects': return '/du-an';
    case 'invest': return '/dau-tu';
    case 'regions': return '/khu-vuc';
    case 'about': return '/ve-chung-toi';
    case 'valuation': return '/dinh-gia';
    case 'compare': return '/so-sanh';
    case 'post-listing': return '/dang-tin';
    case 'my-listings': return '/tin-cua-toi';
    case 'account': return '/tai-khoan';
    case 'quantri-login':
    case 'quantri': return ADMIN_PATH;
    default: return '/';
  }
}
