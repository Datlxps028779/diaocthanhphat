import { describe, expect, it } from 'vitest';
import { getHomepageSectionOrder } from './homeSectionOrder';
const row = (id: string, order_index: number, is_visible = true) => ({ id, order_index, is_visible });
describe('homepage section order', () => {
  it('defaults to location discovery immediately after timeline', () => {
    expect(getHomepageSectionOrder([]).slice(0, 3)).toEqual(['categories', 'timeline', 'region_banners']);
  });
  it('inserts a missing timeline after categories, not at page end', () => {
    expect(getHomepageSectionOrder([row('categories', 2), row('region_banners', 4), row('cta', 8)]).slice(0, 3)).toEqual(['categories', 'timeline', 'region_banners']);
  });
  it('respects hidden timeline and locations, removes home history rail', () => {
    const order = getHomepageSectionOrder([row('timeline', 2, false), row('region_banners', 3, false), row('recently_viewed', 1), row('cta', 8)]);
    expect(order).not.toContain('timeline'); expect(order).not.toContain('region_banners'); expect(order).not.toContain('recently_viewed');
  });
  it('keeps configured section order once timeline exists', () => {
    const order = getHomepageSectionOrder([row('region_banners', 1), row('timeline', 8), row('categories', 4)]);
    expect(order.filter(id => ['region_banners', 'timeline', 'categories'].includes(id))).toEqual(['region_banners', 'categories', 'timeline']);
  });
});
