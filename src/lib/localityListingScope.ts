// Hợp đồng thuần cho "phạm vi địa phương" (locality landing): route quyết định
// phạm vi, không phải query. Module này KHÔNG phụ thuộc core/taxonomy nên cả
// localityPageContext (server) lẫn ListingsPage/Properties đều import được mà
// không tạo vòng phụ thuộc core → filter.
//
// Bốn khoảng giá bán toàn tỉnh trong phase này. Cận trên ĐỘC QUYỀN và không chồng
// lấn ranh giới: tin đúng 2 tỷ thuộc "từ 2 đến dưới 5 tỷ", không thuộc "từ 1 đến
// dưới 2 tỷ".
export type LocalityPriceBand =
  | 'duoi-1-ty'
  | 'tu-1-den-duoi-2-ty'
  | 'tu-2-den-duoi-5-ty'
  | 'tu-5-ty';

export interface LocalityPriceBandRange {
  band: LocalityPriceBand;
  label: string;
  // VND. min LUÔN có (0 cho khoảng đầu); max undefined = không giới hạn trên.
  min: number;
  max?: number;
}

export const TY = 1_000_000_000;
const TRIEU = 1_000_000;

export const LOCALITY_PRICE_BANDS: readonly LocalityPriceBandRange[] = [
  { band: 'duoi-1-ty', label: 'Dưới 1 tỷ', min: 0, max: TY },
  { band: 'tu-1-den-duoi-2-ty', label: 'Từ 1 đến dưới 2 tỷ', min: TY, max: 2 * TY },
  { band: 'tu-2-den-duoi-5-ty', label: 'Từ 2 đến dưới 5 tỷ', min: 2 * TY, max: 5 * TY },
  { band: 'tu-5-ty', label: 'Từ 5 tỷ', min: 5 * TY },
];

const BAND_BY_KEY = new Map(LOCALITY_PRICE_BANDS.map(range => [range.band, range]));

export function isLocalityPriceBand(value: unknown): value is LocalityPriceBand {
  return typeof value === 'string' && BAND_BY_KEY.has(value as LocalityPriceBand);
}

// Tra khoảng theo mã URL. Mã lạ (kể cả khoảng cuối) trả null — route phải 404 chứ
// không được âm thầm rơi về "tất cả giá" rồi hiện tin ngoài phạm vi đã chọn.
export function localityPriceBandRange(band: string | undefined): LocalityPriceBandRange | null {
  if (!band) return null;
  return BAND_BY_KEY.get(band as LocalityPriceBand) ?? null;
}

// Khoảng giá bán áp lên phạm vi, dạng mảnh filter cho lib/api/properties. Chỉ có
// duy nhất field salePriceBand: nơi dựng query là thẩm quyền duy nhất về cột
// (price), đơn vị (VND) và cận trên độc quyền, tránh hai nơi cùng dựng điều kiện.
export function localityPriceBandParams(band: LocalityPriceBand): { salePriceBand: LocalityPriceBand } | null {
  if (!isLocalityPriceBand(band)) return null;
  return { salePriceBand: band };
}

// Một nhánh PostgREST cho một đơn vị. Cận trên độc quyền → `lt`, không `lte`.
// Khoảng đầu dùng `gt.0` thay `gte.0` để loại tin giá 0 (tin nháp/thiếu giá).
function bandBranch(unit: 'tỷ' | 'triệu', range: LocalityPriceBandRange): string {
  const lo = range.min / (unit === 'tỷ' ? TY : TRIEU);
  const hi = range.max === undefined ? undefined : range.max / (unit === 'tỷ' ? TY : TRIEU);
  const parts = [`price_unit.eq.${unit}`, `price.${range.min === 0 ? 'gt' : 'gte'}.${lo}`];
  if (hi !== undefined) parts.push(`price.lt.${hi}`);
  return `and(${parts.join(',')})`;
}

