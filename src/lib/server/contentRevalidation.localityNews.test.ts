import { describe, expect, it } from 'vitest';
import { collectContentRevalidationPaths, parseContentRevalidationInput } from './contentRevalidation';

// areaNames là map TÊN đã chuẩn hoá -> slug, dùng để khớp bài viết narrative chỉ có
// geo_area (area_id null) với đúng trang khu vực.
const lookups = {
  areaSlugs: new Map([['area-1', 'binh-duong']]),
  areaNames: new Map([['Bình Dương', 'binh-duong']]),
  categorySlugs: new Map([['Thị trường', 'thi-truong']]),
};

// Khu vực cấu trúc Bình Dương + vùng narrative Bình Phước: bài viết thuộc cả hai.
const twoProvinceLookups = {
  areaSlugs: new Map([['area-1', 'binh-duong']]),
  areaNames: new Map([['Bình Dương', 'binh-duong'], ['Bình Phước', 'binh-phuoc']]),
  categorySlugs: new Map([['Thị trường', 'thi-truong']]),
};

function newsPaths(target: Record<string, unknown>) {
  return collectContentRevalidationPaths({ entity: 'news', action: 'update', targets: [target as never] }, lookups);
}

describe('collectContentRevalidationPaths — bài narrative khớp geo_area', () => {
  it('purge cụm khu vực khi bài chỉ có geo_area, không có area_id', () => {
    const paths = newsPaths({ current: { id: 'n1', slug: 'bai-viet', category: 'Thị trường', is_published: true, area_id: null, geo_area: '  Bình   Dương ' } });

    expect(paths).toContain('/khu-vuc/binh-duong');
    expect(paths).toContain('/khu-vuc/binh-duong/thong-tin');
    expect(paths).toContain('/khu-vuc/binh-duong/tin-tuc');
  });

  it('giữ nguyên route bài viết, danh mục và sitemap đã có', () => {
    const paths = newsPaths({ current: { id: 'n1', slug: 'bai-viet', category: 'Thị trường', is_published: true, area_id: null, geo_area: 'Bình Dương' } });

    expect(paths).toEqual(expect.arrayContaining([
      '/', '/tin-tuc', '/kien-thuc', '/sitemap.xml', '/sitemap-images.xml',
      '/tin-tuc/bai-viet', '/tin-tuc/danh-muc/thi-truong',
    ]));
  });

  it('vẫn purge cụm khu vực khi bài gắn area_id cấu trúc', () => {
    const paths = newsPaths({ current: { id: 'n1', slug: 'bai-viet', category: 'Thị trường', is_published: true, area_id: 'area-1', geo_area: null } });

    expect(paths).toContain('/khu-vuc/binh-duong');
    expect(paths).toContain('/khu-vuc/binh-duong/thong-tin');
    expect(paths).toContain('/khu-vuc/binh-duong/tin-tuc');
  });

  it('purge CẢ HAI cụm khu vực khi area_id và geo_area trỏ hai tỉnh khác nhau', () => {
    const paths = collectContentRevalidationPaths({
      entity: 'news',
      action: 'update',
      targets: [{ current: { id: 'n1', slug: 'bai-viet', category: 'Thị trường', is_published: true, area_id: 'area-1', geo_area: 'Bình Phước' } }] as never,
    }, twoProvinceLookups);

    // Khớp cấu trúc (Bình Dương) theo area_id...
    expect(paths).toContain('/khu-vuc/binh-duong');
    expect(paths).toContain('/khu-vuc/binh-duong/thong-tin');
    expect(paths).toContain('/khu-vuc/binh-duong/tin-tuc');
    // ...và khớp narrative (Bình Phước) theo geo_area, không bị nhánh cấu trúc che mất.
    expect(paths).toContain('/khu-vuc/binh-phuoc');
    expect(paths).toContain('/khu-vuc/binh-phuoc/thong-tin');
    expect(paths).toContain('/khu-vuc/binh-phuoc/tin-tuc');
  });

  it('dedup path khi area_id và geo_area cùng trỏ về một khu vực', () => {
    const paths = newsPaths({ current: { id: 'n1', slug: 'bai-viet', category: 'Thị trường', is_published: true, area_id: 'area-1', geo_area: '  Bình   Dương ' } });

    expect(paths.filter(path => path === '/khu-vuc/binh-duong')).toHaveLength(1);
    expect(paths.filter(path => path === '/khu-vuc/binh-duong/thong-tin')).toHaveLength(1);
    expect(paths.filter(path => path === '/khu-vuc/binh-duong/tin-tuc')).toHaveLength(1);
  });

  it('không khớp substring khi geo_area chứa thêm địa danh khác', () => {
    const paths = newsPaths({ current: { id: 'n1', slug: 'bai-viet', category: 'Thị trường', is_published: true, area_id: null, geo_area: 'Bình Dương và Đồng Nai' } });

    expect(paths).not.toContain('/khu-vuc/binh-duong/tin-tuc');
    expect(paths).not.toContain('/khu-vuc/binh-duong');
  });

  it('không purge cụm khu vực khi geo_area không khớp vùng nào', () => {
    const paths = newsPaths({ current: { id: 'n1', slug: 'bai-viet', category: 'Thị trường', is_published: true, area_id: null, geo_area: 'Nơi khác' } });

    expect(paths.some(path => path.startsWith('/khu-vuc/'))).toBe(false);
  });

  it('không đoán bừa khi hai khu vực chuẩn hoá trùng tên', () => {
    // buildAreaNames loại bỏ tên khớp về nhiều slug: map rỗng đúng như loadLookups trả về.
    const ambiguous = { ...lookups, areaNames: new Map<string, string>() };
    const paths = collectContentRevalidationPaths({
      entity: 'news',
      action: 'update',
      targets: [{ current: { id: 'n1', slug: 'bai-viet', category: 'Thị trường', is_published: true, area_id: null, geo_area: 'Bình Dương' } }] as never,
    }, ambiguous);

    expect(paths.some(path => path.startsWith('/khu-vuc/'))).toBe(false);
  });

  it('tin chưa publish không purge cụm khu vực', () => {
    const paths = newsPaths({ current: { id: 'n1', slug: 'ban-nhap', category: 'Thị trường', is_published: false, area_id: 'area-1', geo_area: 'Bình Dương' } });

    expect(paths).toEqual([]);
  });

  it('trước và sau khi đổi khu vực đều được purge', () => {
    const paths = collectContentRevalidationPaths({
      entity: 'news',
      action: 'update',
      targets: [{
        previous: { id: 'n1', slug: 'bai-viet', category: 'Thị trường', is_published: true, area_id: 'area-1', geo_area: null },
        current: { id: 'n1', slug: 'bai-viet', category: 'Thị trường', is_published: true, area_id: null, geo_area: 'Bình Dương' },
      }] as never,
    }, lookups);

    expect(paths).toContain('/khu-vuc/binh-duong/tin-tuc');
    expect(paths.filter(path => path === '/khu-vuc/binh-duong/thong-tin')).toHaveLength(1);
  });

  it('bài unpublish vẫn purge cụm khu vực của snapshot trước đó', () => {
    const paths = collectContentRevalidationPaths({
      entity: 'news',
      action: 'unpublish',
      targets: [{
        previous: { id: 'n1', slug: 'bai-viet', category: 'Thị trường', is_published: true, area_id: 'area-1', geo_area: null },
        current: { id: 'n1', slug: 'bai-viet', category: 'Thị trường', is_published: false, area_id: 'area-1', geo_area: null },
      }] as never,
    }, lookups);

    expect(paths).toContain('/khu-vuc/binh-duong/tin-tuc');
  });

  it('route allowlist chấp nhận /khu-vuc/{slug}/thong-tin', () => {
    const parsed = parseContentRevalidationInput({
      entity: 'route',
      action: 'update',
      targets: [{ current: { path: '/khu-vuc/binh-duong/thong-tin' } }],
    });
    expect(parsed.error).toBeUndefined();
  });

  it('route allowlist chấp nhận /khu-vuc/{slug} nhưng từ chối path ngoài allowlist', () => {
    expect(parseContentRevalidationInput({
      entity: 'route',
      action: 'update',
      targets: [{ current: { path: '/khu-vuc/binh-duong' } }],
    }).error).toBeUndefined();
    expect(parseContentRevalidationInput({
      entity: 'route',
      action: 'update',
      targets: [{ current: { path: '/khu-vuc/binh-duong/xoa-cache' } }],
    }).error).toBe('Thông tin taxonomy không hợp lệ.');
  });
});
