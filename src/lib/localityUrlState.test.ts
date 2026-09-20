import { describe, expect, it } from 'vitest';
import { isSameListingUrl, preserveLocalityPath } from './localityUrlState';

const NAMESPACE_PATHS = [
  '/mua-ban/binh-duong/loai/dat-nen',
  '/mua-ban/binh-duong/gia/tu-1-den-duoi-2-ty',
  '/mua-ban/binh-duong/thuan-an/phuong-xa/an-phu',
  '/cho-thue/binh-duong/loai/nha-rieng',
];

describe('preserveLocalityPath', () => {
  it.each(NAMESPACE_PATHS)('keeps the namespace path %s when only query filters change', pathname => {
    expect(preserveLocalityPath(
      { pathname, search: '' },
      '/mua-ban/binh-duong?q=nha&sort=price_asc',
    )).toBe(`${pathname}?q=nha&sort=price_asc`);
  });

  it('ignores the legacy path pageToHref would have produced', () => {
    // pageToHref không biết namespace mới nên trả về path cũ — path đó phải bị bỏ.
    const result = preserveLocalityPath(
      { pathname: '/mua-ban/binh-duong/gia/duoi-1-ty', search: '' },
      '/mua-ban/binh-duong?minArea=50&maxArea=100',
    );
    expect(result.startsWith('/mua-ban/binh-duong/gia/duoi-1-ty?')).toBe(true);
    expect(result).not.toContain('/mua-ban/binh-duong?');
  });

  it('replaces managed query params instead of accumulating stale ones', () => {
    expect(preserveLocalityPath(
      { pathname: '/mua-ban/binh-duong/loai/dat-nen', search: '?q=cu&bedrooms=2' },
      '/mua-ban/binh-duong?q=moi',
    )).toBe('/mua-ban/binh-duong/loai/dat-nen?q=moi');
  });

  it('preserves unknown query params such as campaign tracking', () => {
    const result = preserveLocalityPath(
      { pathname: '/mua-ban/binh-duong/gia/tu-5-ty', search: '?utm_source=zalo&q=cu' },
      '/mua-ban/binh-duong?q=moi',
    );
    const params = new URLSearchParams(result.split('?')[1]);
    expect(params.get('utm_source')).toBe('zalo');
    expect(params.get('q')).toBe('moi');
  });

  it('drops the query entirely when nothing remains', () => {
    expect(preserveLocalityPath(
      { pathname: '/mua-ban/binh-duong/gia/duoi-1-ty', search: '?q=cu' },
      '/mua-ban/binh-duong',
    )).toBe('/mua-ban/binh-duong/gia/duoi-1-ty');
  });

  it('never rewrites the route path, even when pageToHref points at the legacy tree', () => {
    // pageToHref không biết namespace /loai/, /gia/, /phuong-xa/ nên nó trả href thuộc
    // cây route cũ. Path của schema phải BẤT BIẾN trong lúc còn ở landing.
    const result = preserveLocalityPath(
      { pathname: '/mua-ban/binh-duong/gia/duoi-1-ty', search: '' },
      '/mua-ban/binh-duong?sort=views',
    );
    expect(result.split('?')[0]).toBe('/mua-ban/binh-duong/gia/duoi-1-ty');
  });

  it('never leaks a stale scope param into the preserved query', () => {
    // Query được dựng lại từ href mới; tham số phạm vi cũ trong URL hiện tại phải biến
    // mất chứ không được "dính" sang (type/area là chiều route đang sở hữu).
    const result = preserveLocalityPath(
      { pathname: '/mua-ban/binh-duong/loai/nha', search: '?type=uuid-cu&area=uuid-cu&page=2' },
      '/danh-sach?q=moi&page=2',
    );
    const params = new URLSearchParams(result.split('?')[1]);
    expect(params.get('type')).toBeNull();
    expect(params.get('area')).toBeNull();
    expect(params.get('page')).toBe('2');
    expect(params.get('q')).toBe('moi');
  });

  it('is stable across repeated application', () => {    const once = preserveLocalityPath(
      { pathname: '/mua-ban/binh-duong/phuong-xa/an-phu', search: '' },
      '/mua-ban/binh-duong?sort=views&page=3',
    );
    const twice = preserveLocalityPath(
      { pathname: '/mua-ban/binh-duong/phuong-xa/an-phu', search: once.split('?')[1] ? `?${once.split('?')[1]}` : '' },
      once,
    );
    expect(twice).toBe(once);
  });

  it('falls back to the given href when there is no current pathname', () => {
    expect(preserveLocalityPath({ pathname: '', search: '' }, '/danh-sach?q=a')).toBe('/danh-sach?q=a');
  });
});

describe('isSameListingUrl', () => {
  it('treats a differently ordered query as the same URL', () => {
    expect(isSameListingUrl(
      { pathname: '/mua-ban/binh-duong/loai/dat-nen', search: '?sort=views&q=a' },
      '/mua-ban/binh-duong/loai/dat-nen?q=a&sort=views',
    )).toBe(true);
  });

  it('detects a path change', () => {
    expect(isSameListingUrl(
      { pathname: '/mua-ban/binh-duong/loai/dat-nen', search: '' },
      '/mua-ban/binh-duong?q=a',
    )).toBe(false);
  });

  it('detects a query change', () => {
    expect(isSameListingUrl(
      { pathname: '/mua-ban/binh-duong/loai/dat-nen', search: '?q=a' },
      '/mua-ban/binh-duong/loai/dat-nen?q=b',
    )).toBe(false);
  });

  it('normalizes an empty query and a trailing question mark', () => {
    expect(isSameListingUrl(
      { pathname: '/mua-ban/binh-duong/gia/duoi-1-ty', search: '' },
      '/mua-ban/binh-duong/gia/duoi-1-ty?',
    )).toBe(true);
  });
});
