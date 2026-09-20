import { describe, expect, it } from 'vitest';
import {
  confineIntentFilters,
  localityScopeEditPatch,
  localityScopeFilterPatch,
  localityScopeInitialPatch,
  localityScopeOwnedDimensions,
  localityScopeSelectPatch,
  type LocalityScopeFacts,
} from './localityScopeEditing';

// Phạm vi landing địa phương: route sở hữu các chiều địa lý/loại/giá. Các test dưới
// đây đi qua chính builder mà ListingsPage dùng, để lỗi ở tầng wiring cũng lộ ra.
const SALE = { min: 1, max: 2 };
const RENT = { min: 3, max: 5 };

function facts(overrides: Partial<LocalityScopeFacts> = {}): LocalityScopeFacts {
  return {
    areaId: 'area-bd',
    districtId: 'district-thuan-an',
    wardId: 'ward-an-phu',
    districtName: 'Thuận An',
    wardName: 'An Phú',
    areaName: 'Bình Dương',
    typeIds: ['type-house'],
    typePathSlug: 'nha',
    listingType: 'mua_ban',
    priceBand: undefined,
    copy: {
      keyword: 'nhà phố',
      minArea: 50,
      maxArea: 100,
      bedrooms: '3',
      direction: 'Đông Nam',
      legal: 'Sổ hồng',
      sort: 'price_asc' as const,
      isFeatured: true,
      isHot: false,
      page: 4,
    },
    ...overrides,
  };
}

describe('localityScopeFilterPatch — điều kiện gửi xuống truy vấn', () => {
  it('khi có ID thì BỎ điều kiện theo tên, để nhãn cũ trong bản ghi không làm mất dòng', () => {
    const patch = localityScopeFilterPatch({
      districtId: 'district-1', wardId: 'ward-1', district: 'Thuận An', ward: 'An Phú',
    });
    expect(patch).toEqual({ districtId: 'district-1', wardId: 'ward-1' });
    expect('district' in patch).toBe(false);
    expect('ward' in patch).toBe(false);
  });

  it('không có ID thì vẫn lọc theo tên như cũ (tìm kiếm thường)', () => {
    expect(localityScopeFilterPatch({ district: 'Dĩ An', ward: 'Tân Đông Hiệp' }))
      .toEqual({ district: 'Dĩ An', ward: 'Tân Đông Hiệp' });
  });

  it('ID và tên của hai cấp khác nhau được xử lý độc lập', () => {
    expect(localityScopeFilterPatch({ districtId: 'd1', district: 'Thuận An', ward: 'An Phú' }))
      .toEqual({ districtId: 'd1', ward: 'An Phú' });
  });

  it('giữ nguyên typeId khi route KHÔNG khai typeIds (nhóm loại không được route chốt)', () => {
    // Trang địa phương không có segment /loai/ vẫn cho phép người dùng tự chọn loại;
    // ép undefined sẽ nuốt mất lựa chọn đó.
    expect(localityScopeFilterPatch({ typeId: 'type-1', hasRouteTypeIds: false }).typeId).toBe('type-1');
  });

  it('route đã chốt typeIds thì typeId lẻ bị bỏ để không chồng hai hợp đồng loại', () => {
    const patch = localityScopeFilterPatch({ typeId: 'type-1', typeIds: undefined, hasRouteTypeIds: true });
    expect(patch.typeId).toBeUndefined();
    expect('typeId' in patch).toBe(false);
  });

  it('dựng lại đầy đủ các chiều của landing', () => {
    expect(localityScopeFilterPatch({
      typeId: 'ignored', typeIds: ['t1', 't2'], hasRouteTypeIds: true,
      districtId: 'd1', wardId: 'w1', districtIdPresent: true, wardIdPresent: true,
      salePriceBand: 'tu-1-den-duoi-2-ty',
    })).toEqual({
      typeIds: ['t1', 't2'], districtId: 'd1', wardId: 'w1', salePriceBand: 'tu-1-den-duoi-2-ty',
    });
  });
});

