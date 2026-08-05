import type { Page } from './router';
import { PRICE_RANGES_SALE, PRICE_RANGES_RENT, AREA_RANGES, type Range } from './priceRange';

// Sinh bộ lọc nhanh cho khối "Khám phá thêm lựa chọn phù hợp" trên trang chi tiết:
// mỗi chip mở trang danh sách đã áp sẵn một chiều tương đồng với tin đang xem
// (cùng quận, cùng tầm giá, cùng diện tích...). Thuần, test được.
//
// Chỉ dùng dữ liệu có thật trên tin — chiều nào trống thì bỏ chip đó, không đoán
// giá trị thay thế.

export type SimilarFilterKind = 'district' | 'ward' | 'price' | 'area' | 'bedrooms' | 'legal';

export interface SimilarFilter {
  kind: SimilarFilterKind;
  label: string;
  page: Extract<Page, { name: 'listings' }>;
}

export interface SimilarSource {
  listing_type: 'mua_ban' | 'cho_thue';
  price: number;
  price_unit: string;
  area_sqm: number | null;
  bedrooms: number | null;
  district: string | null;
  ward: string | null;
  city: string;
  area_id: string | null;
  property_type_id: string | null;
  legal_status: string | null;
  direction: string | null;
}

// Bậc chứa giá trị: [min, max) để giá sát mốc rơi vào bậc trên (5 tỷ → 5–10).
// Bỏ bậc "Tất cả" (min và max đều trống) vì nó không thu hẹp gì.
function findBucket(ranges: Range[], value: number): Range | null {
  for (const r of ranges) {
    if (r.min == null && r.max == null) continue;
    const aboveMin = r.min == null || value >= r.min;
    const belowMax = r.max == null || value < r.max;
    if (aboveMin && belowMax) return r;
  }
  return null;
}

export function buildSimilarFilters(source: SimilarSource): SimilarFilter[] {
  const filters: SimilarFilter[] = [];
  // Nền chung: giữ hình thức + khu vực để chip không lọt sang tỉnh/hình thức khác.
  const base = (): Extract<Page, { name: 'listings' }> => {
    const page: Extract<Page, { name: 'listings' }> = { name: 'listings', listingType: source.listing_type };
    if (source.area_id) page.areaId = source.area_id;
    if (source.property_type_id) page.typeId = source.property_type_id;
    return page;
  };

  if (source.district?.trim()) {
    filters.push({ kind: 'district', label: `Cùng khu vực ${source.district.trim()}`, page: { ...base(), district: source.district.trim() } });
  }

  if (Number.isFinite(source.price) && source.price > 0) {
    const ranges = source.listing_type === 'cho_thue' ? PRICE_RANGES_RENT : PRICE_RANGES_SALE;
    const bucket = findBucket(ranges, source.price);
    if (bucket) {
      const page = base();
      if (bucket.min != null) page.minPrice = bucket.min;
      if (bucket.max != null) page.maxPrice = bucket.max;
      filters.push({ kind: 'price', label: `Tầm giá ${bucket.label.toLowerCase()}`, page });
    }
  }

  if (source.area_sqm != null && Number.isFinite(source.area_sqm) && source.area_sqm > 0) {
    const bucket = findBucket(AREA_RANGES, source.area_sqm);
    if (bucket) {
      const page = base();
      if (bucket.min != null) page.minArea = bucket.min;
      if (bucket.max != null) page.maxArea = bucket.max;
      filters.push({ kind: 'area', label: `Diện tích ${bucket.label.toLowerCase()}`, page });
    }
  }

  if (source.bedrooms != null && source.bedrooms > 0) {
    filters.push({ kind: 'bedrooms', label: `${source.bedrooms} phòng ngủ`, page: { ...base(), bedrooms: String(source.bedrooms) } });
  }

  if (source.legal_status?.trim()) {
    filters.push({ kind: 'legal', label: source.legal_status.trim(), page: { ...base(), legal: source.legal_status.trim() } });
  }

  return filters;
}
