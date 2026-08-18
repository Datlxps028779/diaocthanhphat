import { categoryToSlug } from './newsCategories';
import { buildAreaListingPath } from './areaPath';
import type { ListingInitialFilters, PropertySort } from './api/properties';

// Taxonomy tối thiểu để map areaId→slug (+ district tên→slug) khi sinh path SEO.
// Truyền tùy chọn: có thì sinh path /cho-thue/binh-duong/di-an; không thì giữ query cũ.
export interface HrefTaxonomy {
  areas: { id: string; slug: string }[];
  districts: { slug: string; name: string; area_id: string }[];
  // Cho phép sinh URL lọc loại BĐS bằng slug (?loai=dat-nen) thay UUID.
  propertyTypes?: { id: string; slug: string }[];
}

export type Page =
  | { name: 'home' }
  | {
      name: 'listings';
      listingType?: 'mua_ban' | 'cho_thue';
      areaId?: string; typeId?: string; district?: string; ward?: string; keyword?: string;
      minPrice?: number; maxPrice?: number; minArea?: number; maxArea?: number;
      bedrooms?: string; direction?: string; legal?: string;
      isFeatured?: boolean; isHot?: boolean; sort?: string; page?: number;
    }
  | { name: 'property'; id: string; slug?: string }
  | { name: 'projects'; areaId?: string; phase?: string }
  | { name: 'invest' }
  | { name: 'regions'; areaId?: string }
  | { name: 'news'; articleId?: string; slug?: string; category?: string }
  | { name: 'about' }
  | { name: 'valuation' }
  | { name: 'compare' }
  | { name: 'post-listing'; id?: string }
  | { name: 'my-listings' }
  | { name: 'account' }
  | { name: 'quantri-login' }
  | { name: 'quantri'; tab?: string };

export function scrollTop() {
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
}

export const ADMIN_PATH = '/quantrihethong';
export const LISTINGS_PER_PAGE = 16;

// Đọc ngược query string của trang danh sách (Next App Router truyền searchParams
// dạng Record<string, string | string[]>) → mảnh filter để seed initialFilters.
// Là chiều nghịch của phần 'listings' trong pageToHref.
type RawSearchParams = Record<string, string | string[] | undefined> | undefined;
export function parseListingParams(sp: RawSearchParams): ListingInitialFilters {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const num = (v: string | string[] | undefined) => {
    const s = first(v);
    if (s == null) return undefined;
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };
  const out: ListingInitialFilters = {};
  const area = first(sp?.area);
  const type = first(sp?.type);
  const typeSlug = first(sp?.loai);
  const district = first(sp?.district);
  const ward = first(sp?.ward);
  const legal = first(sp?.legal);
  const keyword = first(sp?.q);
  const allowedSorts: PropertySort[] = ['newest', 'price_asc', 'price_desc', 'views', 'relevance'];
  const sort = first(sp?.sort);
  const minPrice = num(sp?.minPrice);
  const maxPrice = num(sp?.maxPrice);
  const minArea = num(sp?.minArea);
  const maxArea = num(sp?.maxArea);
  const bedrooms = first(sp?.bedrooms);
  const direction = first(sp?.direction);
  const page = num(sp?.page);
  if (area) out.areaId = area;
  if (type) out.typeId = type;
  // ?loai=<slug> là dạng mới; trang danh sách tra slug→id qua taxonomy. Vẫn đọc
  // ?type=<uuid> để link cũ đã share/index không vỡ.
  if (typeSlug) out.typeSlug = typeSlug;
  if (district) out.district = district;
  if (ward) out.ward = ward;
  if (legal) out.legal = legal;
  if (keyword) out.keyword = keyword;
  if (sort && allowedSorts.includes(sort as PropertySort)) out.sort = sort as PropertySort;
  if (minPrice != null) out.minPrice = minPrice;
  if (maxPrice != null) out.maxPrice = maxPrice;
  if (minArea != null) out.minArea = minArea;
  if (maxArea != null) out.maxArea = maxArea;
  if (bedrooms) out.bedrooms = bedrooms;
  if (direction) out.direction = direction;
  if (first(sp?.featured) === '1') out.isFeatured = true;
  if (first(sp?.hot) === '1') out.isHot = true;
  if (page != null && page > 1) out.page = page;
  return out;
}

// Chiều nghịch của phần 'projects' trong pageToHref: ?area=<slug>&phase=<label>.
export function parseProjectParams(sp: RawSearchParams): { area?: string; phase?: string } {
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const out: { area?: string; phase?: string } = {};
  const area = first(sp?.area);
  const phase = first(sp?.phase);
  if (area) out.area = area;
  if (phase) out.phase = phase;
  return out;
}

