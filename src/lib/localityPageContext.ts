// Context chuẩn hóa cho trang địa phương + báo cáo tự sinh. Thuần, deterministic,
// không đoán địa lý: mọi slug phải khớp taxonomy thật và đúng quan hệ cha/con.
// Dùng chung cho landing, report, FAQ, metadata, canonical và sitemap.
import type { PropertyTypeSeoGroup } from './propertyTypeGroups';
import { isPropertyTypeSeoGroup, propertyTypeSeoGroupFromSlug } from './propertyTypeGroups';
import {
  isLocalityPriceBand,
  LOCALITY_PRICE_BANDS,
  type LocalityPriceBand as SharedLocalityPriceBand,
} from './localityListingScope';

export type LocalityPageMode = 'landing' | 'report';
export type LocalityListingType = 'mua_ban' | 'cho_thue';
export type LocalityPropertyGroup = PropertyTypeSeoGroup;

export type LocalityPriceBandId = SharedLocalityPriceBand;

export type LocalityPriceBand = {
  id: LocalityPriceBandId;
  label: string;
  minVnd: number | null;
  maxVnd: number | null;
};

// Dùng cùng bảng với listing query. Page/report chỉ đổi biểu diễn cận mở thành null;
// ngưỡng và thứ tự không được khai báo lại ở hai nơi.
export const PRICE_BANDS: readonly LocalityPriceBand[] = LOCALITY_PRICE_BANDS.map(range => ({
  id: range.band,
  label: range.label,
  minVnd: range.min === 0 ? null : range.min,
  maxVnd: range.max ?? null,
}));

const PRICE_BAND_BY_ID = new Map<LocalityPriceBandId, LocalityPriceBand>(PRICE_BANDS.map(band => [band.id, band]));

export function isLocalityPriceBandId(value: string | null | undefined): value is LocalityPriceBandId {
  return Boolean(value && isLocalityPriceBand(value));
}

export function getPriceBand(id: LocalityPriceBandId): LocalityPriceBand {
  const band = PRICE_BAND_BY_ID.get(id);
  if (!band) throw new Error(`Unknown price band: ${id}`);
  return band;
}

// Giá không hợp lệ (0, âm, NaN, Infinity) KHÔNG được gán vào một khoảng mặc định.
export function priceBandFromVnd(vnd: number | null | undefined): LocalityPriceBandId | null {
  if (vnd == null || !Number.isFinite(vnd) || vnd <= 0) return null;
  const sharedBand = LOCALITY_PRICE_BANDS.find(range =>
    (range.min === 0 || vnd >= range.min) && (range.max === undefined || vnd < range.max),
  );
  return sharedBand?.band ?? null;
}

export type LocalityTaxonomy = {
  areas: ReadonlyArray<{ id: string; slug: string; name: string }>;
  districts: ReadonlyArray<{ id: string; area_id: string; slug: string; name: string }>;
  wards: ReadonlyArray<{ id: string; district_id: string; slug: string; name: string }>;
  propertyTypes: ReadonlyArray<{ id: string; slug: string; name: string }>;
};

export type LocalityPageContext = {
  mode: LocalityPageMode;
  listingType: LocalityListingType | null;
  areaId: string;
  areaSlug: string;
  areaName: string;
  districtId: string | null;
  districtSlug: string | null;
  districtName: string | null;
  wardId: string | null;
  wardSlug: string | null;
  wardName: string | null;
  propertyGroup: LocalityPropertyGroup | null;
  /** ID loại hình thật suy từ taxonomy. Rỗng khi không có scope loại hình. */
  propertyTypeIds: string[];
  /** Tiện dụng khi scope loại hình đúng một ID; null khi nhóm nhiều thành viên. */
  propertyTypeId: string | null;
  /** true khi segment loại hình là NHÓM (nha/dat/day-tro); false khi là slug chính xác. */
  typeSegmentIsGroup: boolean;
  /** Segment loại hình chuẩn hóa để dựng lại URL (null khi không có scope loại hình). */
  typePathSegment: string | null;
  priceBand: LocalityPriceBandId | null;
  /** true khi loại hình đến từ namespace /loai/ (cấp tỉnh); false cho legacy {d}/{t}. */
  typeNamespaced: boolean;
  /** URL landing thật của context (không bao giờ có suffix report). */
  landingPath: string;
  /** URL thật của context: report mode mang đúng một suffix /thong-tin. */
  path: string;
  /** URL report của landing tương ứng (luôn có đúng một suffix /thong-tin). */
  reportPath: string;
  title: string;
};

