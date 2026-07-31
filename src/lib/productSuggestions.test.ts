import { describe, expect, it } from 'vitest';
import { getProductSuggestions } from './productSuggestions';

describe('getProductSuggestions', () => {
  it('tạo gợi ý mua bán theo khu vực và khoảng giá', () => {
    expect(getProductSuggestions({ listing_type: 'mua_ban', area_id: 'area-1', price: 3.5, price_per_month: null }))
      .toEqual([
        { label: 'Xem thêm bất động sản đang bán', filters: { listingType: 'mua_ban' } },
        { label: 'Bất động sản đang bán cùng khu vực', filters: { listingType: 'mua_ban', areaId: 'area-1' } },
        { label: 'Bất động sản đang bán 2 – 5 tỷ', filters: { listingType: 'mua_ban', minPrice: 2, maxPrice: 5 } },
        { label: 'Bất động sản đang bán cùng khu vực 2 – 5 tỷ', filters: { listingType: 'mua_ban', areaId: 'area-1', minPrice: 2, maxPrice: 5 } },
      ]);
  });

  it('dùng giá thuê tháng thay vì giá bán', () => {
    const suggestions = getProductSuggestions({ listing_type: 'cho_thue', area_id: 'area-1', price: 20, price_per_month: 4 });

    expect(suggestions).toContainEqual({
      label: 'Bất động sản cho thuê 3 – 5 triệu/tháng',
      filters: { listingType: 'cho_thue', minPrice: 3, maxPrice: 5 },
    });
    expect(suggestions).not.toContainEqual(expect.objectContaining({
      filters: expect.objectContaining({ minPrice: 20 }),
    }));
  });

  it('bỏ giá trị không hợp lệ và không tạo gợi ý trùng', () => {
    const suggestions = getProductSuggestions({ listing_type: 'cho_thue', area_id: '  ', price: 4, price_per_month: 0 });

    expect(suggestions).toEqual([
      { label: 'Xem thêm bất động sản cho thuê', filters: { listingType: 'cho_thue' } },
    ]);
    expect(new Set(suggestions.map(item => JSON.stringify(item.filters))).size).toBe(suggestions.length);
  });

  it('bỏ listing type không hỗ trợ', () => {
    expect(getProductSuggestions({ listing_type: 'khac', area_id: 'area-1', price: 3, price_per_month: 3 })).toEqual([]);
  });
});
