import { describe, expect, it } from 'vitest';
import {
  collectContentRevalidationPaths,
  parseContentRevalidationInput,
  type RevalidationLookups,
} from './contentRevalidation';

const lookups: RevalidationLookups = {
  areaSlugs: new Map([
    ['area-bd', 'binh-duong'],
    ['area-bp', 'binh-phuoc'],
  ]),
  categorySlugs: new Map(),
  districtSlugs: new Map([
    ['d-di-an', { areaId: 'area-bd', slug: 'binh-duong-di-an' }],
    ['d-thuan-an', { areaId: 'area-bd', slug: 'binh-duong-thuan-an' }],
    ['d-dong-xoai', { areaId: 'area-bp', slug: 'binh-phuoc-dong-xoai' }],
  ]),
  propertyTypeSlugs: new Map([['t-nha-pho', 'nha-pho']]),
};

function propertyTarget(overrides: Record<string, unknown> = {}) {
  return {
    current: {
      id: 'p-1',
      slug: 'nha-dep',
      public_code: 101,
      listing_type: 'mua_ban' as const,
      district: 'Dĩ An',
      district_id: 'd-di-an',
      property_type_id: 't-nha-pho',
      area_id: 'area-bd',
      is_active: true,
      ...overrides,
    },
  };
}

describe('collectContentRevalidationPaths — phạm vi địa phương trước/sau', () => {
  it('tin chuyển huyện: purge CẢ huyện cũ lẫn huyện mới', () => {
    const paths = collectContentRevalidationPaths({
      entity: 'property',
      action: 'update',
      targets: [{
        current: propertyTarget({ district_id: 'd-thuan-an', district: 'Thuận An' }).current as never,
        previous: propertyTarget({ district_id: 'd-di-an', district: 'Dĩ An' }).current as never,
      }],
    }, lookups);

    // Cả hai landing huyện phải được làm mới, không chỉ cái mới.
    expect(paths).toContain('/mua-ban/binh-duong/di-an/nha');
    expect(paths).toContain('/mua-ban/binh-duong/thuan-an/nha');
  });

  it('tin chuyển tỉnh: purge cả tỉnh cũ lẫn tỉnh mới', () => {
    const paths = collectContentRevalidationPaths({
      entity: 'property',
      action: 'update',
      targets: [{
        current: propertyTarget({ area_id: 'area-bp', district_id: 'd-dong-xoai', district: 'Đồng Xoài' }).current as never,
        previous: propertyTarget({ area_id: 'area-bd', district_id: 'd-di-an', district: 'Dĩ An' }).current as never,
      }],
    }, lookups);

    expect(paths).toContain('/khu-vuc/binh-duong');
    expect(paths).toContain('/khu-vuc/binh-phuoc');
    expect(paths).toContain('/mua-ban/binh-duong/di-an/nha');
    expect(paths).toContain('/mua-ban/binh-phuoc/dong-xoai/nha');
  });

  it('tin ẩn/expire: purge đúng landing cũ của nó', () => {
    const paths = collectContentRevalidationPaths({
      entity: 'property',
      action: 'unpublish',
      targets: [{ previous: propertyTarget({ is_active: true }).current as never, current: undefined }],
    }, lookups);

    expect(paths).toContain('/khu-vuc/binh-duong');
    expect(paths).toContain('/mua-ban/binh-duong/di-an/nha');
  });

  it('không nhận path tùy ý từ client dù payload có field path', () => {
    const result = parseContentRevalidationInput({
      entity: 'property',
      action: 'update',
      path: '/xoa-cache-tuy-y',
      targets: [propertyTarget()],
    });
    // field `path` ngoài schema không được dùng để purge.
    if (result.input) {
      const paths = collectContentRevalidationPaths(result.input, lookups);
      expect(paths).not.toContain('/xoa-cache-tuy-y');
    }
  });

  it('area đổi slug: purge cả slug cũ và mới', () => {
    const paths = collectContentRevalidationPaths({
      entity: 'area',
      action: 'update',
      targets: [{ current: { id: 'area-bd', slug: 'binh-duong-moi' }, previous: { id: 'area-bd', slug: 'binh-duong' } }],
    }, lookups);

    expect(paths).toContain('/khu-vuc/binh-duong');
    expect(paths).toContain('/khu-vuc/binh-duong-moi');
  });
});
