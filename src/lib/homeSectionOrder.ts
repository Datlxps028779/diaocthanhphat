import type { HomeDiscoverySection } from './discoveryJourney';

export const DEFAULT_HOME_ORDER: HomeDiscoverySection[] = ['categories', 'timeline', 'region_banners', 'featured_sections', 'for_you', 'news', 'why_us', 'testimonials', 'faq', 'cta', 'social_proof'];

export function getHomepageSectionOrder(rows: { id: string; is_visible: boolean; order_index: number }[]): HomeDiscoverySection[] {
  if (!rows.length) return [...DEFAULT_HOME_ORDER];
  const order = [...rows].sort((a, b) => a.order_index - b.order_index || DEFAULT_HOME_ORDER.indexOf(a.id as HomeDiscoverySection) - DEFAULT_HOME_ORDER.indexOf(b.id as HomeDiscoverySection))
    .filter(row => row.is_visible && DEFAULT_HOME_ORDER.includes(row.id as HomeDiscoverySection)).map(row => row.id as HomeDiscoverySection);
  if (!rows.some(row => row.id === 'timeline')) {
    const at = order.indexOf('categories');
    order.splice(at >= 0 ? at + 1 : 0, 0, 'timeline');
  }
  if (!rows.some(row => row.id === 'faq')) {
    const at = order.indexOf('cta');
    order.splice(at >= 0 ? at : order.length, 0, 'faq');
  }
  if (!rows.some(row => row.id === 'for_you')) {
    const at = Math.max(order.indexOf('region_banners'), order.indexOf('featured_sections'));
    order.splice(at >= 0 ? at + 1 : order.length, 0, 'for_you');
  }
  return [...new Set(order)];
}
