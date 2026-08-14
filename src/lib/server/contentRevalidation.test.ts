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
    expect(paths).toEqual(['/', '/tin-tuc', '/tin-tuc/bai-cu', '/tin-tuc/bai-moi', '/tin-tuc/danh-muc/thi-truong']);
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

  it('không tạo path detail cho draft/hidden content chưa public', () => {
    const paths = collectContentRevalidationPaths({
      entity: 'news',
      action: 'create',
      targets: [{ current: { id: 'n1', slug: 'nhap', category: 'Thị trường', is_published: false } }],
    }, lookups);
    expect(paths).toEqual([]);
  });
});
