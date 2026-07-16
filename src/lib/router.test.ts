import { describe, it, expect } from 'vitest';
import { pageToHref, parseListingParams } from './router';

describe('pageToHref — listings filters', () => {
  it('giữ path theo hình thức, không thêm query khi không có filter', () => {
    expect(pageToHref({ name: 'listings' })).toBe('/danh-sach');
    expect(pageToHref({ name: 'listings', listingType: 'mua_ban' })).toBe('/mua-ban');
    expect(pageToHref({ name: 'listings', listingType: 'cho_thue' })).toBe('/cho-thue');
  });

  it('mang typeId, district, legal qua query (decode đúng, giữ dấu tiếng Việt)', () => {
    const href = pageToHref({ name: 'listings', typeId: 'abc', district: 'Thuận An', legal: 'Sổ chung' });
    const [path, qs] = href.split('?');
    expect(path).toBe('/danh-sach');
    const params = new URLSearchParams(qs);
    expect(params.get('type')).toBe('abc');
    expect(params.get('district')).toBe('Thuận An');
    expect(params.get('legal')).toBe('Sổ chung');
  });

  it('kết hợp filter với path cho thuê', () => {
    const href = pageToHref({ name: 'listings', listingType: 'cho_thue', typeId: 't1', district: 'Dĩ An' });
    const [path, qs] = href.split('?');
    expect(path).toBe('/cho-thue');
    const params = new URLSearchParams(qs);
    expect(params.get('type')).toBe('t1');
    expect(params.get('district')).toBe('Dĩ An');
    expect(params.get('legal')).toBeNull();
  });

  it('mang đủ 3 cấp khu vực: areaId + district + ward qua query', () => {
    const href = pageToHref({ name: 'listings', areaId: 'bd', district: 'Thuận An', ward: 'Bình Chuẩn' });
    const [path, qs] = href.split('?');
    expect(path).toBe('/danh-sach');
    const params = new URLSearchParams(qs);
    expect(params.get('area')).toBe('bd');
    expect(params.get('district')).toBe('Thuận An');
    expect(params.get('ward')).toBe('Bình Chuẩn');
  });

  it('mang keyword (q), sort và khoảng giá (minPrice/maxPrice) qua query', () => {
    const href = pageToHref({ name: 'listings', keyword: 'nhà phố', sort: 'relevance', minPrice: 1, maxPrice: 2 });
    const [path, qs] = href.split('?');
    expect(path).toBe('/danh-sach');
    const params = new URLSearchParams(qs);
    expect(params.get('q')).toBe('nhà phố');
    expect(params.get('sort')).toBe('relevance');
    expect(params.get('minPrice')).toBe('1');
    expect(params.get('maxPrice')).toBe('2');
  });

  it('mang minPrice=0 (Dưới X) — không bỏ sót vì 0 là falsy', () => {
    const params = new URLSearchParams(pageToHref({ name: 'listings', minPrice: 0, maxPrice: 0.5 }).split('?')[1]);
    expect(params.get('minPrice')).toBe('0');
    expect(params.get('maxPrice')).toBe('0.5');
  });

  it('khoảng giá max mở (Trên 50 tỷ): chỉ có minPrice, không có maxPrice', () => {
    const params = new URLSearchParams(pageToHref({ name: 'listings', minPrice: 50 }).split('?')[1]);
    expect(params.get('minPrice')).toBe('50');
    expect(params.get('maxPrice')).toBeNull();
  });

  it('mang minArea/maxArea, bedrooms, direction qua query', () => {
    const href = pageToHref({ name: 'listings', minArea: 50, maxArea: 100, bedrooms: '3', direction: 'Đông Nam' });
    const params = new URLSearchParams(href.split('?')[1]);
    expect(params.get('minArea')).toBe('50');
    expect(params.get('maxArea')).toBe('100');
    expect(params.get('bedrooms')).toBe('3');
    expect(params.get('direction')).toBe('Đông Nam');
  });

  it('minArea=0 được giữ (0 là falsy nhưng vẫn là giá trị hợp lệ)', () => {
    const params = new URLSearchParams(pageToHref({ name: 'listings', minArea: 0, maxArea: 80 }).split('?')[1]);
    expect(params.get('minArea')).toBe('0');
    expect(params.get('maxArea')).toBe('80');
  });
});

