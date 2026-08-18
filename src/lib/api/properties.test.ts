import { describe, expect, it } from 'vitest';
import {
  mapAdvisorMatchMetadata,
  normalizeAdminPropertyLimit,
  normalizeAdminPropertyPage,
  publicPropertyFilterOperations,
  sanitizeAdminPropertyKeyword,
} from './properties';

describe('Admin property catalogue filter guards', () => {
  it('removes PostgREST structural characters from a keyword', () => {
    expect(sanitizeAdminPropertyKeyword('  nha, (pho)\\%  quan 1  ')).toBe('nha pho quan 1');
  });

  it('limits keyword length after normalizing whitespace', () => {
    expect(sanitizeAdminPropertyKeyword(`  ${'a'.repeat(130)}  `)).toHaveLength(120);
  });

  it.each([
    [undefined, 1],
    [0, 1],
    [-2, 1],
    [1.5, 1],
    [3, 3],
  ])('normalizes page %s to %s', (value, expected) => {
    expect(normalizeAdminPropertyPage(value)).toBe(expected);
  });

  it.each([
    [undefined, 25],
    [20, 25],
    [25, 25],
    [50, 50],
    [100, 100],
  ])('allows only approved page limits: %s', (value, expected) => {
    expect(normalizeAdminPropertyLimit(value)).toBe(expected);
  });
});

describe('Public property filter contract', () => {
  it('uses monthly rental price and carries every public filter to list/map queries', () => {
    const operations = publicPropertyFilterOperations({
      listingType: 'cho_thue', areaId: 'area-1', typeId: 'type-1', city: 'Bình Dương',
      district: 'Dĩ An', ward: 'Tân Đông Hiệp', keyword: 'nhà, phố',
      minPrice: 5, maxPrice: 10, minArea: 50, maxArea: 100, bedrooms: '2',
      direction: 'Đông', legal: 'Sổ riêng', isFeatured: true, isHot: true,
    });

    expect(operations).toEqual(expect.arrayContaining([
      { method: 'eq', column: 'listing_type', value: 'cho_thue' },
      { method: 'eq', column: 'area_id', value: 'area-1' },
      { method: 'eq', column: 'property_type_id', value: 'type-1' },
      { method: 'eq', column: 'city', value: 'Bình Dương' },
      { method: 'eq', column: 'district', value: 'Dĩ An' },
      { method: 'eq', column: 'ward', value: 'Tân Đông Hiệp' },
      { method: 'gte', column: 'price_per_month', value: 5 },
      { method: 'lte', column: 'price_per_month', value: 10 },
      { method: 'gte', column: 'area_sqm', value: 50 },
      { method: 'lte', column: 'area_sqm', value: 100 },
      { method: 'gte', column: 'bedrooms', value: 2 },
      { method: 'eq', column: 'direction', value: 'Đông' },
      { method: 'eq', column: 'legal_status', value: 'Sổ riêng' },
      { method: 'eq', column: 'is_featured', value: true },
      { method: 'eq', column: 'is_hot', value: true },
    ]));
    expect(operations.find(item => item.method === 'or')?.value).toBe(
      'title.ilike.%nhà phố%,address.ilike.%nhà phố%,city.ilike.%nhà phố%,district.ilike.%nhà phố%',
    );
  });

  it('uses sale price unless the route is explicitly rental', () => {
    expect(publicPropertyFilterOperations({ minPrice: 1 })[0]).toEqual({
      method: 'gte', column: 'price', value: 1,
    });
  });

  it('sanitizes PostgREST structure from public keyword filters', () => {
    const operation = publicPropertyFilterOperations({ keyword: ' nhà, (phố)\\% ' })
      .find(item => item.method === 'or');
    expect(operation?.value).toBe(
      'title.ilike.%nhà phố%,address.ilike.%nhà phố%,city.ilike.%nhà phố%,district.ilike.%nhà phố%',
    );
  });
});

describe('Advisor ranking response contract', () => {
  it('maps explainable reason codes and keeps intent score separate from keyword supplement', () => {
    expect(mapAdvisorMatchMetadata({
      id: 'property-1',
      score: 79,
      intent_score: 75,
      match_reasons: ['legal', 'location', 'keyword', 'budget'],
      total_count: 1,
    })).toEqual({
      matchScore: 79,
      matchIntentScore: 75,
      matchReasons: ['location', 'budget', 'legal', 'keyword'],
    });
  });

  it('fails closed on malformed reasons while remaining compatible before migration', () => {
    expect(mapAdvisorMatchMetadata({
      id: 'property-1', score: 30, total_count: 1,
    })).toEqual({
      matchScore: 30,
      matchIntentScore: 30,
      matchReasons: [],
    });
  });
});