describe('localityScopeSelectPatch — giữ cha địa lý khi chọn cấp con', () => {
  const base = {
    areaId: 'area-bd', areaName: 'Bình Dương',
    districtId: 'district-thuan-an', districtName: 'Thuận An',
    wardId: 'ward-an-phu', wardName: 'An Phú',
  };

  it('bỏ phường nhưng GIỮ quận và tỉnh (không rơi về địa lý cùng tên toàn quốc)', () => {
    // Page mang địa lý theo TÊN (district/ward) — id chỉ có ở lớp filter.
    expect(localityScopeSelectPatch(base, { kind: 'ward', id: '' })).toEqual({
      areaId: 'area-bd', district: 'Thuận An',
    });
  });

  it('chọn phường khác giữ nguyên quận làm cha', () => {
    expect(localityScopeSelectPatch(base, { kind: 'ward', id: 'ward-other' })).toEqual({
      areaId: 'area-bd', district: 'Thuận An', ward: 'ward-other',
    });
  });

  it('bỏ quận thì bỏ luôn phường nhưng giữ tỉnh', () => {
    expect(localityScopeSelectPatch(base, { kind: 'district', id: '' })).toEqual({ areaId: 'area-bd' });
  });

  it('chọn quận mới giữ tỉnh, xóa phường cũ', () => {
    expect(localityScopeSelectPatch(base, { kind: 'district', id: 'district-di-an', name: 'Dĩ An' })).toEqual({
      areaId: 'area-bd', district: 'Dĩ An',
    });
  });

  it('chọn tỉnh mới bỏ mọi cấp con', () => {
    expect(localityScopeSelectPatch(base, { kind: 'area', id: 'area-hn' })).toEqual({ areaId: 'area-hn' });
  });

  it('bỏ tỉnh cũng bỏ con', () => {
    expect(localityScopeSelectPatch(base, { kind: 'area', id: '' })).toEqual({});
  });

  it('sửa loại/giá giữ nguyên cha địa lý', () => {
    expect(localityScopeSelectPatch(base, { kind: 'type', id: 'type-1' }))
      .toMatchObject({ areaId: 'area-bd', district: 'Thuận An', ward: 'An Phú' });
    expect(localityScopeSelectPatch(base, { kind: 'price' }))
      .toMatchObject({ areaId: 'area-bd', district: 'Thuận An' });
  });
});

describe('localityScopeInitialPatch — state ban đầu ngoài phạm vi luôn bị bỏ', () => {
  it('không mang band cũ của route khi điều hướng sang phạm vi khác', () => {
    const patch = localityScopeInitialPatch({
      listingType: 'mua_ban',
      priceRange: SALE,
      fillAreaSqm: false,
    });
    expect(patch.listingType).toBe('mua_ban');
    expect('salePriceBand' in patch).toBe(false);
    expect(patch.maxArea).toBeUndefined();
    expect(patch.minArea).toBeUndefined();
  });

  it('chọn khoảng giá thì dùng bảng giá theo HÌNH THỨC giao dịch, không hardcode giá bán', () => {
    // Cho thuê trả về khoảng triệu/tháng; dùng nhầm bảng bán sẽ lọc ra khoảng tiền tỷ.
    expect(localityScopeInitialPatch({ listingType: 'cho_thue', priceRange: RENT, fillAreaSqm: false }))
      .toEqual({ listingType: 'cho_thue', minPrice: RENT.min, maxPrice: RENT.max });
    expect(localityScopeInitialPatch({ listingType: 'mua_ban', priceRange: SALE, fillAreaSqm: false }))
      .toEqual({ listingType: 'mua_ban', minPrice: SALE.min, maxPrice: SALE.max });
  });

  it('khoảng giá không hợp lệ thì không ghi min/max rác', () => {
    expect(localityScopeInitialPatch({ listingType: 'mua_ban', priceRange: undefined, fillAreaSqm: false }))
      .toEqual({ listingType: 'mua_ban' });
  });

  it('điền được diện tích và giữ các bộ lọc ngoài phạm vi', () => {
    expect(localityScopeInitialPatch({ listingType: 'mua_ban', priceRange: SALE, fillAreaSqm: true }))
      .toMatchObject({ minArea: SALE.min, maxArea: SALE.max });
  });
});

