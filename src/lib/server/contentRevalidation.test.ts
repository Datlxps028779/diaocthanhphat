import { describe, expect, it } from 'vitest';
import { collectContentRevalidationPaths, parseContentRevalidationInput } from './contentRevalidation';

const lookups = {
  areaSlugs: new Map([['area-1', 'binh-duong']]),
  categorySlugs: new Map([['Thị trường', 'thi-truong']]),
};

describe('parseContentRevalidationInput', () => {
  it('chấp nhận snapshot Tin tức có cấu trúc', () => {
    const result = parseContentRevalidationInput({
      entity: 'news',
      action: 'publish',
      targets: [{ current: { id: 'n1', slug: 'bai-viet', category: 'Thị trường', is_published: true } }],
    });
    expect(result.error).toBeUndefined();
    expect(result.input?.entity).toBe('news');
  });

  it('từ chối path tùy ý và snapshot thiếu trường bắt buộc', () => {
    expect(parseContentRevalidationInput({
      entity: 'news',
      action: 'publish',
      path: '/xoa-cache-tuy-y',
      targets: [{ current: { id: 'n1', slug: 'bai-viet', category: 'Thị trường' } }],
    }).error).toBe('Thông tin tin tức không hợp lệ.');
  });

  it('giới hạn batch tránh purge hàng loạt không kiểm soát', () => {
    expect(parseContentRevalidationInput({ entity: 'news', action: 'bulk', targets: [] }).error)
      .toBe('Cần 1–60 mục nội dung để làm mới cache.');
  });
});

describe('collectContentRevalidationPaths', () => {
  it('purge route public cũ và mới khi Tin tức đổi slug/category/publish', () => {
    const paths = collectContentRevalidationPaths({
      entity: 'news',
      action: 'update',
      targets: [{
        previous: { id: 'n1', slug: 'bai-cu', category: 'Thị trường', is_published: true },
        current: { id: 'n1', slug: 'bai-moi', category: 'Thị trường', is_published: true },
      }],
    }, lookups);
    expect(paths).toEqual(['/', '/kien-thuc', '/sitemap.xml', '/tin-tuc', '/tin-tuc/bai-cu', '/tin-tuc/bai-moi', '/tin-tuc/danh-muc/thi-truong']);
  });

  it('purge home/list/detail và route khu vực cho Sản phẩm active', () => {
    const paths = collectContentRevalidationPaths({
      entity: 'property',
      action: 'update',
      targets: [{
        current: {
          id: 'p1', slug: 'nha-dep', public_code: 101, listing_type: 'mua_ban',
          district: 'Thuận An', area_id: 'area-1', is_active: true,
        },
      }],
    }, lookups);
    expect(paths).toContain('/');
    expect(paths).toContain('/danh-sach');
    expect(paths).toContain('/mua-ban');
    expect(paths).toContain('/mua-ban/binh-duong');
    expect(paths).toContain('/mua-ban/binh-duong/thuan-an');
    expect(paths).toContain('/mua-ban/binh-duong/thuan-an/nha-dep-pr101');
  });

  it('purge khu dân cư và khu vực khi property active có neighborhood', () => {
    const paths = collectContentRevalidationPaths({
      entity: 'property',
      action: 'update',
      targets: [{
        current: {
          id: 'p2', slug: 'nha-2', public_code: 102, listing_type: 'cho_thue',
          district: 'Dĩ An', area_id: 'area-1', neighborhood_slug: 'tan-binh', is_active: true,
        },
      }],
    }, lookups);
    expect(paths).toContain('/khu-dan-cu/tan-binh');
    expect(paths).toContain('/khu-vuc/binh-duong');
    expect(paths).toContain('/sitemap.xml');
    expect(paths).toContain('/sitemap-images.xml');
  });

  it('purge route tĩnh và route public theo slug, từ chối route tùy ý', () => {
    expect(collectContentRevalidationPaths({
      entity: 'route', action: 'update', targets: [{ current: { path: '/tin-tuc' } }],
    }, lookups)).toEqual(['/sitemap.xml', '/tin-tuc']);
    expect(parseContentRevalidationInput({
      entity: 'route', action: 'update', targets: [{ current: { path: '/trang/gioi-thieu' } }],
    }).error).toBeUndefined();
    expect(parseContentRevalidationInput({
      entity: 'route', action: 'update', targets: [{ current: { path: '/xoa-cache-tuy-y' } }],
    }).error).toBe('Thông tin taxonomy không hợp lệ.');
  });

  it('không tạo path detail cho draft/hidden content chưa public', () => {
    const paths = collectContentRevalidationPaths({
      entity: 'news',
      action: 'create',
      targets: [{ current: { id: 'n1', slug: 'nhap', category: 'Thị trường', is_published: false } }],
    }, lookups);
    expect(paths).toEqual([]);
  });

  it('purge area và khu dân cư cũ/mới khi slug thay đổi', () => {
    const areaPaths = collectContentRevalidationPaths({
      entity: 'area', action: 'update', targets: [{
        previous: { id: 'area-1', slug: 'binh-duong-cu' },
        current: { id: 'area-1', slug: 'binh-duong' },
      }],
    }, lookups);
    expect(areaPaths).toContain('/khu-vuc/binh-duong-cu');
    expect(areaPaths).toContain('/mua-ban/binh-duong');

    const neighborhoodPaths = collectContentRevalidationPaths({
      entity: 'neighborhood', action: 'update', targets: [{
        previous: { id: 'n1', slug: 'tan-binh-cu', area_id: 'area-1' },
        current: { id: 'n1', slug: 'tan-binh', area_id: 'area-1' },
      }],
    }, lookups);
    expect(neighborhoodPaths).toContain('/khu-dan-cu/tan-binh-cu');
    expect(neighborhoodPaths).toContain('/khu-dan-cu/tan-binh');
  });
});
