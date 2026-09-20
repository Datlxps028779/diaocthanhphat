import { describe, expect, it, vi } from 'vitest';

// supabase.ts dựng client ngay lúc import (đọc NEXT_PUBLIC_*) — phải có env giả
// TRƯỚC khi import module dưới test, nếu không cả suite vỡ vì thiếu key.
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'anon-key');

const { supabase } = await import('../supabase');
const {
  adminPropertyFilterOperations,
  getAllProperties,
  getAllPropertiesForMap,
  getAdvisorMatches,
  mapAdvisorMatchMetadata,
  normalizeAdminPropertyLimit,
  normalizeAdminPropertyPage,
  publicPropertyFilterOperations,
  sanitizeAdminPropertyKeyword,
} = await import('./properties');

// Query builder giả: ghi lại mọi toán tử đã áp lên PostgREST để khẳng định nhánh
// truy vấn thật (không cần network/DB). Await-safe: `await` trên chính nó trả kết quả rỗng.
function buildFakeQuery(calls: string[]) {
  const record = (name: string, args: unknown[]) => {
    const rendered = args
      .map(value => Array.isArray(value) ? value.join(',') : String(value))
      .join('=');
    calls.push(`${name}(${rendered})`);
  };
  const query: Record<string, unknown> = {
    then: (resolve: (value: { data: never[]; count: number; error: null }) => unknown) =>
      Promise.resolve({ data: [], count: 0, error: null }).then(resolve),
    select: (...args: unknown[]) => { record('select', args); return query; },
    range: () => query,
    limit: () => query,
    order: () => query,
    not: () => query,
  };
  for (const method of ['eq', 'in', 'or', 'gte', 'lte', 'neq']) {
    query[method] = (...args: unknown[]) => { record(method, args); return query; };
  }
  return query;
}

describe('Admin property catalogue filter guards', () => {
  it('removes PostgREST structural characters from a keyword', () => {
    expect(sanitizeAdminPropertyKeyword('  nha, (pho)\\%  quan 1  ')).toBe('nha pho quan 1');
  });

  it('limits keyword length after normalizing whitespace', () => {
    expect(sanitizeAdminPropertyKeyword(`  ${'a'.repeat(130)}  `)).toHaveLength(120);
  });

  it.each([
    [undefined, 1],
    [0, 1],
    [-2, 1],
    [1.5, 1],
    [3, 3],
  ])('normalizes page %s to %s', (value, expected) => {
    expect(normalizeAdminPropertyPage(value)).toBe(expected);
  });
  it.each([
    [undefined, 25],
    [20, 25],
    [25, 25],
    [50, 50],
    [100, 100],
  ])('allows only approved page limits: %s', (value, expected) => {
    expect(normalizeAdminPropertyLimit(value)).toBe(expected);
  });

  it('filters verified records by the active P7 projection, not the legacy boolean', () => {
    expect(adminPropertyFilterOperations(
      { isVerified: true },
      '2026-08-17T00:00:00.000Z',
    )).toEqual([
      { method: 'eq', column: 'verification_status', value: 'verified' },
      { method: 'gt', column: 'verified_until', value: '2026-08-17T00:00:00.000Z' },
    ]);
  });
});

