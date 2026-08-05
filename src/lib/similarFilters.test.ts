import { describe, it, expect } from 'vitest';
import { buildSimilarFilters } from './similarFilters';

const base = {
  listing_type: 'mua_ban' as const,
  price: 3.85, price_unit: 'tỷ',
  area_sqm: 100, bedrooms: 3,
  district: 'Thuận An', ward: 'Bình Hòa', city: 'Bình Dương',
  area_id: 'a1', property_type_id: 't1',
  legal_status: 'Sổ hồng riêng', direction: 'Đông Nam',
};

describe('buildSimilarFilters — sinh chip lọc từ tin đang xem', () => {
  it('sinh chip khu vực theo quận, giữ đúng hình thức mua bán', () => {
    const chips = buildSimilarFilters(base);
    const district = chips.find(c => c.label.includes('Thuận An'));
    expect(district).toBeTruthy();
    expect(district!.page.listingType).toBe('mua_ban');
    expect(district!.page.district).toBe('Thuận An');
  });

  it('sinh chip cùng tầm giá theo bậc chứa giá tin (3,85 tỷ → 2–5 tỷ)', () => {
    const chip = buildSimilarFilters(base).find(c => c.kind === 'price');
    expect(chip).toBeTruthy();
    expect(chip!.page.minPrice).toBe(2);
    expect(chip!.page.maxPrice).toBe(5);
  });

  it('dùng thang giá thuê khi tin là cho thuê', () => {
    const chip = buildSimilarFilters({ ...base, listing_type: 'cho_thue', price: 7, price_unit: 'triệu/tháng' })
      .find(c => c.kind === 'price');
    expect(chip!.page.minPrice).toBe(5);
    expect(chip!.page.maxPrice).toBe(10);
    expect(chip!.page.listingType).toBe('cho_thue');
  });

  it('sinh chip diện tích theo bậc chứa diện tích tin (100m² → 100–200)', () => {
    const chip = buildSimilarFilters(base).find(c => c.kind === 'area');
    expect(chip!.page.minArea).toBe(100);
    expect(chip!.page.maxArea).toBe(200);
  });

  it('sinh chip số phòng ngủ và pháp lý khi tin có dữ liệu', () => {
    const chips = buildSimilarFilters(base);
    expect(chips.find(c => c.kind === 'bedrooms')!.page.bedrooms).toBe('3');
    expect(chips.find(c => c.kind === 'legal')!.page.legal).toBe('Sổ hồng riêng');
  });

  it('mọi chip đều giữ areaId để không lọt sang tỉnh khác', () => {
    for (const c of buildSimilarFilters(base)) expect(c.page.areaId).toBe('a1');
  });

  // Không bịa: thiếu dữ liệu thì bỏ chip đó, không đoán giá trị thay thế.
  it('bỏ chip khi tin thiếu dữ liệu tương ứng', () => {
    const chips = buildSimilarFilters({
      ...base, area_sqm: null, bedrooms: null, legal_status: null, district: null, ward: null,
    });
    expect(chips.find(c => c.kind === 'area')).toBeUndefined();
    expect(chips.find(c => c.kind === 'bedrooms')).toBeUndefined();
    expect(chips.find(c => c.kind === 'legal')).toBeUndefined();
    expect(chips.find(c => c.kind === 'district')).toBeUndefined();
  });

  it('bỏ chip giá khi giá không hợp lệ', () => {
    expect(buildSimilarFilters({ ...base, price: 0 }).find(c => c.kind === 'price')).toBeUndefined();
    expect(buildSimilarFilters({ ...base, price: NaN }).find(c => c.kind === 'price')).toBeUndefined();
  });

  it('bỏ chip phòng ngủ với đất nền (bedrooms = 0)', () => {
    expect(buildSimilarFilters({ ...base, bedrooms: 0 }).find(c => c.kind === 'bedrooms')).toBeUndefined();
  });

  it('không sinh chip nào khi tin quá thiếu dữ liệu', () => {
    expect(buildSimilarFilters({
      listing_type: 'mua_ban', price: 0, price_unit: 'tỷ', area_sqm: null, bedrooms: null,
      district: null, ward: null, city: '', area_id: null, property_type_id: null,
      legal_status: null, direction: null,
    })).toEqual([]);
  });

  it('chip có nhãn đọc được, không rỗng và không trùng nhau', () => {
    const chips = buildSimilarFilters(base);
    expect(chips.length).toBeGreaterThan(2);
    for (const c of chips) expect(c.label.trim().length).toBeGreaterThan(0);
    expect(new Set(chips.map(c => c.label)).size).toBe(chips.length);
  });

  it('giá sát mốc trên rơi đúng bậc trên (5 tỷ → 5–10)', () => {
    const chip = buildSimilarFilters({ ...base, price: 5 }).find(c => c.kind === 'price');
    expect(chip!.page.minPrice).toBe(5);
    expect(chip!.page.maxPrice).toBe(10);
  });

  it('giá vượt bậc cuối cho khoảng mở (60 tỷ → chỉ có minPrice)', () => {
    const chip = buildSimilarFilters({ ...base, price: 60 }).find(c => c.kind === 'price');
    expect(chip!.page.minPrice).toBe(50);
    expect(chip!.page.maxPrice).toBeUndefined();
  });
});
