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
});
