import { describe, it, expect } from 'vitest';
import { normalizeToTrieu, pricePerSqm, estimateValuation } from './valuation';

describe('normalizeToTrieu', () => {
  it('giữ nguyên khi đơn vị là triệu', () => {
    expect(normalizeToTrieu(500, 'triệu')).toBe(500);
  });
  it('nhân 1000 khi đơn vị là tỷ', () => {
    expect(normalizeToTrieu(4.6, 'tỷ')).toBe(4600);
  });
  it('trả null khi giá không hợp lệ', () => {
    expect(normalizeToTrieu(0, 'tỷ')).toBeNull();
  });
});

describe('pricePerSqm', () => {
  it('tính giá mỗi m² theo triệu', () => {
    // 4.6 tỷ = 4600 triệu, 90 m² → ~51.11 triệu/m²
    expect(pricePerSqm({ price: 4.6, price_unit: 'tỷ', area_sqm: 90 })).toBeCloseTo(51.11, 1);
  });
  it('trả null khi thiếu diện tích', () => {
    expect(pricePerSqm({ price: 4.6, price_unit: 'tỷ', area_sqm: null })).toBeNull();
  });
});

describe('estimateValuation', () => {
  const comps = [
    { price: 5, price_unit: 'tỷ', area_sqm: 100 },   // 50 triệu/m²
    { price: 4.4, price_unit: 'tỷ', area_sqm: 80 },  // 55 triệu/m²
    { price: 6, price_unit: 'tỷ', area_sqm: 100 },   // 60 triệu/m²
  ];

  it('ước tính theo trung vị giá/m² × diện tích', () => {
    // median price/m² = 55 triệu; 120 m² → 6600 triệu = 6.6 tỷ (mid)
    const r = estimateValuation(comps, 120);
    expect(r).not.toBeNull();
    expect(r!.midTrieu).toBeCloseTo(6600, 0);
    expect(r!.sampleSize).toBe(3);
    expect(r!.pricePerSqmMedian).toBeCloseTo(55, 1);
  });

  it('khoảng thấp/cao bao quanh giá trị giữa', () => {
    const r = estimateValuation(comps, 120)!;
    expect(r.lowTrieu).toBeLessThan(r.midTrieu);
    expect(r.highTrieu).toBeGreaterThan(r.midTrieu);
  });

  it('trả null khi không đủ mẫu tham chiếu', () => {
    expect(estimateValuation([], 100)).toBeNull();
    expect(estimateValuation([{ price: 5, price_unit: 'tỷ', area_sqm: 100 }], 100)).toBeNull();
  });

  it('trả null khi diện tích mục tiêu không hợp lệ', () => {
    expect(estimateValuation(comps, 0)).toBeNull();
  });
});
