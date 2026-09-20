import type { PropertyFilters } from './api/properties';
import type { LocalityPriceBand } from './localityListingScope';
import type { Page } from './router';

// Các builder thuần cho việc SỬA phạm vi landing địa phương. Tách khỏi ListingsPage để
// kiểm thử được (component không render trong vitest) và để "quyết định" không lẫn với
// "gọi setState". Không đọc queryKeys, không phụ thuộc React.

export interface LocalityPriceRange {
  min?: number;
  max?: number;
}

export interface LocalityScopeFacts {
  areaId: string;
  districtId?: string;
  wardId?: string;
  districtName?: string;
  wardName?: string;
  areaName?: string;
  typeIds?: string[];
  typePathSlug?: string;
  listingType?: 'mua_ban' | 'cho_thue';
  priceBand?: LocalityPriceBand;
  // Bộ lọc KHÔNG thuộc phạm vi, người dùng đã chọn trước đó — phải đi theo sang URL nền
  // để không mất ngữ cảnh. typeId/minPrice/maxPrice ở đây là chiều đến từ QUERY, không
  // phải từ path: route không sở hữu chúng, nên chúng phải sống sót qua việc đổi địa lý.
  copy: {
    keyword?: string;
    typeId?: string;
    minPrice?: number;
    maxPrice?: number;
    minArea?: number;
    maxArea?: number;
    bedrooms?: string;
    direction?: string;
    legal?: string;
    sort?: string;
    isFeatured?: boolean;
    isHot?: boolean;
    page?: number;
  };
}

// Điều kiện lọc theo địa lý: ID là hợp đồng route, tên chỉ là bản sao denormalized.
// Khi đã có ID thì BỎ điều kiện theo tên — bản ghi mang nhãn cũ (quận đổi tên, phường
// sáp nhập) vẫn có ID đúng, thêm `district=<tên>` sẽ làm mất dòng đúng phạm vi.
export function localityScopeFilterPatch(input: {
  districtId?: string;
  wardId?: string;
  district?: string;
  ward?: string;
  typeId?: string;
  typeIds?: string[];
  hasRouteTypeIds?: boolean;
  salePriceBand?: LocalityPriceBand;
  districtIdPresent?: boolean;
  wardIdPresent?: boolean;
}): Partial<PropertyFilters> {
  const patch: Partial<PropertyFilters> = {};
  if (input.typeIds?.length) {
    // Route chốt nhóm loại: typeId lẻ bị bỏ để không chồng hai hợp đồng loại.
    patch.typeIds = input.typeIds;
  } else if (input.typeId && !input.hasRouteTypeIds) {
    patch.typeId = input.typeId;
  }
  if (input.districtId) patch.districtId = input.districtId;
  else if (input.district) patch.district = input.district;
  if (input.wardId) patch.wardId = input.wardId;
  else if (input.ward) patch.ward = input.ward;
  if (input.salePriceBand) patch.salePriceBand = input.salePriceBand;
  return patch;
}

export type LocalityGeographyEdit =
  | { kind: 'area'; id: string; name?: string }
  | { kind: 'district'; id: string; name?: string }
  | { kind: 'ward'; id: string; name?: string }
  | { kind: 'type'; id: string; typeIds?: string[]; typePathSlug?: string }
  | { kind: 'price'; priceRange?: LocalityPriceRange }
  | { kind: 'listingType'; listingType?: 'mua_ban' | 'cho_thue' };

// Chiều mà ROUTE thực sự sở hữu — quyết định bởi cái gì có trên PATH, không phải bởi
// sự tồn tại của prop scope. Một URL như /mua-ban/a?minPrice=2 vẫn nằm trong landing
// (route sở hữu tỉnh) nhưng khoảng giá là query của người dùng, không phải của route:
// nếu effect coi nó là chiều của route rồi xóa khỏi URL thì refresh sẽ mất bộ lọc.
//
// Bảng giá bán (/gia/) và segment loại (/loai/) là chiều route khai tường minh.
export interface LocalityOwnedDimensions {
  area: boolean;
  district: boolean;
  ward: boolean;
  type: boolean;
  price: boolean;
  listingType: boolean;
}

export function localityScopeOwnedDimensions(scope: {
  path: string;
  areaId?: string;
  districtId?: string;
  wardId?: string;
  typeIds?: string[];
  typePathSlug?: string;
  priceBand?: string;
}): LocalityOwnedDimensions {
  const segments = scope.path.split('/').filter(Boolean);
  const hasTypeSegment = segments.includes('loai') || Boolean(scope.typePathSlug);
  const hasPriceSegment = segments.includes('gia') || Boolean(scope.priceBand);
  return {
    // Địa lý: theo cấp mà scope đã resolve được ID.
    area: Boolean(scope.areaId),
    district: Boolean(scope.districtId),
    ward: Boolean(scope.wardId),
    // Loại/giá: chỉ khi PATH khai tường minh. typeIds đơn thuần không tính — chúng có
    // thể đến từ nơi gọi khác mà không biến route thành chủ sở hữu chiều loại.
    type: hasTypeSegment,
    price: hasPriceSegment,
    listingType: true,
  };
}

