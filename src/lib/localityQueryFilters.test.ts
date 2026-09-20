import { describe, expect, it } from 'vitest';
import { localityQueryPriceRange, localityScopeEditNeedsNavigation, localityScopeOwnedDimensions } from './localityScopeEditing';

const current = { areaId: 'a', districtName: 'Dĩ An', wardName: 'Tân Đông Hiệp' };
const province = localityScopeOwnedDimensions({ path: '/mua-ban/a', areaId: 'a' });

describe('locality query filters remain separate from route dimensions', () => {
  it('preserves custom ranges and open bounds without a matching preset', () => {
    expect(localityQueryPriceRange({ minPrice: 2.5, maxPrice: 7.5 })).toEqual({ minPrice: 2.5, maxPrice: 7.5 });
    expect(localityQueryPriceRange({ minPrice: 3 })).toEqual({ minPrice: 3 });
    expect(localityQueryPriceRange({ minPrice: 0, maxPrice: 1 })).toEqual({ minPrice: 0, maxPrice: 1 });
  });
  it('does not restore initial ranges after clear', () => {
    expect(localityQueryPriceRange({})).toEqual({});
    expect(localityQueryPriceRange(undefined)).toEqual({});
  });
  it('rejects nonfinite and negative values', () => {
    expect(localityQueryPriceRange({ minPrice: NaN, maxPrice: Infinity })).toEqual({});
    expect(localityQueryPriceRange({ minPrice: -1, maxPrice: 5 })).toEqual({ maxPrice: 5 });
  });
  it('ignores price query on a route-owned price band', () => {
    expect(localityQueryPriceRange({ minPrice: 2.5, maxPrice: 7.5 }, { routeOwnsPrice: true })).toEqual({});
  });
  it('keeps unowned type, price, district and ward changes on the same province path', () => {
    expect(localityScopeEditNeedsNavigation(province, current, { kind: 'type', id: 't' })).toBe(false);
    expect(localityScopeEditNeedsNavigation(province, current, { kind: 'price', priceRange: { min: 2.5 } })).toBe(false);
    expect(localityScopeEditNeedsNavigation(province, current, { kind: 'district', id: 'Thủ Dầu Một' })).toBe(false);
    expect(localityScopeEditNeedsNavigation(province, current, { kind: 'ward', id: '' })).toBe(false);
  });
  it('leaves the route when an owned dimension is changed', () => {
    expect(localityScopeEditNeedsNavigation(province, current, { kind: 'area', id: 'b' })).toBe(true);
    expect(localityScopeEditNeedsNavigation(province, current, { kind: 'listingType', listingType: 'cho_thue' })).toBe(true);
    const ward = localityScopeOwnedDimensions({ path: '/mua-ban/a/d/phuong-xa/w', areaId: 'a', districtId: 'd', wardId: 'w' });
    expect(localityScopeEditNeedsNavigation(ward, current, { kind: 'district', id: '' })).toBe(true);
    expect(localityScopeEditNeedsNavigation(ward, current, { kind: 'ward', id: '' })).toBe(true);
    expect(localityScopeEditNeedsNavigation(ward, current, { kind: 'ward', id: 'w', name: current.wardName })).toBe(false);
  });
  it('does not drop an owned price band when changing an unowned type', () => {
    const price = localityScopeOwnedDimensions({ path: '/mua-ban/a/gia/tu-5-ty', areaId: 'a', priceBand: 'tu-5-ty' });
    expect(localityScopeEditNeedsNavigation(price, current, { kind: 'type', id: 't' })).toBe(false);
    expect(localityScopeEditNeedsNavigation(price, current, { kind: 'price' })).toBe(true);
  });
  it('does not drop an owned type when adding a price query', () => {
    const type = localityScopeOwnedDimensions({ path: '/mua-ban/a/loai/dat', areaId: 'a', typePathSlug: 'dat' });
    expect(localityScopeEditNeedsNavigation(type, current, { kind: 'price', priceRange: { min: 2 } })).toBe(false);
    expect(localityScopeEditNeedsNavigation(type, current, { kind: 'type', id: '' })).toBe(true);
  });
});
