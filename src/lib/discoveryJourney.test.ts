import { describe, expect, it } from 'vitest';
import {
  buildDiscoveryEventProps,
  getDetailDiscoverySections,
  getHomeDiscoveryOrder,
  mergeDiscoveryFilters,
  shouldRenderDiscoverySection,
} from './discoveryJourney';

describe('discoveryJourney', () => {
  const configuredOrder = [
    'categories', 'recently_viewed', 'featured_sections', 'region_banners', 'for_you',
    'why_us', 'testimonials', 'news', 'faq', 'cta', 'social_proof',
  ] as const;

  it('does not show personalized or history rails to a new visitor without data', () => {
    expect(getHomeDiscoveryOrder({
      configuredOrder: [...configuredOrder],
      availability: { featured_sections: true, region_banners: true, news: true },
      hasRecentlyViewed: false,
      hasEnoughTasteSignal: false,
    })).not.toContain('recently_viewed');

    expect(getHomeDiscoveryOrder({
      configuredOrder: [...configuredOrder],
      availability: { featured_sections: true, region_banners: true, news: true },
      hasRecentlyViewed: false,
      hasEnoughTasteSignal: false,
    })).not.toContain('for_you');
  });

  it('places continue-browsing before static trust sections for a returning visitor', () => {
    const order = getHomeDiscoveryOrder({
      configuredOrder: [...configuredOrder],
      availability: { featured_sections: true, region_banners: true, news: true },
      hasRecentlyViewed: true,
      hasEnoughTasteSignal: false,
    });

    expect(order.indexOf('recently_viewed')).toBeLessThan(order.indexOf('why_us'));
  });

  it('respects CMS-hidden sections and content unavailable from real data', () => {
    const order = getHomeDiscoveryOrder({
      configuredOrder: configuredOrder.filter(section => section !== 'news'),
      availability: { featured_sections: false, region_banners: true },
      hasRecentlyViewed: false,
      hasEnoughTasteSignal: false,
    });

    expect(order).not.toContain('news');
    expect(order).not.toContain('featured_sections');
    expect(order).toContain('region_banners');
  });

  it('preserves the configured CMS sequence while filtering unavailable sections', () => {
    const order = getHomeDiscoveryOrder({
      configuredOrder: ['news', 'for_you', 'categories', 'recently_viewed', 'featured_sections', 'news'],
      availability: { news: true, featured_sections: false },
      hasRecentlyViewed: true,
      hasEnoughTasteSignal: true,
    });

    expect(order).toEqual(['news', 'for_you', 'categories', 'recently_viewed']);
  });

  it('only permits an empty discovery section when its configuration explicitly asks for one', () => {
    expect(shouldRenderDiscoverySection({ itemCount: 0 })).toBe(false);
    expect(shouldRenderDiscoverySection({ itemCount: 0, isLoading: true })).toBe(true);
    expect(shouldRenderDiscoverySection({ itemCount: 0, showConfiguredEmptyState: true })).toBe(true);
  });

  it('orders detail discovery rails by their distinct browsing purpose', () => {
    expect(getDetailDiscoverySections({
      relatedCount: 4,
      filterLabels: ['Cùng khu vực Dĩ An'],
      productSuggestionLabels: ['Bất động sản đang bán cùng khu vực'],
      hasForYou: true,
      recentlyViewedCount: 2,
    })).toEqual(['related_properties', 'explore_filters', 'for_you', 'recently_viewed']);
  });

  it('deduplicates equivalent discovery filter labels', () => {
    expect(mergeDiscoveryFilters(
      [{ label: 'Cùng khu vực Dĩ An' }],
      [{ label: '  cùng khu vực dĩ an  ' }, { label: 'Tầm giá 2–3 tỷ' }],
    )).toEqual([
      { label: 'Cùng khu vực Dĩ An' },
      { label: 'Tầm giá 2–3 tỷ' },
    ]);
  });

  it('keeps only allowed scalar telemetry fields', () => {
    expect(buildDiscoveryEventProps({
      surface: 'home',
      module: 'recently_viewed',
      itemCount: 3,
      source: 'home_rail',
      // @ts-expect-error Ensure raw browsing data cannot enter the event contract.
      title: 'Không được gửi',
    })).toEqual({
      surface: 'home',
      module: 'recently_viewed',
      itemCount: 3,
      source: 'home_rail',
    });
  });
});