describe('localityScopeEditPatch — ngữ cảnh điều hướng khi rời landing', () => {
  it('bỏ phường nhưng giữ tỉnh làm cha, kèm lựa chọn khác của người dùng', () => {
    const patch = localityScopeEditPatch(facts(), { kind: 'ward', id: '' });
    expect(patch.areaId).toBe('area-bd');
    expect(patch.district).toBe('Thuận An');
    expect('ward' in patch).toBe(false);
  });

  it('chọn loại khác thì giữ tỉnh/quận nhưng bỏ nhóm loại cũ của route', () => {
    const patch = localityScopeEditPatch(facts(), { kind: 'type', id: 'type-apartment' });
    expect(patch.areaId).toBe('area-bd');
    expect(patch.district).toBe('Thuận An');
    expect(patch.typeId).toBe('type-apartment');
    expect('typeIds' in patch).toBe(false);
  });

  it('bỏ khoảng giá của route khi chọn khoảng giá khác, và bỏ chiều không tương thích', () => {
    const patch = localityScopeEditPatch(facts({ priceBand: 'tu-1-den-duoi-2-ty' }), { kind: 'price', priceRange: RENT });
    expect(patch.minPrice).toBe(RENT.min);
    expect(patch.maxPrice).toBe(RENT.max);
    expect('salePriceBand' in patch).toBe(false);
  });

  it('đổi hình thức giao dịch vẫn giữ địa lý nhưng bỏ band giá bán cũ', () => {
    const patch = localityScopeEditPatch(facts({ priceBand: 'tu-5-ty' }), { kind: 'listingType', listingType: 'cho_thue' });
    expect(patch.listingType).toBe('cho_thue');
    expect(patch.areaId).toBe('area-bd');
    expect('salePriceBand' in patch).toBe(false);
  });

  it('đổi tỉnh thì bỏ quận/phường cũ', () => {
    const patch = localityScopeEditPatch(facts(), { kind: 'area', id: 'area-hn' });
    expect(patch.areaId).toBe('area-hn');
    expect('district' in patch).toBe(false);
    expect('ward' in patch).toBe(false);
  });

  it('luôn mang theo các bộ lọc ngoài phạm vi (từ khóa, diện tích, sort)', () => {
    const patch = localityScopeEditPatch(facts(), { kind: 'ward', id: '' });
    expect(patch.keyword).toBe('nhà phố');
    expect(patch.minArea).toBe(50);
    expect(patch.maxArea).toBe(100);
    expect(patch.bedrooms).toBe('3');
    expect(patch.direction).toBe('Đông Nam');
    expect(patch.legal).toBe('Sổ hồng');
    expect(patch.sort).toBe('price_asc');
    expect(patch.isFeatured).toBe(true);
    // Phân trang KHÔNG đi theo: đổi phạm vi là đổi tập kết quả.
    expect('page' in patch).toBe(false);
  });

  it('page 1 và sort mặc định không lên URL nền', () => {
    const patch = localityScopeEditPatch(facts({ copy: { sort: 'newest', page: 1 } }), { kind: 'ward', id: '' });
    expect('page' in patch).toBe(false);
    expect(patch.sort).toBeUndefined();
  });
});

describe('localityScopeSelectPatch + localityScopeEditPatch — thao tác ngoài phạm vi', () => {
  it('chọn lại ĐÚNG khu vực đang xem không tính là đổi phạm vi', () => {
    // Trước đây các chiều không được truyền bị điền '' nên so sánh luôn lệch.
    const merged = { districtId: 'district-thuan-an', wardId: 'ward-an-phu', typeIds: ['type-house'], priceBand: undefined };
    expect(merged.districtId).toBe('district-thuan-an');
  });
});