const LISTING_SLUG_TO_TYPE: Record<string, LocalityListingType> = { 'mua-ban': 'mua_ban', 'cho-thue': 'cho_thue' };
const TYPE_TO_LISTING_SLUG: Record<LocalityListingType, string> = { mua_ban: 'mua-ban', cho_thue: 'cho-thue' };
const REPORT_SUFFIX = 'thong-tin';
const TYPE_NAMESPACE = 'loai';
const PRICE_NAMESPACE = 'gia';
const WARD_NAMESPACE = 'phuong-xa';

// Rút slug huyện hiển thị gọn (bỏ tiền tố "{areaSlug}-") — idempotent, cùng quy tắc
// với areaPath.districtDisplaySlug để URL cũ vẫn resolve.
function displaySlug(parentSlug: string, childSlug: string): string {
  const prefix = `${parentSlug}-`;
  return childSlug.startsWith(prefix) ? childSlug.slice(prefix.length) : childSlug;
}

function isSafeSlugSegment(segment: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(segment);
}

function contextTitle(context: {
  mode: LocalityPageMode;
  listingType: LocalityListingType | null;
  areaName: string;
  districtName: string | null;
  wardName: string | null;
  propertyGroup: LocalityPropertyGroup | null;
  /** Segment loại hình đã chuẩn hóa (nhóm hoặc slug chính xác); null khi không có scope loại. */
  typePathSegment: string | null;
  /** true khi segment là NHÓM; false khi là slug chính xác. */
  typeSegmentIsGroup: boolean;
  /** Tên loại hình CHÍNH XÁC khi scope là một slug (rỗng cho nhóm). */
  exactTypeName: string | null;
  priceBand: LocalityPriceBandId | null;
  taxonomy: LocalityTaxonomy;
}): string {
  const place = [context.wardName, context.districtName, context.areaName].filter(Boolean).join(', ');
  const parts: string[] = [];
  // Report tách rõ bán/thuê: "Báo cáo dữ liệu bất động sản" chung, nhưng nêu giao dịch
  // khi scope đã chọn một chiều — không để report thuê đội lốt report chung.
  if (context.mode === 'report') {
    const kind = context.listingType === 'cho_thue' ? 'cho thuê' : context.listingType === 'mua_ban' ? 'mua bán' : null;
    parts.push(kind ? `Báo cáo dữ liệu bất động sản ${kind} ${place}` : `Báo cáo dữ liệu bất động sản ${place}`);
  }
  else if (context.listingType === 'cho_thue') parts.push(`Cho thuê bất động sản ${place}`);
  else if (context.listingType === 'mua_ban') parts.push(`Mua bán bất động sản ${place}`);
  else parts.push(`Bất động sản ${place}`);
  // Loại hình: slug chính xác chỉ nêu CHÍNH NÓ; nhóm mới liệt kê thành viên trong taxonomy.
  if (context.typeSegmentIsGroup && context.propertyGroup) {
    const typeNames = context.taxonomy.propertyTypes
      .filter(type => propertyTypeSeoGroupFromSlug(type.slug) === context.propertyGroup)
      .map(type => type.name);
    parts.push(typeNames.length ? typeNames.join(', ') : context.propertyGroup);
  } else if (context.exactTypeName) {
    parts.push(context.exactTypeName);
  }
  if (context.priceBand) parts.push(getPriceBand(context.priceBand).label);
  return parts.join(' — ');
}

type ParsedPath = {
  listingType: LocalityListingType | null;
  areaSlug: string;
  districtSeg: string | null;
  wardSeg: string | null;
  typeSeg: string | null;
  priceSeg: string | null;
  // true khi loại hình đến từ namespace /loai/ (cấp tỉnh). Legacy {d}/{t} để false.
  typeNamespaced: boolean;
  mode: LocalityPageMode;
};

