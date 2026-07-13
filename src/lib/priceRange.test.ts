import { describe, it, expect } from 'vitest';
import { PRICE_RANGES_SALE, PRICE_RANGES_RENT, AREA_RANGES, findRangeIndex } from './priceRange';

describe('priceRange — khoảng giá/diện tích dùng chung hero + listing', () => {
  describe('findRangeIndex', () => {
    it('trả 0 (Tất cả) khi không có min/max', () => {
      expect(findRangeIndex(PRICE_RANGES_SALE, undefined, undefined)).toBe(0);
    });

    it('khớp đúng index khoảng giá bán (1–2 tỷ)', () => {
      // PRICE_RANGES_SALE index 3 = { min: 1, max: 2 }
      expect(findRangeIndex(PRICE_RANGES_SALE, 1, 2)).toBe(3);
    });

    it('khớp khoảng có max mở (Trên 50 tỷ: min=50, max=undefined)', () => {
      const idx = findRangeIndex(PRICE_RANGES_SALE, 50, undefined);
      expect(idx).toBe(PRICE_RANGES_SALE.length - 1);
      expect(PRICE_RANGES_SALE[idx].label).toBe('Trên 50 tỷ');
    });

    it('khớp khoảng có min=0 (Dưới 500 triệu: min=0, max=0.5)', () => {
      expect(findRangeIndex(PRICE_RANGES_SALE, 0, 0.5)).toBe(1);
    });

    it('khớp khoảng thuê (5–10 triệu/tháng)', () => {
      expect(findRangeIndex(PRICE_RANGES_RENT, 5, 10)).toBe(3);
    });

    it('trả 0 khi min/max không khớp khoảng nào (giá trị lạ)', () => {
      expect(findRangeIndex(PRICE_RANGES_SALE, 1.37, 4.2)).toBe(0);
    });

    it('khớp khoảng diện tích (100–200 m²)', () => {
      expect(findRangeIndex(AREA_RANGES, 100, 200)).toBe(3);
    });

    it('phân biệt min=0 với min=undefined (không nhầm Dưới X thành Tất cả)', () => {
      // min=0,max=0.5 là "Dưới 500tr" (index 1), KHÁC min/max=undefined "Tất cả" (index 0)
      expect(findRangeIndex(PRICE_RANGES_SALE, 0, 0.5)).not.toBe(0);
    });
  });

  it('mỗi bộ khoảng bắt đầu bằng "Tất cả" (min/max undefined)', () => {
    for (const ranges of [PRICE_RANGES_SALE, PRICE_RANGES_RENT, AREA_RANGES]) {
      expect(ranges[0].min).toBeUndefined();
      expect(ranges[0].max).toBeUndefined();
    }
  });
});
