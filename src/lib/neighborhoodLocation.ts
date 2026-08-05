// Vị trí hành chính của khu dân cư: Tỉnh → Quận/Huyện → Phường/Xã.
//
// Bảng neighborhoods trước đây chỉ có ward_id, nên tỉnh chưa có dữ liệu cấp xã thì
// không gắn được khu dân cư. Nay có area_id + district_id, cả hai cấp dưới đều tùy
// chọn. Module này đọc được cả dữ liệu cũ (chỉ ward_id) lẫn mới, dùng chung cho admin
// và trang công khai. Thuần, test được.

export interface LocationTaxonomy {
  areas: { id: string; name: string; slug: string }[];
  districts: { id: string; area_id: string; name: string; slug: string }[];
  wards: { id: string; district_id: string; name: string; slug: string }[];
}

export interface NeighborhoodLocationSource {
  area_id?: string | null;
  district_id?: string | null;
  ward_id?: string | null;
}

export interface ResolvedLocation {
  area: { id: string; name: string; slug: string } | null;
  district: { id: string; area_id: string; name: string; slug: string } | null;
  ward: { id: string; district_id: string; name: string; slug: string } | null;
}

// Cột đã lưu là nguồn chân lý; ward_id chỉ dùng để suy ngược khi cấp trên còn trống.
// Có hai phường trùng tên ở hai tỉnh khác nhau (An Phú ở Thuận An và ở Thủ Đức) nên
// suy từ ward_id có thể ra tỉnh sai nếu khu bị gán nhầm xã.
export function resolveNeighborhoodLocation(
  source: NeighborhoodLocationSource,
  taxonomy: LocationTaxonomy,
): ResolvedLocation {
  const ward = source.ward_id ? taxonomy.wards.find(w => w.id === source.ward_id) ?? null : null;
  const districtId = source.district_id || ward?.district_id;
  const district = districtId ? taxonomy.districts.find(d => d.id === districtId) ?? null : null;
  const areaId = source.area_id || district?.area_id;
  const area = areaId ? taxonomy.areas.find(a => a.id === areaId) ?? null : null;
  return { area, district, ward };
}

// Nhãn từ nhỏ đến lớn như cách người Việt đọc địa chỉ. Cấp thiếu thì bỏ hẳn, không
// để lại dấu phẩy trống.
export function formatLocationLabel(loc: ResolvedLocation): string {
  return [loc.ward?.name, loc.district?.name, loc.area?.name].filter(Boolean).join(', ');
}

export function normalizeText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');
}

export interface NeighborhoodFilter {
  areaId?: string;
  districtId?: string;
  keyword?: string;
}

// Từ khoá khớp cả tên khu và nhãn vị trí, nên gõ "thuận an" tìm được khu thuộc huyện đó.
export function filterNeighborhoods<T extends NeighborhoodLocationSource & { name: string }>(
  items: T[],
  filter: NeighborhoodFilter,
  taxonomy: LocationTaxonomy,
): T[] {
  const needle = filter.keyword?.trim() ? normalizeText(filter.keyword.trim()) : '';
  return items.filter(item => {
    const loc = resolveNeighborhoodLocation(item, taxonomy);
    if (filter.areaId && loc.area?.id !== filter.areaId) return false;
    if (filter.districtId && loc.district?.id !== filter.districtId) return false;
    if (needle && !normalizeText(`${item.name} ${formatLocationLabel(loc)}`).includes(needle)) return false;
    return true;
  });
}
