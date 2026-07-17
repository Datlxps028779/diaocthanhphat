import { describe, it, expect } from 'vitest';
import {
  normalizeFilters, filtersToPage, hasSavedSearchCriteria, buildSearchName, isAlertCadence, type SavedFilters,
} from './savedSearch';

describe('normalizeFilters', () => {
  it('loại khóa rỗng/undefined nhưng giữ số 0', () => {
    const out = normalizeFilters({ areaId: '', keyword: undefined, minPrice: 0, maxPrice: 5 });
    expect(out).toEqual({ minPrice: 0, maxPrice: 5 });
  });

  it('giữ đủ các tiêu chí có giá trị', () => {
    const f: SavedFilters = {
      listingType: 'cho_thue', areaId: 'a1', typeId: 't1', district: 'Dĩ An',
      ward: 'Tân Đông Hiệp', keyword: 'nhà phố', minPrice: 1, maxPrice: 3,
      minArea: 50, maxArea: 100, bedrooms: '2', direction: 'Đông', legal: 'Sổ hồng', sort: 'price_asc',
    };
    expect(normalizeFilters(f)).toEqual(f);
  });
});

describe('filtersToPage', () => {
  it('tạo Page listings mang theo filters đã chuẩn hóa', () => {
    const page = filtersToPage({ areaId: 'bd', minPrice: 0, maxPrice: 2, keyword: '' });
    expect(page).toEqual({ name: 'listings', areaId: 'bd', minPrice: 0, maxPrice: 2 });
  });
});

describe('hasSavedSearchCriteria', () => {
  it('nhận filter tìm kiếm thật', () => {
    expect(hasSavedSearchCriteria({ areaId: 'bd' })).toBe(true);
    expect(hasSavedSearchCriteria({ keyword: 'nhà phố' })).toBe(true);
    expect(hasSavedSearchCriteria({ minPrice: 0, maxPrice: 1 })).toBe(true);
  });

  it('bỏ qua rỗng và sort-only để tránh auto-save rác', () => {
    expect(hasSavedSearchCriteria({})).toBe(false);
    expect(hasSavedSearchCriteria({ keyword: '', sort: 'price_asc' })).toBe(false);
  });
});

describe('buildSearchName', () => {
  it('ưu tiên nhãn taxonomy loại + khu vực khi có labels', () => {
    const name = buildSearchName(
      { typeId: 't1', areaId: 'a1' },
      { types: { t1: 'Nhà phố' }, areas: { a1: 'Bình Dương' } },
    );
    expect(name).toBe('Nhà phố · Bình Dương');
  });

  it('ward/district thắng nhãn area khi cùng có', () => {
    const name = buildSearchName(
      { areaId: 'a1', district: 'Dĩ An', ward: 'Tân Đông Hiệp' },
      { areas: { a1: 'Bình Dương' } },
    );
    expect(name).toContain('Tân Đông Hiệp');
    expect(name).not.toContain('Bình Dương');
  });

  it('gộp keyword và khoảng giá', () => {
    expect(buildSearchName({ keyword: 'đất nền', minPrice: 1, maxPrice: 2 }))
      .toBe('"đất nền" · 1-2 tỷ');
  });

  it('khoảng giá một phía', () => {
    expect(buildSearchName({ maxPrice: 3 })).toBe('dưới 3 tỷ');
    expect(buildSearchName({ minPrice: 5 })).toBe('trên 5 tỷ');
  });

  it('thêm số phòng ngủ', () => {
    expect(buildSearchName({ keyword: 'căn hộ', bedrooms: '2' })).toBe('"căn hộ" · 2 PN');
  });

  it('rơi về nhãn mặc định theo hình thức khi không có tiêu chí', () => {
    expect(buildSearchName({})).toBe('Tin mua bán');
    expect(buildSearchName({ listingType: 'cho_thue' })).toBe('Tin cho thuê');
  });

  it('tiền tố Thuê khi cho_thue có tiêu chí', () => {
    expect(buildSearchName({ listingType: 'cho_thue', keyword: 'phòng trọ' }))
      .toBe('Thuê: "phòng trọ"');
  });
});

describe('isAlertCadence', () => {
  it('nhận đúng 3 giá trị hợp lệ', () => {
    expect(isAlertCadence('instant')).toBe(true);
    expect(isAlertCadence('daily')).toBe(true);
    expect(isAlertCadence('weekly')).toBe(true);
  });
  it('từ chối giá trị lạ', () => {
    expect(isAlertCadence('monthly')).toBe(false);
    expect(isAlertCadence(undefined)).toBe(false);
  });
});