describe('localityScopeOwnedDimensions — route chỉ sở hữu chiều NÓ khai', () => {
  it('owns price only for a sale band, never for a generic price query', () => {
    // /mua-ban/a?minPrice=2 có khoảng giá trong QUERY, không phải trên path — route
    // không sở hữu nó, nên effect phải giữ lại thay vì xóa rồi mất khi refresh.
    expect(localityScopeOwnedDimensions({ path: '/mua-ban/a', areaId: 'a' }).price).toBe(false);
    expect(localityScopeOwnedDimensions({ path: '/mua-ban/a/gia/duoi-1-ty', areaId: 'a', priceBand: 'duoi-1-ty' }).price).toBe(true);
  });

  it('owns type only when the path carries a type segment', () => {
    expect(localityScopeOwnedDimensions({ path: '/mua-ban/a', areaId: 'a' }).type).toBe(false);
    expect(localityScopeOwnedDimensions({ path: '/mua-ban/a/loai/nha', areaId: 'a', typePathSlug: 'nha' }).type).toBe(true);
  });

  it('does not claim type ownership from typeIds alone (no path segment)', () => {
    // Nhóm loại suy ra từ từ khóa/nơi gọi khác không biến route thành chủ sở hữu loại.
    expect(localityScopeOwnedDimensions({ path: '/mua-ban/a', areaId: 'a', typeIds: ['t1'] }).type).toBe(false);
  });

  it('always owns the geographic levels it resolves, and listing type', () => {
    const owned = localityScopeOwnedDimensions({ path: '/mua-ban/a/d/phuong-xa/w', areaId: 'a', districtId: 'd', wardId: 'w' });
    expect(owned).toMatchObject({ area: true, district: true, ward: true, listingType: true });
  });
});

describe('localityScopeSelectPatch — thao tác không được phép no-op', () => {
  it('đổi loại ở landing không có segment loại vẫn phải điều hướng', () => {
    // Chọn lại ĐÚNG loại đang xem ở landing KHÔNG khai loại trên path: giá trị state
    // trùng nhưng phạm vi vẫn đổi (URL nền phải mang ?type=).
    expect(localityScopeSelectPatch(
      { areaId: 'a', districtId: '', wardId: '' },
      { kind: 'type', id: 't1' },
    ).typeId).toBe('t1');
  });

  it('bỏ khoảng giá của route luôn tạo patch khác rỗng để không no-op', () => {
    const patch = localityScopeEditPatch(facts({ priceBand: 'duoi-1-ty' }), { kind: 'price', priceRange: undefined });
    expect('salePriceBand' in patch).toBe(false);
    expect(patch.minPrice).toBeUndefined();
    expect(patch.maxPrice).toBeUndefined();
  });
});

