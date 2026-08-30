import { describe, expect, it } from 'vitest';
import {
  applyAreaSelection,
  applyDistrictSelection,
  resolveUniqueDistrict,
} from './locationSelection';
import type { District } from './supabase';

const districts: District[] = [
  { id: 'di-an', area_id: 'binh-duong', name: 'Dĩ An', slug: 'binh-duong-di-an', order_index: 1, created_at: '2026-01-01' },
  { id: 'tan-uyen-bd', area_id: 'binh-duong', name: 'Tân Uyên', slug: 'binh-duong-tan-uyen', order_index: 2, created_at: '2026-01-01' },
  { id: 'tan-uyen-lc', area_id: 'lai-chau', name: 'Tân Uyên', slug: 'lai-chau-tan-uyen', order_index: 1, created_at: '2026-01-01' },
];

const current = {
  area_id: 'old-area', city: 'Cũ', district_id: 'old-district', district: 'Cũ',
  ward_id: 'old-ward', ward: 'Cũ', neighborhood_slug: 'cu', address: '123 Đường cũ',
  latitude: '10.1', longitude: '106.1', title: 'Tin test',
};

describe('location selection state', () => {
  it('resolves a legacy text district only inside the selected area', () => {
    expect(resolveUniqueDistrict(districts, 'binh-duong', '  dĩ   an ')).toMatchObject({ id: 'di-an', name: 'Dĩ An' });
    expect(resolveUniqueDistrict(districts, 'binh-duong', 'Tân Uyên')).toMatchObject({ id: 'tan-uyen-bd' });
    expect(resolveUniqueDistrict(districts, '', 'Dĩ An')).toBeNull();
  });

  it('clears every dependent location field when changing area', () => {
    expect(applyAreaSelection(current, 'binh-duong', 'Bình Dương')).toMatchObject({
      area_id: 'binh-duong', city: 'Bình Dương', district_id: '', district: '', ward_id: '', ward: '', neighborhood_slug: '',
      address: '', latitude: '', longitude: '',
    });
  });

  it('stores selected district ID and canonical label together', () => {
    expect(applyDistrictSelection(current, districts[0])).toMatchObject({
      district_id: 'di-an', district: 'Dĩ An', ward_id: '', ward: '', neighborhood_slug: '',
      address: '', latitude: '', longitude: '',
    });
  });

  it('keeps free text without inventing a district ID', () => {
    expect(applyDistrictSelection(current, null, 'Huyện chưa có taxonomy')).toMatchObject({
      district_id: '', district: 'Huyện chưa có taxonomy', ward_id: '', ward: '', neighborhood_slug: '',
      address: '', latitude: '', longitude: '',
    });
  });
});
