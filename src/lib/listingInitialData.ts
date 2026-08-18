import type { ListingInitialFilters } from './api/properties';

function text(value: string | undefined): string {
  return value ?? '';
}

export function listingInitialDataScopeMatches(
  scope: ListingInitialFilters | undefined,
  current: ListingInitialFilters,
): boolean {
  if (!scope || current.typeSlug) return false;

  return text(scope.listingType) === text(current.listingType)
    && text(scope.areaId) === text(current.areaId)
    && text(scope.typeId) === text(current.typeId)
    && text(scope.city) === text(current.city)
    && text(scope.district) === text(current.district)
    && text(scope.ward) === text(current.ward)
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
