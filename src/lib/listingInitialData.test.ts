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
});