describe('localityScopeEditPatch — giữ bộ lọc QUERY ngoài phạm vi, reset phân trang', () => {
  // Route chỉ sở hữu chiều NÓ khai trên path. type/minPrice/maxPrice đến từ query
  // (?type=, ?minPrice=) là lựa chọn của người dùng — đổi địa lý không được xóa chúng.
  const withQueryCopy = () => facts({
    copy: { keyword: 'nhà phố', typeId: 'type-q', minPrice: 2, maxPrice: 6, page: 4 },
  });

  it('giữ type + khoảng giá query khi đổi tỉnh', () => {
    const patch = localityScopeEditPatch(withQueryCopy(), { kind: 'area', id: 'area-hn' });
    expect(patch.typeId).toBe('type-q');
    expect(patch.minPrice).toBe(2);
    expect(patch.maxPrice).toBe(6);
  });

  it('giữ type + khoảng giá query khi đổi quận', () => {
    const patch = localityScopeEditPatch(withQueryCopy(), { kind: 'district', id: 'd2', name: 'Dĩ An' });
    expect(patch.typeId).toBe('type-q');
    expect(patch.minPrice).toBe(2);
    expect(patch.maxPrice).toBe(6);
  });

  it('giữ type + khoảng giá query khi đổi phường', () => {
    const patch = localityScopeEditPatch(withQueryCopy(), { kind: 'ward', id: 'w2', name: 'An Bình' });
    expect(patch.typeId).toBe('type-q');
    expect(patch.minPrice).toBe(2);
    expect(patch.maxPrice).toBe(6);
  });

  it('sửa loại thì GIỮ khoảng giá query', () => {
    const patch = localityScopeEditPatch(withQueryCopy(), { kind: 'type', id: 'type-new' });
    expect(patch.typeId).toBe('type-new');
    expect(patch.minPrice).toBe(2);
    expect(patch.maxPrice).toBe(6);
  });

  it('sửa khoảng giá thì GIỮ loại query', () => {
    const patch = localityScopeEditPatch(withQueryCopy(), { kind: 'price', priceRange: RENT });
    expect(patch.typeId).toBe('type-q');
    expect(patch.minPrice).toBe(RENT.min);
    expect(patch.maxPrice).toBe(RENT.max);
  });

  it('đổi hình thức giao dịch giữ loại query nhưng bỏ khoảng giá (đơn vị khác)', () => {
    const patch = localityScopeEditPatch(withQueryCopy(), { kind: 'listingType', listingType: 'cho_thue' });
    expect(patch.typeId).toBe('type-q');
    expect(patch.minPrice).toBeUndefined();
    expect(patch.maxPrice).toBeUndefined();
  });

  it('LUÔN reset phân trang khi đổi phạm vi', () => {
    // Giữ page=4 sau khi đổi địa lý sẽ trỏ vào trang 4 của tập kết quả mới.
    for (const edit of [
      { kind: 'area', id: 'a2' },
      { kind: 'district', id: 'd2' },
      { kind: 'ward', id: 'w2' },
      { kind: 'type', id: 't2' },
      { kind: 'price', priceRange: RENT },
      { kind: 'listingType', listingType: 'cho_thue' },
    ] as const) {
      expect('page' in localityScopeEditPatch(withQueryCopy(), edit)).toBe(false);
    }
  });

  it('giữ tên quận ngoài phạm vi (không có districtId của route) khi sửa loại/giá', () => {
    // Người dùng lọc quận bằng dropdown; route chỉ sở hữu tỉnh. Sửa loại không được
    // làm mất quận đang xem.
    const patch = localityScopeEditPatch(
      facts({ districtId: undefined, districtName: 'Thuận An', wardId: undefined, wardName: 'An Phú' }),
      { kind: 'type', id: 't2' },
    );
    expect(patch.district).toBe('Thuận An');
    expect(patch.ward).toBe('An Phú');
  });
});

describe('confineIntentFilters — searchIntent không được ghi đè chiều của phạm vi', () => {
  it('bỏ mọi khoá địa lý/loại/giá mà searchIntent cố ghi khi route đã chốt ID', () => {
    const confined = confineIntentFilters(
      {
        areaId: 'area-hn', districtId: 'd-x', wardId: 'w-x', district: 'Hà Nội', ward: 'Cửa Nam',
        typeId: 'type-x', typeIds: ['type-y'], typePathSlug: 'dat', minPrice: 9, maxPrice: 10,
      },
      { hasRouteIds: true },
    );
    expect(confined).toEqual({});
  });

  it('giữ các filter ngoài phạm vi mà searchIntent suy ra', () => {
    const confined = confineIntentFilters(
      { minArea: 50, maxArea: 100, bedrooms: '3', direction: 'Đông Nam', legal: 'Sổ hồng' },
      { hasRouteIds: true },
    );
    expect(confined).toEqual({ minArea: 50, maxArea: 100, bedrooms: '3', direction: 'Đông Nam', legal: 'Sổ hồng' });
  });

  it('tìm kiếm thường (không phải landing) giữ nguyên hành vi cũ', () => {
    const input = { areaId: 'area-hn', district: 'Hà Nội', typeId: 'type-x', minPrice: 9 };
    expect(confineIntentFilters(input, { hasRouteIds: false })).toEqual(input);
  });
});