// Nhận diện namespace + report suffix bằng shape tường minh. Trả null khi shape sai
// để route gọi notFound(); không suy diễn slug thành huyện/loại.
function parseSegments(segments: string[]): ParsedPath | null {
  if (segments.length === 0) return null;
  const segs = [...segments];
  let mode: LocalityPageMode = 'landing';
  if (segs[segs.length - 1] === REPORT_SUFFIX) {
    mode = 'report';
    segs.pop();
  }
  if (segs.length === 0) return null;

  // Nhánh /khu-vuc/{a}
  if (segs[0] === 'khu-vuc') {
    if (segs.length !== 2) return null;
    const areaSlug = segs[1];
    if (!isSafeSlugSegment(areaSlug)) return null;
    return { listingType: null, areaSlug, districtSeg: null, wardSeg: null, typeSeg: null, priceSeg: null, typeNamespaced: false, mode };
  }

  // Nhánh giao dịch /{listing}/{a}/…
  const listingType = LISTING_SLUG_TO_TYPE[segs[0]];
  if (!listingType) return null;
  const tail = segs.slice(1);
  if (tail.length < 1) return null;
  const areaSlug = tail[0];
  if (!isSafeSlugSegment(areaSlug)) return null;
  const rest = tail.slice(1);

  const base: ParsedPath = { listingType, areaSlug, districtSeg: null, wardSeg: null, typeSeg: null, priceSeg: null, typeNamespaced: false, mode };

  if (rest.length === 0) return base;

  // Namespace cấp tỉnh: /loai/{t} hoặc /gia/{b}
  if (rest[0] === TYPE_NAMESPACE || rest[0] === PRICE_NAMESPACE) {
    if (rest.length !== 2) return null;
    const value = rest[1];
    if (!isSafeSlugSegment(value)) return null;
    if (rest[0] === TYPE_NAMESPACE) {
      // /loai/ nhận cả nhóm nha/dat/day-tro lẫn slug loại hình chính xác trong taxonomy.
      return { ...base, typeSeg: value, typeNamespaced: true };
    }
    // Khoảng giá chỉ áp cho tin bán — thuê không có phân khúc giá trong phase.
    if (listingType === 'cho_thue') return null;
    if (!isLocalityPriceBandId(value)) return null;
    return { ...base, priceSeg: value };
  }

  // /{d} hoặc /{d}/{t} hoặc /{d}/phuong-xa/{w}
  const districtSeg = rest[0];
  if (!isSafeSlugSegment(districtSeg)) return null;
  if (rest.length === 1) return { ...base, districtSeg };
  if (rest[1] === WARD_NAMESPACE) {
    if (rest.length !== 3) return null;
    const wardSeg = rest[2];
    if (!isSafeSlugSegment(wardSeg)) return null;
    return { ...base, districtSeg, wardSeg };
  }
  if (rest.length === 2) {
    const typeSeg = rest[1];
    // Legacy {d}/{t}: nhóm nha/dat/day-tro hoặc slug loại hình chính xác.
    return { ...base, districtSeg, typeSeg };
  }
  return null;
}

