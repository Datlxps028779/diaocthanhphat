import type { ListingInitialFilters } from './api/properties';

function text(value: string | undefined): string {
  return value ?? '';
}

function sameStringArray(left: string[] | undefined, right: string[] | undefined): boolean {
  const a = [...(left ?? [])].sort();
  const b = [...(right ?? [])].sort();
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export function listingInitialDataScopeMatches(
  scope: ListingInitialFilters | undefined,
  current: ListingInitialFilters,
): boolean {
  if (!scope || current.typeSlug) return false;

  return text(scope.listingType) === text(current.listingType)
    && text(scope.areaId) === text(current.areaId)
    && text(scope.typeId) === text(current.typeId)
    && sameStringArray(scope.typeIds, current.typeIds)
    && text(scope.typePathSlug) === text(current.typePathSlug)
    && text(scope.city) === text(current.city)
    && text(scope.district) === text(current.district)
    && text(scope.ward) === text(current.ward)
    // Phạm vi địa phương do route quyết định: seed chỉ hợp lệ khi ID hành chính và
    // khoảng giá bán khớp CHÍNH XÁC. Thiếu sót ở đây là hiện tin ngoài phạm vi đã chọn.
    && text(scope.districtId) === text(current.districtId)
    && text(scope.wardId) === text(current.wardId)
    && text(scope.salePriceBand) === text(current.salePriceBand)
    && text(scope.keyword) === text(current.keyword)
    && scope.minPrice === current.minPrice
    && scope.maxPrice === current.maxPrice
    && scope.minArea === current.minArea
    && scope.maxArea === current.maxArea
    && text(scope.bedrooms) === text(current.bedrooms)
    && text(scope.direction) === text(current.direction)
    && text(scope.legal) === text(current.legal)
    && Boolean(scope.isFeatured) === Boolean(current.isFeatured)
    && Boolean(scope.isHot) === Boolean(current.isHot)
    && (scope.sort ?? 'newest') === (current.sort ?? 'newest')
    && (scope.page ?? 1) === (current.page ?? 1);
}
