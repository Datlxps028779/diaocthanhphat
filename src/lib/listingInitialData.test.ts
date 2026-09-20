import { describe, expect, it } from 'vitest';
import { listingInitialDataScopeMatches } from './listingInitialData';

describe('listingInitialDataScopeMatches', () => {
  it('accepts an exact base-route seed with normalized defaults', () => {
    expect(listingInitialDataScopeMatches(
      { listingType: 'mua_ban' },
      { listingType: 'mua_ban', sort: 'newest', page: 1 },
    )).toBe(true);
  });

  it('accepts an exact area and district seed', () => {
    expect(listingInitialDataScopeMatches(
      { listingType: 'cho_thue', areaId: 'area-1', district: 'Dĩ An' },
      { listingType: 'cho_thue', areaId: 'area-1', district: 'Dĩ An' },
    )).toBe(true);
  });

  it.each([
    { typeId: 'type-1' },
    { ward: 'Tân Đông Hiệp' },
    { keyword: 'đất nền' },
    { minPrice: 1, maxPrice: 2 },
    { minArea: 50, maxArea: 100 },
    { bedrooms: '2' },
    { direction: 'Đông' },
    { legal: 'Sổ riêng' },
    { isFeatured: true },
    { isHot: true },
    { sort: 'price_asc' as const },
    { page: 2 },
  ])('rejects a seed that omits a current filter: %o', extra => {
    expect(listingInitialDataScopeMatches(
      { listingType: 'mua_ban' },
      { listingType: 'mua_ban', ...extra },
    )).toBe(false);
  });

  it('rejects an unresolved friendly type slug', () => {
    expect(listingInitialDataScopeMatches(
      { listingType: 'mua_ban' },
      { listingType: 'mua_ban', typeSlug: 'dat-nen' },
    )).toBe(false);
  });

  it('rejects missing scope and normalizes false booleans like omitted values', () => {
    expect(listingInitialDataScopeMatches(undefined, { listingType: 'mua_ban' })).toBe(false);
    expect(listingInitialDataScopeMatches(
      { listingType: 'mua_ban', isFeatured: false, isHot: false },
      { listingType: 'mua_ban' },
    )).toBe(true);
  });

  it('accepts an exact locality scope seed resolved by route IDs', () => {
    const scope = {
      listingType: 'mua_ban' as const,
      areaId: 'area-1',
      districtId: 'district-1',
      wardId: 'ward-1',
      typeIds: ['type-1'],
      salePriceBand: 'tu-1-den-duoi-2-ty' as const,
    };
    expect(listingInitialDataScopeMatches(scope, { ...scope })).toBe(true);
  });

  it.each([
    { districtId: 'district-2' },
    { wardId: 'ward-2' },
    { salePriceBand: 'tu-5-ty' as const },
    { districtId: undefined },
    { salePriceBand: undefined },
  ])('rejects a locality seed whose ID/band dimension drifted: %o', patch => {
    const scope = {
      listingType: 'mua_ban' as const,
      areaId: 'area-1',
      districtId: 'district-1',
      wardId: 'ward-1',
      salePriceBand: 'tu-1-den-duoi-2-ty' as const,
    };
    expect(listingInitialDataScopeMatches(scope, { ...scope, ...patch })).toBe(false);
  });

  it('does not let a name-only seed claim an ID-scoped view', () => {
    // Route địa phương truy vấn theo ward_id; seed chỉ có tên ward KHÔNG được dùng lại.
    expect(listingInitialDataScopeMatches(
      { listingType: 'mua_ban', areaId: 'area-1', ward: 'An Phú' },
      { listingType: 'mua_ban', areaId: 'area-1', ward: 'An Phú', wardId: 'ward-1' },
    )).toBe(false);
  });
});
