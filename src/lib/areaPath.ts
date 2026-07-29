// Ánh xạ URL path khu vực ↔ dữ liệu thật cho SEO. Thay query UUID
// (/cho-thue?area=<uuid>) bằng path có nghĩa (/cho-thue/binh-duong/di-an).
// UUID vẫn dùng nội bộ để query DB, chỉ slug lộ ra Google. Thuần, test được.
import type { Area, District } from './supabase';

// listingType trên URL dùng slug tiếng Việt; nội bộ dùng enum DB (mua_ban/cho_thue).
export type ListingSlug = 'mua-ban' | 'cho-thue';
export type ListingType = 'mua_ban' | 'cho_thue';

const SLUG_TO_TYPE: Record<ListingSlug, ListingType> = { 'mua-ban': 'mua_ban', 'cho-thue': 'cho_thue' };
const TYPE_TO_SLUG: Record<ListingType, ListingSlug> = { mua_ban: 'mua-ban', cho_thue: 'cho-thue' };

export function listingTypeToSlug(t: ListingType): ListingSlug {
  return TYPE_TO_SLUG[t];
}

export interface AreaListingPathParts {
  listingType: ListingType;
  areaSlug: string;
  districtSlug?: string;
}

// District slug trong DB bị tiền tố tên tỉnh (vd "binh-duong-di-an") để unique toàn
// hệ thống. URL SEO muốn dạng gọn "/binh-duong/di-an" → bỏ tiền tố "{areaSlug}-" khi
// hiển thị. Idempotent: truyền "di-an" hay "binh-duong-di-an" đều ra "di-an".
export function districtDisplaySlug(areaSlug: string, districtSlug: string): string {
  const prefix = `${areaSlug}-`;
  return districtSlug.startsWith(prefix) ? districtSlug.slice(prefix.length) : districtSlug;
}

// Dựng path: /{lt}/{areaSlug}/{districtSlug?}. Không kèm query (filter phụ thêm sau).
// districtSlug được rút gọn (bỏ tiền tố tỉnh) để URL sạch.
export function buildAreaListingPath(parts: AreaListingPathParts): string {
  const lt = TYPE_TO_SLUG[parts.listingType];
  const dist = parts.districtSlug ? districtDisplaySlug(parts.areaSlug, parts.districtSlug) : undefined;
  const segs = [lt, parts.areaSlug, dist].filter(Boolean);
  return `/${segs.join('/')}`;
}

// Chiều nghịch: từ listingSlug (đã biết từ folder route) + phần rest catch-all
// [areaSlug, districtSlug?] → parts. Trả null nếu thừa segment hoặc thiếu area.
export function parseAreaListingPath(listingSlug: string, rest: string[] | undefined): AreaListingPathParts | null {
  const listingType = SLUG_TO_TYPE[listingSlug as ListingSlug];
  if (!listingType) return null;
  const segs = rest ?? [];
  if (segs.length < 1 || segs.length > 2) return null;
  const [areaSlug, districtSlug] = segs;
  if (!areaSlug?.trim()) return null;
  if (segs.length === 2 && !districtSlug?.trim()) return null;
  return { listingType, areaSlug, districtSlug: districtSlug || undefined };
}

export interface ResolvedAreaPath {
  area: Area;
  district: District | null;
  areaId: string;
  districtId: string | null;
}

// Tra slug→UUID từ bảng thật. district (nếu có) PHẢI thuộc area — chống ghép
// /binh-duong/<district-của-tỉnh-khác>. Trả null → route gọi notFound().
export function resolveAreaPath(
  areaSlug: string,
  districtSlug: string | undefined,
  data: { areas: Pick<Area, 'id' | 'slug' | 'name' | 'description'>[] | Area[]; districts: District[] },
): ResolvedAreaPath | null {
  const area = data.areas.find(a => a.slug === areaSlug) as Area | undefined;
  if (!area) return null;
  if (!districtSlug) return { area, district: null, areaId: area.id, districtId: null };
  // URL mang slug gọn ("di-an"); DB lưu slug đầy đủ ("binh-duong-di-an"). Khớp cả 2
  // dạng qua districtDisplaySlug để URL sạch vẫn resolve đúng district trong area.
  const district = data.districts.find(
    d => d.area_id === area.id
      && (d.slug === districtSlug || districtDisplaySlug(area.slug, d.slug) === districtSlug),
  );
  if (!district) return null;
  return { area, district, areaId: area.id, districtId: district.id };
}
