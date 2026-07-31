import { PRICE_RANGES_RENT, PRICE_RANGES_SALE, type Range } from './priceRange';

export type ProductSuggestionFilters = {
  listingType: 'mua_ban' | 'cho_thue';
  areaId?: string;
  minPrice?: number;
  maxPrice?: number;
};

export type ProductSuggestion = {
  label: string;
  filters: ProductSuggestionFilters;
};

type ProductSuggestionSource = {
  listing_type: string | null | undefined;
  area_id: string | null | undefined;
  price: number | null | undefined;
  price_per_month: number | null | undefined;
};

function findPriceRange(ranges: Range[], price: number) {
  return ranges.slice(1).find(range => price >= (range.min ?? 0) && (range.max == null || price < range.max));
}

function filtersKey(filters: ProductSuggestionFilters) {
  return [filters.listingType, filters.areaId ?? '', filters.minPrice ?? '', filters.maxPrice ?? ''].join('|');
}

export function getProductSuggestions(property: ProductSuggestionSource): ProductSuggestion[] {
  if (property.listing_type !== 'mua_ban' && property.listing_type !== 'cho_thue') return [];
  const listingType: ProductSuggestionFilters['listingType'] = property.listing_type;
  const verb = listingType === 'cho_thue' ? 'cho thuê' : 'đang bán';
  const areaId = property.area_id?.trim() || undefined;
  const currentPrice = listingType === 'cho_thue' ? property.price_per_month : property.price;
  const ranges = listingType === 'cho_thue' ? PRICE_RANGES_RENT : PRICE_RANGES_SALE;
  const priceRange = typeof currentPrice === 'number' && Number.isFinite(currentPrice) && currentPrice > 0
    ? findPriceRange(ranges, currentPrice)
    : undefined;
  const suggestions: ProductSuggestion[] = [
    { label: `Xem thêm bất động sản ${verb}`, filters: { listingType } },
    ...(areaId ? [{ label: `Bất động sản ${verb} cùng khu vực`, filters: { listingType, areaId } }] : []),
    ...(priceRange ? [{
      label: `Bất động sản ${verb} ${priceRange.label.toLowerCase()}`,
      filters: { listingType, minPrice: priceRange.min, maxPrice: priceRange.max },
    }] : []),
    ...(areaId && priceRange ? [{
      label: `Bất động sản ${verb} cùng khu vực ${priceRange.label.toLowerCase()}`,
      filters: { listingType, areaId, minPrice: priceRange.min, maxPrice: priceRange.max },
    }] : []),
  ];

  const seen = new Set<string>();
  return suggestions.filter(({ filters }) => {
    const key = filtersKey(filters);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
