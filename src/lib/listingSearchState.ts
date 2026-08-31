import type { SearchIntent } from './aiSearch';
import type { PropertyFilters } from './api/properties';
import type { Page } from './router';

type ListingsPageTarget = Extract<Page, { name: 'listings' }>;

export function buildHomepageListingTarget(input: {
  activeTab: 'mua_ban' | 'cho_thue';
  explicit: Partial<PropertyFilters>;
  intent: SearchIntent;
}): ListingsPageTarget {
  const { activeTab, explicit, intent } = input;
  const inferredListingType = intent.filters.listingType === 'mua_ban' || intent.filters.listingType === 'cho_thue'
    ? intent.filters.listingType
    : undefined;
  const hasExplicitLocation = Boolean(explicit.areaId || explicit.district || explicit.ward);
  const hasInferredLocation = Boolean(intent.filters.areaId || intent.filters.district || intent.filters.ward);
  const keyword = intent.residualKeyword.trim();

  return {
    name: 'listings',
    listingType: inferredListingType ?? activeTab,
    areaId: explicit.areaId || intent.filters.areaId,
    district: explicit.district || intent.filters.district,
    ward: explicit.ward || intent.filters.ward,
    locationSource: !hasExplicitLocation && hasInferredLocation ? 'inferred' : undefined,
    typeId: explicit.typeId || intent.filters.typeId,
    keyword: keyword || undefined,
    minPrice: explicit.minPrice ?? intent.filters.minPrice,
    maxPrice: explicit.maxPrice ?? intent.filters.maxPrice,
  };
}

export function shouldClearInferredLocation(input: {
  locationSource?: 'explicit' | 'inferred';
  initialKeyword: string;
  nextKeyword: string;
}): boolean {
  return input.locationSource === 'inferred' && input.nextKeyword !== input.initialKeyword;
}
