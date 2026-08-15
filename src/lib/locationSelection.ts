import type { District } from './supabase';

// Listing vẫn giữ text location để tương thích search/URL, nhưng lựa chọn taxonomy
// phải lưu thêm ID. Các hàm thuần này đảm bảo hai form Admin/User cùng reset và
// gán dữ liệu như nhau, đồng thời không đoán khi tên quận/huyện trùng nhau.
export interface DistrictLocationFields {
  area_id: string;
  city: string;
  district_id: string;
  district: string;
  ward: string;
  neighborhood_slug: string;
}

export function normalizeLocationName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('vi-VN')
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

export function resolveUniqueDistrict(
  districts: District[],
  areaId: string,
  districtName: string,
): District | null {
  const normalized = normalizeLocationName(districtName);
  if (!areaId || !normalized) return null;
  const matches = districts.filter(d =>
    d.area_id === areaId && normalizeLocationName(d.name) === normalized,
  );
  return matches.length === 1 ? matches[0] : null;
}

export function applyAreaSelection<T extends DistrictLocationFields>(
  current: T,
  areaId: string,
  city: string,
): T {
  return {
    ...current,
    area_id: areaId,
    city,
    district_id: '',
    district: '',
    ward: '',
    neighborhood_slug: '',
  };
}

export function applyDistrictSelection<T extends DistrictLocationFields>(
  current: T,
  district: Pick<District, 'id' | 'name'> | null,
  districtText = '',
): T {
  return {
    ...current,
    district_id: district?.id ?? '',
    district: district?.name ?? districtText,
    ward: '',
    neighborhood_slug: '',
  };
}