describe('Public property filter contract', () => {
  it('uses monthly rental price and carries every public filter to list/map queries', () => {
    const operations = publicPropertyFilterOperations({
      listingType: 'cho_thue', areaId: 'area-1', typeId: 'type-1', city: 'Bình Dương',
      district: 'Dĩ An', ward: 'Tân Đông Hiệp', keyword: 'nhà, phố',
      minPrice: 5, maxPrice: 10, minArea: 50, maxArea: 100, bedrooms: '2',
      direction: 'Đông', legal: 'Sổ riêng', isFeatured: true, isHot: true,
    });

    expect(operations).toEqual(expect.arrayContaining([
      { method: 'eq', column: 'listing_type', value: 'cho_thue' },
      { method: 'eq', column: 'area_id', value: 'area-1' },
      { method: 'eq', column: 'property_type_id', value: 'type-1' },
      { method: 'eq', column: 'city', value: 'Bình Dương' },
      { method: 'eq', column: 'district', value: 'Dĩ An' },
      { method: 'eq', column: 'ward', value: 'Tân Đông Hiệp' },
      { method: 'gte', column: 'price_per_month', value: 5 },
      { method: 'lte', column: 'price_per_month', value: 10 },
      { method: 'gte', column: 'area_sqm', value: 50 },
      { method: 'lte', column: 'area_sqm', value: 100 },
      { method: 'gte', column: 'bedrooms', value: 2 },
      { method: 'eq', column: 'direction', value: 'Đông' },
      { method: 'eq', column: 'legal_status', value: 'Sổ riêng' },
      { method: 'eq', column: 'is_featured', value: true },
      { method: 'eq', column: 'is_hot', value: true },
    ]));
    expect(operations.find(item => item.method === 'or')?.value).toBe(
      'title.ilike.%nhà phố%,address.ilike.%nhà phố%,city.ilike.%nhà phố%,district.ilike.%nhà phố%',
    );
  });

  it('carries grouped property type IDs as an IN operation', () => {
    expect(publicPropertyFilterOperations({ typeIds: ['type-house', 'type-land'] })).toContainEqual({
      method: 'in', column: 'property_type_id', value: ['type-house', 'type-land'],
    });
  });

  it('uses sale price unless the route is explicitly rental', () => {
    expect(publicPropertyFilterOperations({ minPrice: 1 })[0]).toEqual({
      method: 'gte', column: 'price', value: 1,
    });
  });

  it('sanitizes PostgREST structure from public keyword filters', () => {
    const operation = publicPropertyFilterOperations({ keyword: ' nhà, (phố)\\% ' })
      .find(item => item.method === 'or');
    expect(operation?.value).toBe(
      'title.ilike.%nhà phố%,address.ilike.%nhà phố%,city.ilike.%nhà phố%,district.ilike.%nhà phố%',
    );
  });

  it('carries route-authoritative locality IDs as eq on district_id/ward_id', () => {
    expect(publicPropertyFilterOperations({ districtId: 'district-1', wardId: 'ward-1' })).toEqual([
      { method: 'eq', column: 'district_id', value: 'district-1' },
      { method: 'eq', column: 'ward_id', value: 'ward-1' },
    ]);
  });

  it('does not combine authoritative IDs with stale locality names', () => {
    expect(publicPropertyFilterOperations({ districtId: 'd', wardId: 'w', district: 'Tên cũ', ward: 'Tên cũ' })).toEqual([
      { method: 'eq', column: 'district_id', value: 'd' },
      { method: 'eq', column: 'ward_id', value: 'w' },
    ]);
  });

  it('does not emit district_id/ward_id for ordinary searches that only pass names', () => {
    const operations = publicPropertyFilterOperations({ district: 'Dĩ An', ward: 'Tân Đông Hiệp' });
    expect(operations).toEqual([
      { method: 'eq', column: 'district', value: 'Dĩ An' },
      { method: 'eq', column: 'ward', value: 'Tân Đông Hiệp' },
    ]);
  });

  // Cột `properties.price` lưu nhiều đơn vị (cùng 1.5 tỷ có thể là price=1.5
  // price_unit='tỷ' hoặc price=1500 price_unit='triệu'), nên bộ lọc phải là OR của hai
  // nhánh đơn vị. So `price` thô với VND sẽ bỏ sót gần hết tin.
  it.each([
    ['duoi-1-ty', 'and(listing_type.eq.mua_ban,price.gt.0,and(or(and(price_unit.eq.tỷ,price.gt.0,price.lt.1),and(price_unit.eq.triệu,price.gt.0,price.lt.1000))))'],
    ['tu-1-den-duoi-2-ty', 'and(listing_type.eq.mua_ban,price.gt.0,and(or(and(price_unit.eq.tỷ,price.gte.1,price.lt.2),and(price_unit.eq.triệu,price.gte.1000,price.lt.2000))))'],
    ['tu-2-den-duoi-5-ty', 'and(listing_type.eq.mua_ban,price.gt.0,and(or(and(price_unit.eq.tỷ,price.gte.2,price.lt.5),and(price_unit.eq.triệu,price.gte.2000,price.lt.5000))))'],
    ['tu-5-ty', 'and(listing_type.eq.mua_ban,price.gt.0,and(or(and(price_unit.eq.tỷ,price.gte.5),and(price_unit.eq.triệu,price.gte.5000))))'],
  ] as const)('normalizes sale band %s across both price units with an exclusive upper bound', (salePriceBand, expected) => {
    expect(publicPropertyFilterOperations({ salePriceBand })).toEqual([
      { method: 'or', value: expected },
    ]);
  });

  it('pins listing_type=muа_ban so a rental cannot match a sale band', () => {
    // price của tin cho thuê là triệu/THÁNG — cùng cột nhưng khác đại lượng. Chốt
    // listing_type ngay trong biểu thức để phạm vi giá bán không kéo tin thuê vào.
    const band = publicPropertyFilterOperations({ listingType: 'cho_thue', salePriceBand: 'tu-5-ty' })
      .find(item => item.method === 'or');
    expect(band?.value).toContain('listing_type.eq.mua_ban');
    expect(band?.value).not.toContain('price_per_month');
  });

  it('treats a present-but-empty typeIds group as match-nothing, not as no filter', () => {
    // Nhóm loại rỗng (route có segment /loai/ nhưng nhóm không có thành viên) phải trả
    // 0 dòng. Bỏ điều kiện sẽ biến nó thành cả tỉnh.
    expect(publicPropertyFilterOperations({ typeIds: [] })).toEqual([
      { method: 'in', column: 'property_type_id', value: [] },
    ]);
  });

  it('omits the typeIds clause entirely when the group is absent', () => {
    expect(publicPropertyFilterOperations({ areaId: 'area-1' })).toEqual([
      { method: 'eq', column: 'area_id', value: 'area-1' },
    ]);
  });

  it('throws for a provided unknown band instead of silently widening to every price', () => {
    // Bỏ điều kiện = trả về toàn bộ danh sách cho một URL khai khoảng giá cụ thể.
    expect(() => publicPropertyFilterOperations({ salePriceBand: 'duoi-2-ty' as never }))
      .toThrow(/khoảng giá/i);
  });

  it('omitting the band is still valid and adds no price condition', () => {
    expect(publicPropertyFilterOperations({ areaId: 'area-1' })).toEqual([
      { method: 'eq', column: 'area_id', value: 'area-1' },
    ]);
  });
});