export interface LocalitySelectState {  areaId: string;
  areaName?: string;
  districtId: string;
  districtName?: string;
  wardId: string;
  wardName?: string;
}

// Sửa một chiều địa lý/loại/giá trong lúc vẫn ở landing: giữ nguyên các cấp CHA, bỏ các
// cấp CON không còn tương thích. Bỏ phường mà quên tỉnh/quận sẽ biến phạm vi thành "địa
// lý cùng tên trên toàn quốc" — đúng loại lỗi âm thầm cần chặn.
export function localityScopeSelectPatch(
  current: LocalitySelectState,
  edit: LocalityGeographyEdit,
): Partial<Extract<Page, { name: 'listings' }>> {
  const keepGeography = () => {
    const base: Partial<Extract<Page, { name: 'listings' }>> = { areaId: current.areaId };
    if (current.districtId) base.district = current.districtName || current.districtId;
    if (current.wardId) base.ward = current.wardName || current.wardId;
    return base;
  };
  switch (edit.kind) {
    case 'area': {
      // Đổi/bỏ tỉnh kéo theo bỏ quận + phường cũ.
      const base: Partial<Extract<Page, { name: 'listings' }>> = {};
      if (edit.id) base.areaId = edit.id;
      return base;
    }
    case 'district': {
      const base: Partial<Extract<Page, { name: 'listings' }>> = { areaId: current.areaId };
      if (edit.id) base.district = edit.name || edit.id;
      return base;
    }
    case 'ward': {
      const base: Partial<Extract<Page, { name: 'listings' }>> = { areaId: current.areaId };
      if (current.districtId) base.district = current.districtName || current.districtId;
      if (edit.id) base.ward = edit.name || edit.id;
      return base;
    }
    case 'type': {
      const base = keepGeography();
      if (edit.id) base.typeId = edit.id;
      return base;
    }
    case 'price':
      return keepGeography();
    case 'listingType': {
      const base = keepGeography();
      if (edit.listingType) base.listingType = edit.listingType;
      return base;
    }
  }
}

// Patch cho state ban đầu sau khi RỜI landing: mọi chiều thuộc phạm vi cũ đều bị bỏ,
// chỉ còn hình thức giao dịch người dùng chọn và (tuỳ chọn) khoảng giá họ vừa chọn.
// `priceRange` do nơi gọi chọn theo hình thức giao dịch — không hardcode bảng giá bán.
export function localityScopeInitialPatch(input: {
  listingType?: 'mua_ban' | 'cho_thue';
  priceRange?: LocalityPriceRange;
  fillAreaSqm: boolean;
}): {
  listingType?: 'mua_ban' | 'cho_thue';
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
} {
  const patch: {
    listingType?: 'mua_ban' | 'cho_thue';
    minPrice?: number;
    maxPrice?: number;
    minArea?: number;
    maxArea?: number;
  } = {};
  if (input.listingType) patch.listingType = input.listingType;
  if (input.priceRange) {
    if (input.priceRange.min !== undefined) patch.minPrice = input.priceRange.min;
    if (input.priceRange.max !== undefined) patch.maxPrice = input.priceRange.max;
  }
  if (input.fillAreaSqm && input.priceRange) {
    if (input.priceRange.min !== undefined) patch.minArea = input.priceRange.min;
    if (input.priceRange.max !== undefined) patch.maxArea = input.priceRange.max;
  }
  return patch;
}

