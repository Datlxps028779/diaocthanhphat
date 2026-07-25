import { describe, it, expect } from 'vitest';
import type { PriceStat } from './supabase';
import {
  pickOverallStat, formatPricePerSqm, formatUpdateDate, buildPriceAnswer, PRICE_DISCLAIMER,
} from './priceStatsFormat';

function stat(overrides: Partial<PriceStat> = {}): PriceStat {
  return {
    id: 's1', scope: 'neighborhood', scope_key: 'phu-hong-thinh-8',
    listing_type: 'mua_ban', property_type_id: null,
    sample_count: 5, avg_price_per_sqm: 42, median_price_per_sqm: 40,
    min_price_per_sqm: 30, max_price_per_sqm: 55, avg_area_sqm: 80,
    computed_at: '2026-07-20T00:00:00.000Z',
    ...overrides,
  };
}

describe('pickOverallStat', () => {
  it('chọn đúng dòng tổng theo listing_type (property_type_id = null)', () => {
    const stats = [
      stat({ listing_type: 'mua_ban', property_type_id: null, median_price_per_sqm: 40 }),
      stat({ listing_type: 'cho_thue', property_type_id: null, median_price_per_sqm: 0.3 }),
      stat({ listing_type: 'mua_ban', property_type_id: 'type-x', median_price_per_sqm: 99 }),
    ];
    expect(pickOverallStat(stats, 'mua_ban')?.median_price_per_sqm).toBe(40);
    expect(pickOverallStat(stats, 'cho_thue')?.median_price_per_sqm).toBe(0.3);
  });
  it('trả null khi không có dòng khớp', () => {
    expect(pickOverallStat([], 'mua_ban')).toBeNull();
  });
});

describe('formatPricePerSqm', () => {
  it('null/0/âm → dấu gạch', () => {
    expect(formatPricePerSqm(null)).toBe('—');
    expect(formatPricePerSqm(0)).toBe('—');
    expect(formatPricePerSqm(-5)).toBe('—');
  });
  it('làm tròn 1 chữ số thập phân khi < 100', () => {
    expect(formatPricePerSqm(42.37)).toBe('42,4 triệu/m²');
  });
  it('làm tròn nguyên khi >= 100', () => {
    expect(formatPricePerSqm(123.6)).toBe('124 triệu/m²');
  });
});

describe('formatUpdateDate', () => {
  it('ISO → dd/mm/yyyy', () => {
    expect(formatUpdateDate('2026-07-20T00:00:00.000Z')).toBe('20/07/2026');
  });
  it('rỗng/không hợp lệ → chuỗi rỗng', () => {
    expect(formatUpdateDate(null)).toBe('');
    expect(formatUpdateDate('not-a-date')).toBe('');
  });
});

describe('buildPriceAnswer', () => {
  it('sinh câu trả lời có số liệu + số mẫu + ngày', () => {
    const ans = buildPriceAnswer('Phú Hồng Thịnh 8', [stat()], 'mua_ban');
    expect(ans).toContain('Phú Hồng Thịnh 8');
    expect(ans).toContain('40 triệu/m²');
    expect(ans).toContain('5 tin đăng');
    expect(ans).toContain('20/07/2026');
  });
  it('null khi không đủ dữ liệu (không bịa)', () => {
    expect(buildPriceAnswer('X', [], 'mua_ban')).toBeNull();
    expect(buildPriceAnswer('X', [stat({ median_price_per_sqm: null })], 'mua_ban')).toBeNull();
  });
  it('phân biệt giá thuê', () => {
    const ans = buildPriceAnswer('KDC Y', [stat({ listing_type: 'cho_thue', median_price_per_sqm: 0.3 })], 'cho_thue');
    expect(ans).toContain('giá thuê');
  });
});

describe('PRICE_DISCLAIMER', () => {
  it('có câu miễn trừ bắt buộc', () => {
    expect(PRICE_DISCLAIMER).toContain('tham khảo');
  });
});