// Biểu thức PostgREST cho `.or()` khi lọc theo khoảng giá bán — dùng chung cho cả
// truy vấn public phía client (lib/api/properties) lẫn SSR (server/localityListings).
//
// Cột `price` KHÔNG lưu một đơn vị duy nhất: cùng mức 1.5 tỷ có thể được ghi là
// `price=1.5, price_unit='tỷ'` hoặc `price=1500, price_unit='triệu'`. So `price` thô
// với VND sẽ bỏ sót gần hết tin, nên mỗi khoảng phải là OR của hai nhánh đơn vị.
//
// Chốt thêm `listing_type.eq.mua_ban` (price của tin cho thuê là triệu/THÁNG, không
// phải tổng giá) và `price.gt.0`. Mã khoảng lạ → null: thà không lọc còn hơn âm thầm
// mở rộng ra toàn bộ giá.
export function salePriceBandPostgrestFilter(band: string | undefined): string | null {
  const range = localityPriceBandRange(band);
  if (!range) return null;
  return `and(listing_type.eq.mua_ban,price.gt.0,and(or(${bandBranch('tỷ', range)},${bandBranch('triệu', range)})))`;
}

// Dùng ở nơi KHÔNG được phép bỏ im lặng điều kiện giá: route đã đọc ra một mã khoảng
// giá (dù sai) nghĩa là phạm vi có khai giá. Trả null ở đây sẽ biến trang "từ 1–2 tỷ"
// thành "mọi mức giá" mà không báo gì — sai kiểu âm thầm. Mã rỗng/không khai thì vẫn
// là "không lọc giá" hợp lệ.
export function requireSalePriceBandFilter(band: string | undefined): string | null {
  if (band === undefined || band === '') return null;
  const expression = salePriceBandPostgrestFilter(band);
  if (!expression) throw new Error(`Mã khoảng giá không hợp lệ: ${band}`);
  return expression;
}


// Các chiều mà route sở hữu. Sửa bất kỳ chiều nào khi đang ở landing địa phương là
// rời phạm vi → phải điều hướng, không được giữ nguyên path cũ mà đổi ngầm nội dung.
export interface LocalityScopeDimensionInput {
  listingType?: string;
  areaId?: string;
  district?: string;
  ward?: string;
  typeId?: string;
  priceIdx?: number;
}

export interface LocalityScopeDimensionSelection {
  listingType?: string;
  areaId?: string;
  district?: string;
  ward?: string;
  typeId?: string;
  hasPriceFilter: boolean;
}

export function localityScopeDimensionsChanged(
  initial: LocalityScopeDimensionInput,
  current: LocalityScopeDimensionSelection,
): boolean {
  if ((initial.listingType ?? '') !== (current.listingType ?? '')) return true;
  if ((initial.areaId ?? '') !== (current.areaId ?? '')) return true;
  if ((initial.district ?? '') !== (current.district ?? '')) return true;
  if ((initial.ward ?? '') !== (current.ward ?? '')) return true;
  if ((initial.typeId ?? '') !== (current.typeId ?? '')) return true;
  // Chọn khoảng giá khi landing không khai khoảng giá nào là đổi phạm vi (đang là
  // "toàn tỉnh" → thành một khoảng). Ngược lại, landing có sẵn khoảng giá thì việc
  // bỏ khoảng đó cũng là đổi phạm vi.
  if (Boolean(current.hasPriceFilter) !== Boolean(initial.priceIdx)) return true;
  return false;
}

// Phạm vi địa phương mà ROUTE sở hữu, ở dạng thuần (chỉ ID, không tên). Cả
// localityPageContext/areaListingPage (server) lẫn ListingsPage (client) dùng chung
// type này để hai bên không lệch nhau về tên field.
//
// Dùng ID (`districtId`/`wardId`) chứ không dùng tên: tên hiển thị đổi được, ID thì
// không, nên URL/path giữ nguyên nghĩa qua các lần đổi nhãn.
export interface LocalityListingScope {
  // Đường dẫn namespace của route (vd /mua-ban/binh-duong/di-an/loai/nha). Nguồn chân
  // lý duy nhất cho URL — pageToHref không dựng lại được grammar này.
  path: string;
  // Khoá ngoại. areaId luôn có; districtId/wardId theo cấp mà route khai.
  areaId: string;
  districtId?: string;
  wardId?: string;
  // undefined bỏ lọc loại; [] là nhóm không có thành viên, không khớp tin nào.
  typeIds?: string[];
  typePathSlug?: string;
  // Các họ địa phương hỗ trợ bán và thuê; riêng priceBand chỉ dùng cho bán.
  listingType?: 'mua_ban' | 'cho_thue';
  priceBand?: LocalityPriceBand;
}
