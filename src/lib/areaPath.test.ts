import { describe, it, expect } from 'vitest';
import { buildAreaListingPath, parseAreaListingPath, resolveAreaPath, listingTypeToSlug } from './areaPath';
import type { Area, District } from './supabase';

const area = (o: Partial<Area> = {}): Area => ({
  id: 'a-bd', name: 'Bình Dương', description: null, image_url: null,
  slug: 'binh-duong', order_index: 0, created_at: '2026-01-01T00:00:00Z', ...o,
});
const district = (o: Partial<District> = {}): District => ({
  id: 'd-dian', area_id: 'a-bd', name: 'Dĩ An', slug: 'di-an',
  order_index: 0, created_at: '2026-01-01T00:00:00Z', ...o,
});

describe('buildAreaListingPath', () => {
  it('dựng path listingType + area', () => {
    expect(buildAreaListingPath({ listingType: 'cho_thue', areaSlug: 'binh-duong' })).toBe('/cho-thue/binh-duong');
  });
  it('dựng path có district', () => {
    expect(buildAreaListingPath({ listingType: 'mua_ban', areaSlug: 'binh-duong', districtSlug: 'di-an' }))
      .toBe('/mua-ban/binh-duong/di-an');
  });
  it('bỏ tiền tố tỉnh trong district slug DB (binh-duong-di-an → di-an)', () => {
    expect(buildAreaListingPath({ listingType: 'cho_thue', areaSlug: 'binh-duong', districtSlug: 'binh-duong-di-an' }))
      .toBe('/cho-thue/binh-duong/di-an');
  });
});

describe('listingTypeToSlug', () => {
  it('map enum DB → slug URL', () => {
    expect(listingTypeToSlug('mua_ban')).toBe('mua-ban');
    expect(listingTypeToSlug('cho_thue')).toBe('cho-thue');
  });
});

describe('parseAreaListingPath', () => {
  it('parse area only', () => {
    expect(parseAreaListingPath('cho-thue', ['binh-duong']))
      .toEqual({ listingType: 'cho_thue', areaSlug: 'binh-duong', districtSlug: undefined });
  });
  it('parse area + district', () => {
    expect(parseAreaListingPath('mua-ban', ['binh-duong', 'di-an']))
      .toEqual({ listingType: 'mua_ban', areaSlug: 'binh-duong', districtSlug: 'di-an' });
  });
  it('listingType lạ → null', () => {
    expect(parseAreaListingPath('thue-mua', ['binh-duong'])).toBeNull();
  });
  it('thiếu area → null', () => {
    expect(parseAreaListingPath('cho-thue', [])).toBeNull();
    expect(parseAreaListingPath('cho-thue', undefined)).toBeNull();
  });
  it('thừa segment (>2) → null', () => {
    expect(parseAreaListingPath('cho-thue', ['binh-duong', 'di-an', 'them'])).toBeNull();
  });
  it('round-trip build↔parse', () => {
    const parts = { listingType: 'cho_thue' as const, areaSlug: 'binh-duong', districtSlug: 'di-an' };
    const path = buildAreaListingPath(parts);
    const segs = path.split('/').filter(Boolean); // [lt, area, district]
    expect(parseAreaListingPath(segs[0], segs.slice(1))).toEqual(parts);
  });
});

describe('resolveAreaPath', () => {
  const areas = [area(), area({ id: 'a-hcm', slug: 'tp-hcm', name: 'TP.HCM' })];
  const districts = [district(), district({ id: 'd-q1', area_id: 'a-hcm', slug: 'quan-1', name: 'Quận 1' })];

  it('resolve area only', () => {
    const r = resolveAreaPath('binh-duong', undefined, { areas, districts });
    expect(r?.areaId).toBe('a-bd');
    expect(r?.districtId).toBeNull();
  });
  it('resolve area + district thuộc area', () => {
    const r = resolveAreaPath('binh-duong', 'di-an', { areas, districts });
    expect(r?.areaId).toBe('a-bd');
    expect(r?.districtId).toBe('d-dian');
  });
  it('slug URL gọn (di-an) resolve district DB có tiền tố tỉnh (binh-duong-di-an)', () => {
    const prefixed = [district({ id: 'd-dian2', slug: 'binh-duong-di-an' })];
    const r = resolveAreaPath('binh-duong', 'di-an', { areas, districts: prefixed });
    expect(r?.districtId).toBe('d-dian2');
  });
  it('area không tồn tại → null', () => {
    expect(resolveAreaPath('da-nang', undefined, { areas, districts })).toBeNull();
  });
  it('district không thuộc area → null (chống ghép chéo tỉnh)', () => {
    expect(resolveAreaPath('binh-duong', 'quan-1', { areas, districts })).toBeNull();
  });
});
