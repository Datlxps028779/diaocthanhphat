import type { Page } from './router';

// Bộ lọc lưu kèm một saved search. Là tập con "có thể tuần tự hóa" của state
// filter trong ListingsPage — chỉ giữ tiêu chí tìm, không giữ page/viewMode.
export interface SavedFilters {
  listingType?: 'mua_ban' | 'cho_thue';
  areaId?: string;
  typeId?: string;
  district?: string;
  ward?: string;
  keyword?: string;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  bedrooms?: string;
  direction?: string;
  legal?: string;
  sort?: string;
}

const CADENCES = ['instant', 'daily', 'weekly'] as const;
export type AlertCadence = (typeof CADENCES)[number];

export function isAlertCadence(v: unknown): v is AlertCadence {
  return typeof v === 'string' && (CADENCES as readonly string[]).includes(v);
}

export const CADENCE_LABELS: Record<AlertCadence, string> = {
  instant: 'Ngay khi có tin',
  daily: 'Hàng ngày',
  weekly: 'Hàng tuần',
};

// Loại bỏ khóa undefined/rỗng để filters jsonb gọn và round-trip ổn định.
export function normalizeFilters(f: SavedFilters): SavedFilters {
  const out: SavedFilters = {};
  if (f.listingType) out.listingType = f.listingType;
  if (f.areaId) out.areaId = f.areaId;
  if (f.typeId) out.typeId = f.typeId;
  if (f.district) out.district = f.district;
  if (f.ward) out.ward = f.ward;
  if (f.keyword) out.keyword = f.keyword;
  if (f.minPrice != null) out.minPrice = f.minPrice;
  if (f.maxPrice != null) out.maxPrice = f.maxPrice;
  if (f.minArea != null) out.minArea = f.minArea;
  if (f.maxArea != null) out.maxArea = f.maxArea;
  if (f.bedrooms) out.bedrooms = f.bedrooms;
  if (f.direction) out.direction = f.direction;
  if (f.legal) out.legal = f.legal;
  if (f.sort) out.sort = f.sort;
  return out;
}

// Chuyển filters đã lưu → Page listings để điều hướng khi bấm "Xem lại".
export function filtersToPage(f: SavedFilters): Page {
  const n = normalizeFilters(f);
  return { name: 'listings', ...n };
}

export function hasSavedSearchCriteria(f: SavedFilters): boolean {
  const n = normalizeFilters(f);
  return !!(
    n.listingType || n.areaId || n.typeId || n.district || n.ward || n.keyword ||
    n.minPrice != null || n.maxPrice != null || n.minArea != null || n.maxArea != null ||
    n.bedrooms || n.direction || n.legal
  );
}

export interface SavedSearchLabels {
  areas?: Record<string, string>;
  types?: Record<string, string>;
}

// Tên hiển thị gợi ý từ filters. Ưu tiên nhãn taxonomy (area/type) nếu có,
// nếu không rơi về keyword / khu vực text / khoảng giá. Kết quả người dùng
// vẫn sửa được trước khi lưu.
export function buildSearchName(f: SavedFilters, labels: SavedSearchLabels = {}): string {
  const n = normalizeFilters(f);
  const parts: string[] = [];

  const typeLabel = n.typeId ? labels.types?.[n.typeId] : undefined;
  if (typeLabel) parts.push(typeLabel);

  if (n.keyword) parts.push(`"${n.keyword}"`);

  const areaLabel = n.areaId ? labels.areas?.[n.areaId] : undefined;
  const place = n.ward || n.district || areaLabel;
  if (place) parts.push(place);

  if (n.minPrice != null || n.maxPrice != null) {
    if (n.minPrice != null && n.maxPrice != null) parts.push(`${n.minPrice}-${n.maxPrice} tỷ`);
    else if (n.maxPrice != null) parts.push(`dưới ${n.maxPrice} tỷ`);
    else parts.push(`trên ${n.minPrice} tỷ`);
  }

  if (n.bedrooms) parts.push(`${n.bedrooms} PN`);

  if (parts.length === 0) {
    return n.listingType === 'cho_thue' ? 'Tin cho thuê' : 'Tin mua bán';
  }
  const prefix = n.listingType === 'cho_thue' ? 'Thuê: ' : '';
  return (prefix + parts.join(' · ')).slice(0, 120);
}
