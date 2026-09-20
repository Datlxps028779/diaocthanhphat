import { describe, expect, it } from 'vitest';
import {
  LOCALITY_PRICE_BANDS,
  TY,
  isLocalityPriceBand,
  localityPriceBandParams,
  localityPriceBandRange,
  localityScopeDimensionsChanged,
  requireSalePriceBandFilter,
  salePriceBandPostgrestFilter,
} from './localityListingScope';

describe('locality price bands', () => {
  it('exposes exactly the four approved sale bands in URL order', () => {
    expect(LOCALITY_PRICE_BANDS.map(range => range.band)).toEqual([
      'duoi-1-ty',
      'tu-1-den-duoi-2-ty',
      'tu-2-den-duoi-5-ty',
      'tu-5-ty',
    ]);
  });

  it('keeps a non-overlapping exclusive upper boundary between adjacent bands', () => {
    const [b0, b1, b2, b3] = LOCALITY_PRICE_BANDS;
    expect(b0.min).toBe(0);
    expect(b0.max).toBe(TY);
    expect(b1.min).toBe(b0.max);
    expect(b1.max).toBe(2 * TY);
    expect(b2.min).toBe(b1.max);
    expect(b2.max).toBe(5 * TY);
    expect(b3.min).toBe(b2.max);
    expect(b3.max).toBeUndefined();
  });

  it('places a boundary price in exactly one band', () => {
    // Giá đúng bằng cận trên thuộc khoảng SAU (cận trên độc quyền), không thuộc
    // khoảng trước — đây là điều kiện chống đếm trùng khi cộng tổng các khoảng.
    // Mô phỏng lại đúng phép so của PostgREST: gte min AND lt max.
    const inBand = (range: { min: number; max?: number }, price: number) =>
      price >= range.min && (range.max === undefined || price < range.max);
    const [b0, b1, b2, b3] = LOCALITY_PRICE_BANDS;
    expect(b0.max).toBe(TY);
    expect(b1.min).toBe(TY);
    expect(inBand(b0, TY)).toBe(false);
    expect(inBand(b1, TY)).toBe(true);
    expect(inBand(b1, 2 * TY)).toBe(false);
    expect(inBand(b2, 2 * TY)).toBe(true);
    expect(inBand(b2, 5 * TY)).toBe(false);
    expect(inBand(b3, 5 * TY)).toBe(true);
    expect(inBand(b3, 100 * TY)).toBe(true);
  });

  it.each(['duoi-1-ty', 'tu-1-den-duoi-2-ty', 'tu-2-den-duoi-5-ty', 'tu-5-ty'] as const)(
    'accepts known band %s',
    band => {
      expect(isLocalityPriceBand(band)).toBe(true);
      expect(localityPriceBandRange(band)?.band).toBe(band);
    },
  );

  it.each([undefined, '', 'duoi-2-ty', 'tu-1-ty', 'DUOI-1-TY', 'duoi-1-ty ', 'all'])(
    'rejects unknown band %o — including on the last band, which must not fall back to every price',
    band => {
      expect(isLocalityPriceBand(band)).toBe(false);
      expect(localityPriceBandRange(band)).toBeNull();
      expect(localityPriceBandParams(band as never)).toBeNull();
    },
  );

  it('maps a band to the single salePriceBand filter field', () => {
    expect(localityPriceBandParams('tu-2-den-duoi-5-ty')).toEqual({ salePriceBand: 'tu-2-den-duoi-5-ty' });
  });
});