describe('Locality scope query routing', () => {
  it('passes a sale band through the ranked RPC without widening the locality scope', async () => {
    const calls: string[] = [];
    vi.spyOn(supabase, 'from').mockReturnValue(buildFakeQuery(calls) as never);
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: [], error: null } as never);
    try {
      await getAllProperties({ salePriceBand: 'tu-1-den-duoi-2-ty', keyword: 'nhà', sort: 'relevance' });
      expect(rpc).toHaveBeenCalledWith('search_property_matches', expect.objectContaining({
        f_sale_min_vnd: 1_000_000_000,
        f_sale_max_vnd: 2_000_000_000,
      }));
      expect(calls.join(' | ')).not.toContain('price_unit.eq.tỷ');
    } finally {
      vi.restoreAllMocks();
    }
  });

  it('keeps the map query under the same IDs and band constraints', async () => {
    const calls: string[] = [];
    vi.spyOn(supabase, 'from').mockReturnValue(buildFakeQuery(calls) as never);
    try {
      await getAllPropertiesForMap({ areaId: 'area-1', districtId: 'district-1', wardId: 'ward-1', salePriceBand: 'duoi-1-ty' });
      const log = calls.join(' | ');
      expect(log).toContain('area_id=area-1');
      expect(log).toContain('district_id=district-1');
      expect(log).toContain('ward_id=ward-1');
      // Cùng biểu thức chuẩn hóa đơn vị như truy vấn danh sách, không phải VND thô.
      expect(log).toContain('price_unit.eq.triệu');
      expect(log).toContain('price.lt.1000');
      expect(log).toContain('is_active');
    } finally {
      vi.restoreAllMocks();
    }
  });
});

describe('Advisor ranking response contract', () => {
  it('keeps an empty advisor type group scoped to match nothing', async () => {
    const rpc = vi.spyOn(supabase, 'rpc').mockResolvedValue({ data: [], error: null } as never);
    try {
      await getAdvisorMatches({ typeIds: [], keyword: 'nhà', sort: 'relevance' });
      expect(rpc).toHaveBeenCalledWith('search_property_matches', expect.objectContaining({ f_type_ids: [] }));
    } finally {
      vi.restoreAllMocks();
    }
  });


  it('maps explainable reason codes and keeps intent score separate from keyword supplement', () => {
    expect(mapAdvisorMatchMetadata({
      id: 'property-1',
      score: 79,
      intent_score: 75,
      match_reasons: ['legal', 'location', 'keyword', 'budget'],
      total_count: 1,
    })).toEqual({
      matchScore: 79,
      matchIntentScore: 75,
      matchReasons: ['location', 'budget', 'legal', 'keyword'],
    });
  });

  it('fails closed on malformed reasons while remaining compatible before migration', () => {
    expect(mapAdvisorMatchMetadata({
      id: 'property-1', score: 30, total_count: 1,
    })).toEqual({
      matchScore: 30,
      matchIntentScore: 30,
      matchReasons: [],
    });
  });
});