describe('parseListingParams — đọc ngược query của Next searchParams', () => {
  it('bóc type/district/legal từ object searchParams', () => {
    expect(parseListingParams({ type: 'abc', district: 'Thuận An', legal: 'Sổ chung' }))
      .toEqual({ typeId: 'abc', district: 'Thuận An', legal: 'Sổ chung' });
  });

  it('bỏ qua khóa không có, trả object rỗng khi không filter', () => {
    expect(parseListingParams({})).toEqual({});
    expect(parseListingParams(undefined)).toEqual({});
  });

  it('lấy phần tử đầu khi param là mảng (Next có thể trả string[])', () => {
    expect(parseListingParams({ type: ['x', 'y'] })).toEqual({ typeId: 'x' });
  });

  it('round-trip với pageToHref: filter → href → searchParams → parse khớp gốc', () => {
    const page = { name: 'listings' as const, typeId: 't9', district: 'Dĩ An', legal: 'Sổ hồng' };
    const qs = pageToHref(page).split('?')[1];
    const sp = Object.fromEntries(new URLSearchParams(qs));
    expect(parseListingParams(sp)).toEqual({ typeId: 't9', district: 'Dĩ An', legal: 'Sổ hồng' });
  });

  it('bóc đủ 3 cấp khu vực: area/district/ward', () => {
    expect(parseListingParams({ area: 'bd', district: 'Thuận An', ward: 'Bình Chuẩn' }))
      .toEqual({ areaId: 'bd', district: 'Thuận An', ward: 'Bình Chuẩn' });
  });

  it('round-trip 3 cấp: areaId + district + ward → href → parse khớp gốc', () => {
    const page = { name: 'listings' as const, areaId: 'bd', district: 'Thuận An', ward: 'Bình Chuẩn' };
    const qs = pageToHref(page).split('?')[1];
    const sp = Object.fromEntries(new URLSearchParams(qs));
    expect(parseListingParams(sp)).toEqual({ areaId: 'bd', district: 'Thuận An', ward: 'Bình Chuẩn' });
  });

  it('bóc keyword (q), sort và ép số minPrice/maxPrice', () => {
    expect(parseListingParams({ q: 'đất nền', sort: 'relevance', minPrice: '1', maxPrice: '2' }))
      .toEqual({ keyword: 'đất nền', sort: 'relevance', minPrice: 1, maxPrice: 2 });
  });

  it('minPrice=0 được giữ (không nhầm với thiếu param)', () => {
    expect(parseListingParams({ minPrice: '0', maxPrice: '0.5' }))
      .toEqual({ minPrice: 0, maxPrice: 0.5 });
  });

  it('bỏ qua price không phải số hợp lệ', () => {
    expect(parseListingParams({ minPrice: 'abc' })).toEqual({});
  });

  it('round-trip keyword + giá: page → href → parse khớp gốc', () => {
    const page = { name: 'listings' as const, keyword: 'nhà phố', minPrice: 2, maxPrice: 5 };
    const qs = pageToHref(page).split('?')[1];
    const sp = Object.fromEntries(new URLSearchParams(qs));
    expect(parseListingParams(sp)).toEqual({ keyword: 'nhà phố', minPrice: 2, maxPrice: 5 });
  });

  it('bóc minArea/maxArea (ép số), bedrooms, direction', () => {
    expect(parseListingParams({ minArea: '50', maxArea: '100', bedrooms: '3', direction: 'Đông Nam' }))
      .toEqual({ minArea: 50, maxArea: 100, bedrooms: '3', direction: 'Đông Nam' });
  });

  it('round-trip đủ filter diện tích + phòng ngủ + hướng: page → href → parse khớp gốc', () => {
    const page = { name: 'listings' as const, minArea: 50, maxArea: 100, bedrooms: '2', direction: 'Tây Bắc' };
    const qs = pageToHref(page).split('?')[1];
    const sp = Object.fromEntries(new URLSearchParams(qs));
    expect(parseListingParams(sp)).toEqual({ minArea: 50, maxArea: 100, bedrooms: '2', direction: 'Tây Bắc' });
  });
});