// Cột `properties.price` KHÔNG lưu một đơn vị duy nhất: tin bán có thể ghi 1.5 với
// price_unit='tỷ' hoặc 1500 với price_unit='triệu' cho CÙNG một mức giá. Vì vậy không
// được so `price` thô với VND. Bộ lọc phải là OR của hai nhánh đơn vị, mỗi nhánh so
// trong đơn vị của chính nó, và phải chốt listing_type=muа_ban + price>0 để không lọt
// tin cho thuê (price là triệu/tháng) hay tin giá 0.
describe('salePriceBandPostgrestFilter', () => {
  // PostgREST trả `.or()` dạng chuỗi; cận trên ĐỘC QUYỀN nên dùng `lt`, không `lte`.
  it('normalizes price_unit for the 1–2 tỷ band instead of comparing raw VND', () => {
    expect(salePriceBandPostgrestFilter('tu-1-den-duoi-2-ty')).toBe(
      'and(listing_type.eq.mua_ban,price.gt.0,and(or(and(price_unit.eq.tỷ,price.gte.1,price.lt.2),and(price_unit.eq.triệu,price.gte.1000,price.lt.2000))))',
    );
  });

  it('expresses the sub-1-tỷ band with a zero lower bound in each unit', () => {
    expect(salePriceBandPostgrestFilter('duoi-1-ty')).toBe(
      'and(listing_type.eq.mua_ban,price.gt.0,and(or(and(price_unit.eq.tỷ,price.gt.0,price.lt.1),and(price_unit.eq.triệu,price.gt.0,price.lt.1000))))',
    );
  });

  it('expresses the 2–5 tỷ band in both units', () => {
    expect(salePriceBandPostgrestFilter('tu-2-den-duoi-5-ty')).toBe(
      'and(listing_type.eq.mua_ban,price.gt.0,and(or(and(price_unit.eq.tỷ,price.gte.2,price.lt.5),and(price_unit.eq.triệu,price.gte.2000,price.lt.5000))))',
    );
  });

  it('leaves the open-ended top band without an upper bound in both units', () => {
    expect(salePriceBandPostgrestFilter('tu-5-ty')).toBe(
      'and(listing_type.eq.mua_ban,price.gt.0,and(or(and(price_unit.eq.tỷ,price.gte.5),and(price_unit.eq.triệu,price.gte.5000))))',
    );
  });

  it('never emits a raw VND lower bound — every bound is expressed in tỷ or triệu', () => {
    for (const range of LOCALITY_PRICE_BANDS) {
      const expr = salePriceBandPostgrestFilter(range.band)!;
      expect(expr).not.toContain(String(TY));
      expect(expr).toContain('price_unit.eq.tỷ');
      expect(expr).toContain('price_unit.eq.triệu');
    }
  });

  it('enforces listing_type=muа_ban and price>0 so rentals and zero-priced rows cannot slip in', () => {
    const expr = salePriceBandPostgrestFilter('tu-5-ty')!;
    expect(expr).toContain('listing_type.eq.mua_ban');
    expect(expr).toContain('price.gt.0');
  });

  it.each([undefined, '', 'duoi-2-ty', 'tu-1-ty', 'all', 'DUOI-1-TY'])(
    'rejects unknown band %o — including the last band, which must not widen to every sale price',
    band => {
      expect(salePriceBandPostgrestFilter(band as never)).toBeNull();
    },
  );

  // Mã khoảng đến từ URL do route đọc; nếu route đã xác nhận "có khai band" thì một mã
  // không dịch được là dữ liệu sai, không phải "không lọc giá". Thà 500/404 còn hơn
  // trả về toàn bộ danh sách mà không nói gì.
  it('requires a filter for a PROVIDED band and refuses to silently widen the scope', () => {
    expect(() => requireSalePriceBandFilter('duoi-2-ty')).toThrow(/khoảng giá/i);
    expect(() => requireSalePriceBandFilter('all')).toThrow(/khoảng giá/i);
    expect(requireSalePriceBandFilter('tu-1-den-duoi-2-ty')).toContain('price_unit.eq.tỷ');
  });

  it('treats a declared-but-empty band as absent, not as an error', () => {
    expect(requireSalePriceBandFilter(undefined)).toBeNull();
    expect(requireSalePriceBandFilter('')).toBeNull();
  });

  // Ranh giới giữa hai khoảng kề nhau: giá đúng mức chặn phải thuộc ĐÚNG một khoảng.
  // Mô phỏng lại phép so PostgREST trong từng nhánh đơn vị.
  it('keeps adjacent bands non-overlapping at the boundary in both units', () => {
    const inBranch = (unit: string, value: number, lo: number, hi?: number) =>
      unit === (unit === 'tỷ' ? 'tỷ' : unit) && value >= lo && (hi === undefined || value < hi);
    // 2 tỷ viết theo hai đơn vị: 2 (tỷ) và 2000 (triệu).
    expect(inBranch('tỷ', 2, 1, 2)).toBe(false);
    expect(inBranch('tỷ', 2, 2, 5)).toBe(true);
    expect(inBranch('triệu', 2000, 1000, 2000)).toBe(false);
    expect(inBranch('triệu', 2000, 2000, 5000)).toBe(true);
    // 1 tỷ: 1 (tỷ) / 1000 (triệu) thuộc khoảng 1–2, không thuộc "dưới 1 tỷ".
    expect(inBranch('tỷ', 1, 0, 1)).toBe(false);
    expect(inBranch('triệu', 1000, 0, 1000)).toBe(false);
  });
});

describe('localityScopeDimensionsChanged', () => {
  const initial = {
    listingType: 'mua_ban',
    areaId: 'area-1',
    district: 'Thuận An',
    ward: 'An Phú',
    typeId: '',
    priceIdx: 0,
  };

  it('stays false when no route-authoritative dimension changed', () => {
    expect(localityScopeDimensionsChanged(initial, {
      listingType: 'mua_ban',
      areaId: 'area-1',
      district: 'Thuận An',
      ward: 'An Phú',
      typeId: '',
      hasPriceFilter: false,
    })).toBe(false);
  });

  it.each([
    { listingType: 'cho_thue' },
    { areaId: 'area-2' },
    { district: 'Dĩ An' },
    { ward: '' },
    { typeId: 'type-1' },
    { hasPriceFilter: true },
  ])('detects a scope-breaking edit: %o', patch => {
    expect(localityScopeDimensionsChanged(initial, {
      listingType: 'mua_ban',
      areaId: 'area-1',
      district: 'Thuận An',
      ward: 'An Phú',
      typeId: '',
      hasPriceFilter: false,
      ...patch,
    })).toBe(true);
  });

  it('treats clearing a band-scoped landing as a scope change', () => {
    expect(localityScopeDimensionsChanged(
      { listingType: 'mua_ban', areaId: 'area-1', priceIdx: 3 },
      { listingType: 'mua_ban', areaId: 'area-1', hasPriceFilter: false },
    )).toBe(true);
  });

  it('ignores non-scope filters (keyword, area size, sort)', () => {
    expect(localityScopeDimensionsChanged(
      { listingType: 'mua_ban', areaId: 'area-1' },
      { listingType: 'mua_ban', areaId: 'area-1', district: '', ward: '', typeId: '', hasPriceFilter: false },
    )).toBe(false);
  });
});