// Ánh xạ một Page → URL path. Là nguồn chân lý duy nhất cho điều hướng trong Next
// (thay window.history.pushState của SPA cũ). Dùng cho <Link> và router.push.
export function pageToHref(page: Page, taxonomy?: HrefTaxonomy): string {
  switch (page.name) {
    case 'home': return '/';
    case 'property': return `/bat-dong-san/${(page.slug && page.slug.trim()) || page.id}`;
    case 'news':
      if (page.slug) return `/tin-tuc/${page.slug}`;
      if (page.articleId) return `/tin-tuc/${page.articleId}`;
      if (page.category && page.category !== 'Tất cả') {
        const catSlug = categoryToSlug(page.category);
        if (catSlug) return `/tin-tuc/danh-muc/${catSlug}`;
        return `/tin-tuc?category=${encodeURIComponent(page.category)}`;
      }
      return '/tin-tuc';
    case 'listings': {
      // Sinh path SEO /{lt}/{areaSlug}/{districtSlug?} khi: có taxonomy + areaId map được
      // sang slug + listingType ∈ {mua_ban, cho_thue}. Ngược lại giữ base query cũ
      // (middleware lo 301). area/district đã lên path → không lặp lại ở query.
      let base = page.listingType === 'mua_ban' ? '/mua-ban'
        : page.listingType === 'cho_thue' ? '/cho-thue'
        : '/danh-sach';
      let areaOnPath = false;
      let districtOnPath = false;
      if (taxonomy && page.areaId && (page.listingType === 'mua_ban' || page.listingType === 'cho_thue')) {
        const area = taxonomy.areas.find(a => a.id === page.areaId);
        if (area) {
          // district lưu theo TÊN trong Page → tra slug qua districts (lọc theo area).
          const district = page.district
            ? taxonomy.districts.find(d => d.area_id === page.areaId && d.name === page.district)
            : undefined;
          base = buildAreaListingPath({
            listingType: page.listingType,
            areaSlug: area.slug,
            districtSlug: district?.slug,
          });
          areaOnPath = true;
          districtOnPath = Boolean(district);
        }
      }
      const q = new URLSearchParams();
      if (page.areaId && !areaOnPath) q.set('area', page.areaId);
      // Ưu tiên slug thân thiện (?loai=dat-nen) khi tra được; không có taxonomy thì
      // giữ ?type=<uuid> như cũ để không vỡ chỗ gọi chưa truyền propertyTypes.
      if (page.typeId) {
        const typeSlug = taxonomy?.propertyTypes?.find(t => t.id === page.typeId)?.slug;
        if (typeSlug) q.set('loai', typeSlug); else q.set('type', page.typeId);
      }
      if (page.district && !districtOnPath) q.set('district', page.district);
      if (page.ward) q.set('ward', page.ward);
      if (page.legal) q.set('legal', page.legal);
      if (page.keyword) q.set('q', page.keyword);
      if (page.sort) q.set('sort', page.sort);
      if (page.minPrice != null) q.set('minPrice', String(page.minPrice));
      if (page.maxPrice != null) q.set('maxPrice', String(page.maxPrice));
      if (page.minArea != null) q.set('minArea', String(page.minArea));
      if (page.maxArea != null) q.set('maxArea', String(page.maxArea));
      if (page.bedrooms) q.set('bedrooms', page.bedrooms);
      if (page.direction) q.set('direction', page.direction);
      if (page.isFeatured) q.set('featured', '1');
      if (page.isHot) q.set('hot', '1');
      if (page.page != null && page.page > 1) q.set('page', String(page.page));
      const qs = q.toString();
      return qs ? `${base}?${qs}` : base;
    }
    case 'projects': {
      const q = new URLSearchParams();
      if (page.areaId) q.set('area', page.areaId);
      if (page.phase) q.set('phase', page.phase);
      const qs = q.toString();
      return qs ? `/du-an?${qs}` : '/du-an';
    }
    case 'invest': return '/dau-tu';
    case 'regions': return '/khu-vuc';
    case 'about': return '/ve-chung-toi';
    case 'valuation': return '/dinh-gia';
    case 'compare': return '/so-sanh';
    case 'post-listing': return page.id ? `/dang-tin?id=${page.id}` : '/dang-tin';
    case 'my-listings': return '/tin-cua-toi';
    case 'account': return '/tai-khoan';
    case 'quantri-login':
    case 'quantri': return ADMIN_PATH;
    default: return '/';
  }
}
