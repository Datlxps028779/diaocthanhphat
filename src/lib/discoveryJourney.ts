export type DiscoveryModule =
  | 'recently_viewed'
  | 'for_you'
  | 'featured'
  | 'related_properties'
  | 'explore_filters'
  | 'related_news'
  | 'saved_search_notice';

export type DiscoverySurface = 'home' | 'listings' | 'property_detail' | 'news';

export type DiscoveryEventProps = {
  surface: DiscoverySurface;
  module: DiscoveryModule;
  position?: number;
  itemCount?: number;
  hasFilters?: boolean;
  listingType?: 'mua_ban' | 'cho_thue';
  source?: string;
};

export type HomeDiscoverySection =
  | 'categories'
  | 'recently_viewed'
  | 'featured_sections'
  | 'region_banners'
  | 'for_you'
  | 'why_us'
  | 'testimonials'
  | 'news'
  | 'faq'
  | 'cta'
  | 'social_proof';

export type HomeDiscoveryAvailability = Partial<Record<HomeDiscoverySection, boolean>>;

const DISCOVERY_EVENT_KEYS = new Set<keyof DiscoveryEventProps>([
  'surface',
  'module',
  'position',
  'itemCount',
  'hasFilters',
  'listingType',
  'source',
]);

export function getHomeDiscoveryOrder(input: {
  configuredOrder: HomeDiscoverySection[];
  availability: HomeDiscoveryAvailability;
  hasRecentlyViewed: boolean;
  hasEnoughTasteSignal: boolean;
}): HomeDiscoverySection[] {
  const seen = new Set<HomeDiscoverySection>();

  return input.configuredOrder.filter(section => {
    if (seen.has(section)) return false;
    seen.add(section);
    if (section === 'recently_viewed') return input.hasRecentlyViewed;
    if (section === 'for_you') return input.hasEnoughTasteSignal;
    return input.availability[section] !== false;
  });
}

export function shouldRenderDiscoverySection(input: {
  itemCount: number;
  isLoading?: boolean;
  showConfiguredEmptyState?: boolean;
}): boolean {
  return input.itemCount > 0 || Boolean(input.isLoading) || Boolean(input.showConfiguredEmptyState);
}

export function getDetailDiscoverySections(input: {
  relatedCount: number;
  filterLabels: string[];
  productSuggestionLabels: string[];
  hasForYou: boolean;
  recentlyViewedCount: number;
}): DiscoveryModule[] {
  const uniqueExploreLabels = new Set([
    ...input.filterLabels.map(label => label.trim().toLocaleLowerCase('vi-VN')).filter(Boolean),
    ...input.productSuggestionLabels.map(label => label.trim().toLocaleLowerCase('vi-VN')).filter(Boolean),
  ]);

  return [
    ...(input.relatedCount > 0 ? ['related_properties' as const] : []),
    ...(uniqueExploreLabels.size > 0 ? ['explore_filters' as const] : []),
    ...(input.hasForYou ? ['for_you' as const] : []),
    ...(input.recentlyViewedCount > 0 ? ['recently_viewed' as const] : []),
  ];
}

export function mergeDiscoveryFilters<T extends { label: string }>(...groups: T[][]): T[] {
  const seen = new Set<string>();
  return groups.flat().filter(item => {
    const key = item.label.trim().toLocaleLowerCase('vi-VN');
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildDiscoveryEventProps(input: DiscoveryEventProps): DiscoveryEventProps {
  const out = {} as DiscoveryEventProps;
  for (const [key, value] of Object.entries(input)) {
    if (!DISCOVERY_EVENT_KEYS.has(key as keyof DiscoveryEventProps) || value === undefined) continue;
    (out as Record<string, string | number | boolean>)[key] = value as string | number | boolean;
  }
  return out;
}