// Ngữ cảnh điều hướng khi rời landing vì người dùng chạm vào một chiều của phạm vi:
// giữ các cấp địa lý cha + mọi bộ lọc ngoài phạm vi, bỏ chiều KHÔNG tương thích với lựa
// chọn mới (loại cũ, band giá bán cũ khi đổi hình thức giao dịch).
export function localityScopeEditPatch(
  facts: LocalityScopeFacts,
  edit: LocalityGeographyEdit,
): Partial<Extract<Page, { name: 'listings' }>> {
  const patch: Partial<Extract<Page, { name: 'listings' }>> = {};
  if (facts.copy.keyword) patch.keyword = facts.copy.keyword;
  if (facts.copy.minArea !== undefined) patch.minArea = facts.copy.minArea;
  if (facts.copy.maxArea !== undefined) patch.maxArea = facts.copy.maxArea;
  if (facts.copy.bedrooms) patch.bedrooms = facts.copy.bedrooms;
  if (facts.copy.direction) patch.direction = facts.copy.direction;
  if (facts.copy.legal) patch.legal = facts.copy.legal;
  if (facts.copy.sort && facts.copy.sort !== 'newest') patch.sort = facts.copy.sort;
  if (facts.copy.isFeatured) patch.isFeatured = true;
  if (facts.copy.isHot) patch.isHot = true;
  // KHÔNG mang `page` sang: đổi phạm vi là đổi tập kết quả, giữ trang cũ sẽ trỏ vào
  // trang 4 của một danh sách khác (hoặc rỗng). Bỏ hẳn khoá ⇒ pageToHref không phát ra
  // ?page= ⇒ về trang 1.

  // Chiều đến từ QUERY mà route không sở hữu. Mặc định giữ nguyên; chỉ nhánh nào thay
  // thế chúng (price, listingType) mới bỏ/ghi đè.
  const queryTypeId = edit.kind === 'type' ? edit.id : facts.copy.typeId;
  const keepQueryPrice = edit.kind !== 'price' && edit.kind !== 'listingType';

  const listingType = edit.kind === 'listingType' ? edit.listingType : facts.listingType;
  if (listingType) patch.listingType = listingType;

  // Địa lý cha dùng chung cho mọi nhánh không đổi cấp chính nó.
  const geography = () => {
    patch.areaId = facts.areaId;
    if (facts.districtName || facts.districtId) patch.district = facts.districtName || facts.districtId;
    if (facts.wardName || facts.wardId) patch.ward = facts.wardName || facts.wardId;
  };

  switch (edit.kind) {
    case 'area': {
      if (edit.id) patch.areaId = edit.id;
      // Đổi tỉnh → bỏ quận/phường cũ.
      break;
    }
    case 'district': {
      patch.areaId = facts.areaId;
      if (edit.id) patch.district = edit.name || edit.id;
      break;
    }
    case 'ward': {
      patch.areaId = facts.areaId;
      if (facts.districtName || facts.districtId) patch.district = facts.districtName || facts.districtId;
      if (edit.id) patch.ward = edit.name || edit.id;
      break;
    }
    case 'type': {
      geography();
      // Nhóm loại của route không còn áp dụng; loại query đã được thay bằng edit.id.
      break;
    }
    case 'price': {
      geography();
      if (edit.priceRange?.min !== undefined) patch.minPrice = edit.priceRange.min;
      if (edit.priceRange?.max !== undefined) patch.maxPrice = edit.priceRange.max;
      // Bảng giá chung thay cho band của route → bỏ band cũ (không ghi salePriceBand).
      break;
    }
    case 'listingType': {
      geography();
      // Khoảng giá bị bỏ: giá thuê (triệu/tháng) và giá bán (tỷ) khác đơn vị.
      break;
    }
  }

  if (queryTypeId) patch.typeId = queryTypeId;
  if (keepQueryPrice) {
    if (facts.copy.minPrice !== undefined) patch.minPrice = facts.copy.minPrice;
    if (facts.copy.maxPrice !== undefined) patch.maxPrice = facts.copy.maxPrice;
  }
  return patch;
}

export function localityScopeEditNeedsNavigation(
  owned: LocalityOwnedDimensions,
  current: Pick<LocalityScopeFacts, 'areaId' | 'districtName' | 'wardName'>,
  edit: LocalityGeographyEdit,
): boolean {
  switch (edit.kind) {
    case 'listingType': return true;
    case 'area': return owned.area && edit.id !== current.areaId;
    case 'district': return owned.district && (edit.name || edit.id) !== (current.districtName || '');
    case 'ward': return owned.ward && (edit.name || edit.id) !== (current.wardName || '');
    case 'type': return owned.type;
    case 'price': return owned.price;
  }
}

export interface LocalityQueryPriceRange {
  minPrice?: number;
  maxPrice?: number;
}

export function localityQueryPriceRange(
  filters: LocalityQueryPriceRange | undefined,
  options?: { routeOwnsPrice?: boolean },
): LocalityQueryPriceRange {
  if (options?.routeOwnsPrice || !filters) return {};
  const range: LocalityQueryPriceRange = {};
  if (typeof filters.minPrice === 'number' && Number.isFinite(filters.minPrice) && filters.minPrice >= 0) range.minPrice = filters.minPrice;
  if (typeof filters.maxPrice === 'number' && Number.isFinite(filters.maxPrice) && filters.maxPrice >= 0) range.maxPrice = filters.maxPrice;
  return range;
}

// Khoá mà route sở hữu. `searchIntent` suy ra từ từ khóa KHÔNG được ghi đè chúng: người
// dùng gõ "Hà Nội" trong ô tìm kiếm ở landing Bình Dương không có nghĩa là đổi phạm vi —
// muốn đổi thì phải điều hướng.
const SCOPE_OWNED_KEYS = [
  'areaId', 'districtId', 'wardId', 'district', 'ward',
  'typeId', 'typeIds', 'typePathSlug',
  'minPrice', 'maxPrice', 'salePriceBand',
] as const;

export function confineIntentFilters<T extends Partial<PropertyFilters>>(
  intentFilters: T | undefined,
  options: { hasRouteIds: boolean },
): Partial<PropertyFilters> {
  if (!intentFilters) return {};
  if (!options.hasRouteIds) return intentFilters;
  const confined: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(intentFilters)) {
    if (value === undefined) continue;
    if ((SCOPE_OWNED_KEYS as readonly string[]).includes(key)) continue;
    confined[key] = value;
  }
  return confined as Partial<PropertyFilters>;
}
