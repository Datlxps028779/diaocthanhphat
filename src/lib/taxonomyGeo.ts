export type TaxonomyGeoLevel = 'area' | 'district' | 'ward';

export type TaxonomyBounds = {
  south: number;
  west: number;
  north: number;
  east: number;
};

export type TaxonomyGeo = {
  entity_type: TaxonomyGeoLevel;
  entity_id: string;
  bounds: TaxonomyBounds;
  center_lat: number | null;
  center_lng: number | null;
  geojson: Record<string, unknown> | null;
  source: string;
  source_year: number | null;
  administrative_vintage: string;
};

export type TaxonomySelection = {
  areaId?: string;
  districtId?: string;
  wardId?: string;
};

export function isValidTaxonomyBounds(bounds: TaxonomyBounds | null | undefined): bounds is TaxonomyBounds {
  if (!bounds) return false;
  return [bounds.south, bounds.west, bounds.north, bounds.east].every(Number.isFinite)
    && bounds.south < bounds.north
    && bounds.west < bounds.east
    && bounds.south >= -90 && bounds.north <= 90
    && bounds.west >= -180 && bounds.east <= 180;
}

export function pickTaxonomyGeo(geo: TaxonomyGeo[], selection: TaxonomySelection): TaxonomyGeo | null {
  const candidates: Array<[TaxonomyGeoLevel, string | undefined]> = [
    ['ward', selection.wardId],
    ['district', selection.districtId],
    ['area', selection.areaId],
  ];
  for (const [level, id] of candidates) {
    if (!id) continue;
    const match = geo.find(item => item.entity_type === level && item.entity_id === id && isValidTaxonomyBounds(item.bounds));
    if (match) return match;
  }
  return null;
}

export function taxonomyGeoLabel(geo: TaxonomyGeo | null): string {
  if (!geo) return 'Chưa có ranh giới bản đồ chuẩn cho khu vực này.';
  return geo.entity_type === 'ward'
    ? 'Bản đồ đang hiển thị đúng khu vực xã/phường đã chọn.'
    : geo.entity_type === 'district'
      ? 'Chưa có geometry cấp xã; đang hiển thị đúng địa giới huyện/quận.'
      : 'Chưa có geometry cấp huyện/xã; đang hiển thị đúng địa giới tỉnh/thành.';
}