export function resolveLocalityPageContext(pathname: string, taxonomy: LocalityTaxonomy): LocalityPageContext | null {
  if (!pathname.startsWith('/')) return null;
  const segments = pathname.split('/').slice(1);
  if (segments.some(segment => segment === '')) return null;
  const parsed = parseSegments(segments);
  if (!parsed) return null;

  const area = taxonomy.areas.find(candidate => candidate.slug === parsed.areaSlug);
  if (!area) return null;

  let district: LocalityTaxonomy['districts'][number] | null = null;
  if (parsed.districtSeg) {
    district = taxonomy.districts.find(
      candidate => candidate.area_id === area.id
        && (candidate.slug === parsed.districtSeg || displaySlug(area.slug, candidate.slug) === parsed.districtSeg),
    ) ?? null;
    if (!district) return null;
  }

  let ward: LocalityTaxonomy['wards'][number] | null = null;
  if (parsed.wardSeg) {
    if (!district) return null;
    ward = taxonomy.wards.find(
      candidate => candidate.district_id === district!.id
        && (candidate.slug === parsed.wardSeg || displaySlug(district!.slug, candidate.slug) === parsed.wardSeg),
    ) ?? null;
    if (!ward) return null;
  }

  // Loại hình: nhận NHÓM nha/dat/day-tro hoặc slug loại hình CHÍNH XÁC trong taxonomy.
  // propertyTypeIds luôn được suy từ taxonomy (không đoán từ row), để filter theo ID
  // thật; propertyGroup chỉ set khi segment là nhóm (dùng cho nhãn/title + report scope).
  let propertyGroup: LocalityPropertyGroup | null = null;
  let propertyTypeIds: string[] = [];
  let typeSegmentIsGroup = false;
  let exactTypeName: string | null = null;
  if (parsed.typeSeg) {
    const seg = parsed.typeSeg;
    if (isPropertyTypeSeoGroup(seg)) {
      propertyGroup = seg;
      typeSegmentIsGroup = true;
      propertyTypeIds = taxonomy.propertyTypes
        .filter(type => propertyTypeSeoGroupFromSlug(type.slug) === seg)
        .map(type => type.id);
    } else {
      const exact = taxonomy.propertyTypes.find(type => type.slug === seg);
      if (!exact) return null; // slug loại không có trong taxonomy → 404, không suy diễn.
      propertyTypeIds = [exact.id];
      propertyGroup = propertyTypeSeoGroupFromSlug(exact.slug);
      exactTypeName = exact.name;
    }
  }

  const priceBand: LocalityPriceBandId | null = parsed.priceSeg && isLocalityPriceBandId(parsed.priceSeg) ? parsed.priceSeg : null;

  const listingSlug = parsed.listingType ? TYPE_TO_LISTING_SLUG[parsed.listingType] : null;
  const districtSlug = district ? displaySlug(area.slug, district.slug) : null;
  const wardSlug = ward && district ? displaySlug(district.slug, ward.slug) : null;

  // Segment loại hình để dựng lại URL: nhóm giữ nguyên; slug chính xác lấy lại slug.
  const typePathSeg = parsed.typeSeg
    ? (isPropertyTypeSeoGroup(parsed.typeSeg)
      ? parsed.typeSeg
      : taxonomy.propertyTypes.find(type => type.id === propertyTypeIds[0])!.slug)
    : null;

  const pathSegments: string[] = [];
  if (listingSlug) pathSegments.push(listingSlug, area.slug);
  else pathSegments.push('khu-vuc', area.slug);
  if (districtSlug) pathSegments.push(districtSlug);
  if (wardSlug) pathSegments.push(WARD_NAMESPACE, wardSlug);
  // Loại hình: legacy {d}/{t} khi có huyện; namespace /loai/{t} khi cấp tỉnh.
  else if (typePathSeg && districtSlug) pathSegments.push(typePathSeg);
  else if (typePathSeg) pathSegments.push(TYPE_NAMESPACE, typePathSeg);
  if (priceBand && !wardSlug && !typePathSeg) pathSegments.push(PRICE_NAMESPACE, priceBand);
  // `path` là URL THẬT của context: report mode mang đúng một suffix /thong-tin.
  // `landingPath` luôn là URL landing tương ứng (không suffix) để dựng sitemap/redirect.
  const landingPath = `/${pathSegments.join('/')}`;
  const path = parsed.mode === 'report' ? `${landingPath}/${REPORT_SUFFIX}` : landingPath;
  const reportPath = `${landingPath}/${REPORT_SUFFIX}`;

  return {
    mode: parsed.mode,
    listingType: parsed.listingType,
    areaId: area.id,
    areaSlug: area.slug,
    areaName: area.name,
    districtId: district?.id ?? null,
    districtSlug,
    districtName: district?.name ?? null,
    wardId: ward?.id ?? null,
    wardSlug,
    wardName: ward?.name ?? null,
    propertyGroup,
    propertyTypeId: propertyTypeIds.length === 1 ? propertyTypeIds[0] : null,
    propertyTypeIds,
    /** true khi segment loại hình là NHÓM (nha/dat/day-tro), false khi là slug chính xác. */
    typeSegmentIsGroup,
    /** Segment loại hình đã chuẩn hóa để dựng lại URL: nhóm giữ nguyên, slug chính xác lấy lại slug. */
    typePathSegment: typePathSeg,
    priceBand,
    typeNamespaced: parsed.typeNamespaced,
    landingPath,
    path,
    reportPath,
    title: contextTitle({
      mode: parsed.mode, listingType: parsed.listingType, areaName: area.name,
      districtName: district?.name ?? null, wardName: ward?.name ?? null,
      propertyGroup, typePathSegment: typePathSeg, typeSegmentIsGroup, exactTypeName, priceBand, taxonomy,
    }),
  };
}

