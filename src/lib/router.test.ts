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

  it('sinh path SEO từ areaId và map district name sang district slug', () => {
    const href = pageToHref(
      { name: 'listings', listingType: 'cho_thue', areaId: 'bd', district: 'Dĩ An', ward: 'Tân Đông Hiệp', minPrice: 3 },
      {
        areas: [{ id: 'bd', slug: 'binh-duong' }],
        districts: [{ area_id: 'bd', name: 'Dĩ An', slug: 'di-an' }],
      },
    );
    const [path, qs] = href.split('?');
    expect(path).toBe('/cho-thue/binh-duong/di-an');
    const params = new URLSearchParams(qs);
    expect(params.get('area')).toBeNull();
    expect(params.get('district')).toBeNull();
    expect(params.get('ward')).toBe('Tân Đông Hiệp');
    expect(params.get('minPrice')).toBe('3');
  });

  it('sinh path cấp area khi không có district hoặc district chưa map được', () => {
    const href = pageToHref(
      { name: 'listings', listingType: 'mua_ban', areaId: 'bd', district: 'Không tồn tại' },
      { areas: [{ id: 'bd', slug: 'binh-duong' }], districts: [] },
    );
    const [path, qs] = href.split('?');
    expect(path).toBe('/mua-ban/binh-duong');
    expect(new URLSearchParams(qs).get('district')).toBe('Không tồn tại');
  });

  it('giữ URL query cũ khi thiếu taxonomy hoặc area không map được', () => {
    expect(pageToHref({ name: 'listings', listingType: 'cho_thue', areaId: 'unknown' }, {
      areas: [{ id: 'bd', slug: 'binh-duong' }],
      districts: [],
    })).toBe('/cho-thue?area=unknown');
    expect(pageToHref({ name: 'listings', listingType: 'cho_thue', areaId: 'bd' })).toBe('/cho-thue?area=bd');
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

  it('trang 1 không lên URL, trang > 1 thì có', () => {
    expect(pageToHref({ name: 'listings', page: 1 })).toBe('/danh-sach');
    expect(pageToHref({ name: 'listings', page: 3 })).toBe('/danh-sach?page=3');
  });

  it('bóc page (ép số) và bỏ qua page <= 1 hoặc không hợp lệ', () => {
    expect(parseListingParams({ page: '3' })).toEqual({ page: 3 });
    expect(parseListingParams({ page: '1' })).toEqual({});
    expect(parseListingParams({ page: 'abc' })).toEqual({});
  });

  it('round-trip page + sort giữ nguyên khi đổi trang trên filter đang áp dụng', () => {
    const page = { name: 'listings' as const, sort: 'price_asc', keyword: 'đất nền', page: 4 };
    const qs = pageToHref(page).split('?')[1];
    const sp = Object.fromEntries(new URLSearchParams(qs));
    expect(parseListingParams(sp)).toEqual({ sort: 'price_asc', keyword: 'đất nền', page: 4 });
  });

  it('round-trip page cùng path SEO khu vực: area lên path, page ở query', () => {
    const taxonomy = {
      areas: [{ id: 'a1', slug: 'binh-duong' }],
      districts: [{ slug: 'di-an', name: 'Dĩ An', area_id: 'a1' }],
    };
    const href = pageToHref({ name: 'listings', listingType: 'mua_ban', areaId: 'a1', district: 'Dĩ An', page: 2 }, taxonomy);
    const [path, qs] = href.split('?');
    expect(path).toBe('/mua-ban/binh-duong/di-an');
    expect(parseListingParams(Object.fromEntries(new URLSearchParams(qs)))).toEqual({ page: 2 });
  });

  it('round-trip isFeatured/isHot: link BĐS nổi bật và HOT chia sẻ được', () => {
    const featuredQs = pageToHref({ name: 'listings', isFeatured: true }).split('?')[1];
    expect(parseListingParams(Object.fromEntries(new URLSearchParams(featuredQs)))).toEqual({ isFeatured: true });

    const hotQs = pageToHref({ name: 'listings', isHot: true, typeId: 't1' }).split('?')[1];
    expect(parseListingParams(Object.fromEntries(new URLSearchParams(hotQs)))).toEqual({ isHot: true, typeId: 't1' });
  });

  it('không có featured/hot thì không sinh param và không tự bật cờ', () => {
    expect(pageToHref({ name: 'listings', isFeatured: false, isHot: false })).toBe('/danh-sach');
    expect(parseListingParams({})).toEqual({});
    expect(parseListingParams({ featured: '0', hot: 'true' })).toEqual({});
  });

  it('sinh ?loai=<slug> thân thiện khi tra được loại BĐS', () => {
    const taxonomy = {
      areas: [],
      districts: [],
      propertyTypes: [{ id: 't-uuid-1', slug: 'dat-nen' }],
    };
    expect(pageToHref({ name: 'listings', typeId: 't-uuid-1' }, taxonomy)).toBe('/danh-sach?loai=dat-nen');
  });

  it('không tra được slug thì giữ ?type=<uuid> để không vỡ link', () => {
    expect(pageToHref({ name: 'listings', typeId: 't-uuid-9' })).toBe('/danh-sach?type=t-uuid-9');
    const taxonomy = { areas: [], districts: [], propertyTypes: [{ id: 'khac', slug: 'can-ho' }] };
    expect(pageToHref({ name: 'listings', typeId: 't-uuid-9' }, taxonomy)).toBe('/danh-sach?type=t-uuid-9');
  });

  it('đọc được cả ?loai=<slug> mới và ?type=<uuid> cũ', () => {
    expect(parseListingParams({ loai: 'dat-nen' })).toEqual({ typeSlug: 'dat-nen' });
    expect(parseListingParams({ type: 't-uuid-1' })).toEqual({ typeId: 't-uuid-1' });
  });

  it('round-trip loai: page → href → parse giữ đúng slug', () => {
    const taxonomy = { areas: [], districts: [], propertyTypes: [{ id: 't1', slug: 'nha-pho' }] };
    const qs = pageToHref({ name: 'listings', typeId: 't1', keyword: 'sổ hồng' }, taxonomy).split('?')[1];
    expect(parseListingParams(Object.fromEntries(new URLSearchParams(qs)))).toEqual({ typeSlug: 'nha-pho', keyword: 'sổ hồng' });
  });
});
