import { describe, expect, it } from 'vitest';
import { aggregateHomeLocationStats, formatLocationPrice, formatLocationPricePerSqm, type HomeLocationPropertyRow } from './homeLocationStats';

function row(overrides: Partial<HomeLocationPropertyRow> = {}): HomeLocationPropertyRow {
  return { id: 'property-1', area_id: 'bd', district_id: 'd1', listing_type: 'mua_ban', price: 1, price_unit: 'tỷ', price_per_month: null, area_sqm: 100, ...overrides };
}

const computedAt = '2026-09-16T00:00:00.000Z';

describe('aggregateHomeLocationStats', () => {
  it('counts all rows, groups districts within areas and never exposes property IDs', () => {
    const result = aggregateHomeLocationStats([
      row(), row({ id: 'private-looking-id', listing_type: 'cho_thue', price: 8, price_unit: 'triệu/tháng' }),
      row({ area_id: 'bp', district_id: 'd1' }), row({ district_id: null }), row({ area_id: null }),
    ], computedAt);
    expect(result.computedAt).toBe(computedAt);
    expect(result.totalCount).toBe(5);
    expect(result.areas.bd).toMatchObject({ count: 3, saleCount: 2, pricedSaleCount: 2, districtCounts: { d1: 2 } });
    expect(result.areas.bp.districtCounts).toEqual({ d1: 1 });
    expect(JSON.stringify(result)).not.toContain('private-looking-id');
    expect(Object.keys(result)).toEqual(['computedAt', 'totalCount', 'areas']);
  });

  it('normalizes supported sale units and calculates mean of individual price/m², not mean price / mean area', () => {
    const result = aggregateHomeLocationStats([
      row({ price: 1, area_sqm: 100 }), row({ price: 2000, price_unit: 'triệu', area_sqm: 100 }),
      row({ price: 9, area_sqm: 300 }), row({ listing_type: 'cho_thue', price: 999, price_per_month: 5 }),
    ], computedAt).areas.bd;
    expect(result).toMatchObject({ count: 4, saleCount: 3, pricedSaleCount: 3, sqmSampleCount: 3,
      minSalePriceVnd: 1e9, avgSalePriceVnd: 4e9, avgSalePricePerSqmVnd: 20e6 });
    expect(result.avgSalePricePerSqmVnd).not.toBe(12e9 / 500);
  });

  it('excludes null/unknown/rental units and invalid prices without removing rows from counts', () => {
    const bad = [row({ price: null }), row({ price: 0 }), row({ price: -1 }), row({ price: NaN }),
      row({ price: Infinity }), row({ price: 1e308 }), row({ price_unit: null }), row({ price_unit: 'USD' }),
      row({ price_unit: 'triệu/tháng', price_per_month: 9 }), row({ listing_type: null })];
    const result = aggregateHomeLocationStats(bad, computedAt).areas.bd;
    expect(result).toMatchObject({ count: 10, saleCount: 9, pricedSaleCount: 0, sqmSampleCount: 0,
      minSalePriceVnd: null, avgSalePriceVnd: null, avgSalePricePerSqmVnd: null });
  });

  it('gates each average independently at three valid samples, but keeps the minimum', () => {
    const rows = [row(), row({ price: 2 }), row({ price: 3, area_sqm: 0 })];
    expect(aggregateHomeLocationStats(rows.slice(0, 2), computedAt).areas.bd).toMatchObject({
      minSalePriceVnd: 1e9, avgSalePriceVnd: null, avgSalePricePerSqmVnd: null,
    });
    expect(aggregateHomeLocationStats(rows, computedAt).areas.bd).toMatchObject({
      pricedSaleCount: 3, sqmSampleCount: 2, avgSalePriceVnd: 2e9, avgSalePricePerSqmVnd: null,
    });
  });

  it('excludes missing, negative, infinite area and nonfinite ratios only from sqm sample', () => {
    const rows = [null, -1, Infinity, Number.MIN_VALUE].map(area_sqm => row({ area_sqm }));
    expect(aggregateHomeLocationStats(rows, computedAt).areas.bd).toMatchObject({
      pricedSaleCount: 4, sqmSampleCount: 0, avgSalePriceVnd: 1e9, avgSalePricePerSqmVnd: null,
    });
  });

  it('produces a complete empty result and safe record keys', () => {
    expect(aggregateHomeLocationStats([], computedAt)).toEqual({ computedAt, totalCount: 0, areas: {} });
    const result = aggregateHomeLocationStats([row({ area_id: '__proto__', district_id: 'constructor' })], computedAt);
    expect(result.areas.__proto__.districtCounts.constructor).toBe(1);
  });
});

describe('location price formatting', () => {
  it('uses Vietnamese decimal separators with billion/million units', () => {
    expect(formatLocationPrice(1.25e9)).toBe('1,25 tỷ');
    expect(formatLocationPrice(850e6)).toBe('850 triệu');
    expect(formatLocationPrice(999e6)).toBe('999 triệu');
  });
  it('formats sqm values including sub-million values and rejects invalid display values', () => {
    expect(formatLocationPricePerSqm(12.345e6)).toBe('12,35 tr/m²');
    expect(formatLocationPricePerSqm(750e3)).toBe('750 nghìn/m²');
    expect(formatLocationPricePerSqm(1e6)).toBe('1 tr/m²');
    for (const value of [NaN, Infinity, 0, -1]) {
      expect(formatLocationPrice(value)).toBe('Đang cập nhật');
      expect(formatLocationPricePerSqm(value)).toBe('Đang cập nhật');
    }
  });
});