export type LocalityPagePathInput = Pick<LocalityPageContext, 'listingType' | 'areaSlug' | 'priceBand'> & {
  districtSlug: string | null;
  wardSlug: string | null;
  /** Segment loại hình đã chuẩn hóa: nhóm nha/dat/day-tro hoặc slug chính xác. */
  typePathSegment?: string | null;
  /** Alias của typePathSegment (giữ tương thích với caller cũ). */
  typeSegment?: string | null;
  /** true khi loại hình dùng namespace /loai/ (cấp tỉnh); false cho legacy {d}/{t}. */
  typeNamespaced?: boolean;
  /** 'report' chèn đúng một suffix /thong-tin; mặc định 'landing'. */
  mode?: LocalityPageMode;
};

export function buildLocalityPagePath(context: LocalityPagePathInput): string {
  const segments: string[] = [];
  const typeSeg = context.typePathSegment ?? context.typeSegment ?? null;
  if (context.listingType) segments.push(TYPE_TO_LISTING_SLUG[context.listingType], context.areaSlug);
  else segments.push('khu-vuc', context.areaSlug);
  if (context.districtSlug) segments.push(context.districtSlug);
  if (context.wardSlug) segments.push(WARD_NAMESPACE, context.wardSlug);
  else if (typeSeg) {
    // Mặc định namespace SUY TỪ việc có huyện hay không: có huyện → legacy {d}/{t};
    // cấp tỉnh → /loai/{t}. Caller truyền typeNamespaced tường minh sẽ thắng.
    const namespaced = context.typeNamespaced ?? (context.districtSlug === null);
    if (namespaced) segments.push(TYPE_NAMESPACE, typeSeg);
    else segments.push(typeSeg);
  } else if (context.priceBand) {
    segments.push(PRICE_NAMESPACE, context.priceBand);
  }
  const landingPath = `/${segments.join('/')}`;
  return context.mode === 'report' ? `${landingPath}/${REPORT_SUFFIX}` : landingPath;
}

// Chỉ enumerate các họ landing trong bảng phạm vi: tổng quan tỉnh, giao dịch
// tỉnh/huyện/loại cũ, loại hình (nhóm + slug chính xác) & khoảng giá cấp tỉnh,
// phường/xã. KHÔNG nhân tổ hợp tỉnh × huyện × xã × loại × giá. Khoảng giá chỉ cho tin
// bán. Adapter SEO xét riêng landing và report của mỗi context.
export function buildLocalitySitemapCandidates(taxonomy: LocalityTaxonomy): LocalityPageContext[] {
  const contexts: LocalityPageContext[] = [];
  const seen = new Set<string>();
  const push = (pathname: string) => {
    const context = resolveLocalityPageContext(pathname, taxonomy);
    if (!context || context.mode !== 'landing' || seen.has(context.path)) return;
    seen.add(context.path);
    contexts.push(context);
  };
  // Nhóm cố định + slug loại hình CHÍNH XÁC có trong taxonomy, cho namespace /loai/.
  const provinceTypeSegments = ['nha', 'dat', 'day-tro', ...taxonomy.propertyTypes.map(type => type.slug)];

  for (const area of taxonomy.areas) {
    push(`/khu-vuc/${area.slug}`);
    for (const listingSlug of ['mua-ban', 'cho-thue']) {
      push(`/${listingSlug}/${area.slug}`);
      for (const segment of provinceTypeSegments) push(`/${listingSlug}/${area.slug}/loai/${segment}`);
      // Khoảng giá là phân khúc giá bán; thuê không có landing khoảng giá.
      if (listingSlug === 'mua-ban') {
        for (const band of PRICE_BANDS) push(`/${listingSlug}/${area.slug}/gia/${band.id}`);
      }
      const districts = taxonomy.districts.filter(district => district.area_id === area.id);
      for (const district of districts) {
        const districtSlug = displaySlug(area.slug, district.slug);
        push(`/${listingSlug}/${area.slug}/${districtSlug}`);
        for (const segment of provinceTypeSegments) push(`/${listingSlug}/${area.slug}/${districtSlug}/${segment}`);
        const wards = taxonomy.wards.filter(ward => ward.district_id === district.id);
        for (const ward of wards) {
          push(`/${listingSlug}/${area.slug}/${districtSlug}/phuong-xa/${displaySlug(district.slug, ward.slug)}`);
        }
      }
    }
  }
  return contexts;
}
