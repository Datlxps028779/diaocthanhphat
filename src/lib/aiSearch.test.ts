import { describe, it, expect } from 'vitest';
import type { Area, District, PropertyType, Ward } from './supabase';
import { normalizeVietnamese, parseSearchIntent } from './aiSearch';

const areas: Area[] = [
  { id: 'area-bd', name: 'Bình Dương', slug: 'binh-duong', description: null, image_url: null, order_index: 1, created_at: '2026-01-01' },
];
const districts: District[] = [
  { id: 'd-di-an', area_id: 'area-bd', name: 'Dĩ An', slug: 'di-an', order_index: 1, created_at: '2026-01-01' },
  { id: 'd-tdm', area_id: 'area-bd', name: 'Thủ Dầu Một', slug: 'thu-dau-mot', order_index: 2, created_at: '2026-01-01' },
  { id: 'd-ben-cat', area_id: 'area-bd', name: 'Bến Cát', slug: 'ben-cat', order_index: 3, created_at: '2026-01-01' },
];
const wards: Ward[] = [
  { id: 'w-1', district_id: 'd-di-an', name: 'Phường Dĩ An', slug: 'phuong-di-an', order_index: 1, created_at: '2026-01-01' },
];
const propertyTypes: PropertyType[] = [
  { id: 'type-dat', name: 'Đất nền', slug: 'dat-nen', icon: null, created_at: '2026-01-01' },
  { id: 'type-can-ho', name: 'Căn hộ', slug: 'can-ho', icon: null, created_at: '2026-01-01' },
  { id: 'type-nha-pho', name: 'Nhà phố', slug: 'nha-pho', icon: null, created_at: '2026-01-01' },
  { id: 'type-biet-thu', name: 'Biệt thự', slug: 'biet-thu', icon: null, created_at: '2026-01-01' },
];
const taxonomy = { areas, districts, wards, propertyTypes };

describe('normalizeVietnamese', () => {
  it('bỏ dấu, lowercase, chuẩn hóa đơn vị phổ biến', () => {
    expect(normalizeVietnamese('Dĩ An Sổ Hồng 100m² 3PN dưới 5 TỶ')).toBe('di an so hong 100 m2 3 pn duoi 5 ty');
  });
});

describe('parseSearchIntent', () => {
  it('không bịa location/type không có trong taxonomy', () => {
    const r = parseSearchIntent('nhà Atlantis dưới 3 tỷ', taxonomy);
    expect(r.filters.district).toBeUndefined();
    expect(r.filters.typeId).toBeUndefined();
    expect(r.residualKeyword).toContain('Atlantis');
  });

  it('nhà Dĩ An dưới 3 tỷ sổ hồng → district + maxPrice + legal, residual giữ nhà', () => {
    const r = parseSearchIntent('nhà Dĩ An dưới 3 tỷ sổ hồng', taxonomy);
    expect(r.filters.district).toBe('Dĩ An');
    expect(r.filters.maxPrice).toBe(3);
    expect(r.filters.legal).toBe('Sổ hồng');
    expect(r.residualKeyword).toBe('nhà');
    expect(r.matched.map(m => m.kind)).toEqual(expect.arrayContaining(['district', 'price', 'legal']));
  });

  it('cho thuê căn hộ Thủ Dầu Một 5-10 triệu → rent + type + district + range', () => {
    const r = parseSearchIntent('cho thuê căn hộ Thủ Dầu Một 5-10 triệu', taxonomy);
    expect(r.filters.listingType).toBe('cho_thue');
    expect(r.filters.typeId).toBe('type-can-ho');
    expect(r.filters.district).toBe('Thủ Dầu Một');
    expect(r.filters.minPrice).toBe(5);
    expect(r.filters.maxPrice).toBe(10);
    expect(r.residualKeyword).toBe('');
  });

  it('mua bán dưới 900 triệu → quy về 0.9 tỷ (đơn vị DB mua bán)', () => {
    const r = parseSearchIntent('nhà Dĩ An dưới 900 triệu sổ hồng', taxonomy);
    expect(r.filters.maxPrice).toBe(0.9);
    expect(r.filters.district).toBe('Dĩ An');
    expect(r.filters.legal).toBe('Sổ hồng');
  });

  it('ngân sách "tôi có 500 triệu" → maxPrice (0.5 tỷ), không bỏ qua giá', () => {
    const r = parseSearchIntent('tôi có 500 triệu muốn mua nhà ở Dĩ An', taxonomy);
    expect(r.filters.maxPrice).toBe(0.5);
    expect(r.filters.district).toBe('Dĩ An');
  });

  it('bare "nhà 2 tỷ Dĩ An" (không từ khoá) → coi là giá trần', () => {
    const r = parseSearchIntent('nhà 2 tỷ Dĩ An', taxonomy);
    expect(r.filters.maxPrice).toBe(2);
  });

  it('đất nền Bến Cát trên 100m2 gần VSIP → type + district + minArea, residual giữ VSIP', () => {
    const r = parseSearchIntent('đất nền Bến Cát trên 100m2 gần VSIP', taxonomy);
    expect(r.filters.typeId).toBe('type-dat');
    expect(r.filters.district).toBe('Bến Cát');
    expect(r.filters.minArea).toBe(100);
    expect(r.residualKeyword).toBe('gần VSIP');
  });

  it('3pn và 3 phòng ngủ → bedrooms 3', () => {
    expect(parseSearchIntent('nhà 3pn', taxonomy).filters.bedrooms).toBe('3');
    expect(parseSearchIntent('nhà 3 phòng ngủ', taxonomy).filters.bedrooms).toBe('3');
  });

  it('explicit filters override inferred filters', () => {
    const r = parseSearchIntent('cho thuê căn hộ Dĩ An dưới 3 tỷ', taxonomy, {
      listingType: 'mua_ban',
      district: 'Thủ Dầu Một',
      maxPrice: 5,
    });
    expect(r.filters.listingType).toBeUndefined();
    expect(r.filters.district).toBeUndefined();
    expect(r.filters.maxPrice).toBeUndefined();
    expect(r.filters.typeId).toBe('type-can-ho');
  });

  it('alias tdm chỉ match khi Thủ Dầu Một tồn tại', () => {
    const r = parseSearchIntent('nhà tdm sổ đỏ', taxonomy);
    expect(r.filters.district).toBe('Thủ Dầu Một');
    expect(r.filters.legal).toBe('Sổ hồng');
  });

  it('không suy luận ward trùng tên district nếu user không gõ rõ phường/xã', () => {
    const r = parseSearchIntent('nhà Dĩ An dưới 3 tỷ', taxonomy);
    expect(r.filters.district).toBe('Dĩ An');
    expect(r.filters.ward).toBeUndefined();
  });
});
