// Thống kê + gate chất lượng cho landing/report địa phương. Thuần, deterministic:
// cùng rows + computedAt cho ra cùng kết quả, không AI, không SQL, không lịch sử.
// Chỉ dùng dữ liệu public đã lọc; row thiếu ward vào bucket "unknown", không suy diễn.
import { getEffectiveListingPrice, priceToVnd } from './listingPrice';
import { formatUpdateDate } from './priceStatsFormat';
import type { FaqItem } from './propertyFaq';
import { getPriceBand, priceBandFromVnd, type LocalityPageContext } from './localityPageContext';

/** Tối thiểu 3 mẫu hợp lệ mới hiện mean/median/per-sqm. Đây KHÔNG phải ngưỡng index. */
export const MIN_PRICE_SAMPLES = 3;
/** Ngưỡng inventory nội bộ cho report (kế thừa areaSeo.MIN_AREA_LISTINGS_FOR_INDEX = 5). */
export const MIN_REPORT_INVENTORY = 5;
/** Report phải có ít nhất 2 module phân tích thật, không chỉ lặp intro/FAQ/count. */
export const MIN_REPORT_ANALYTICAL_MODULES = 2;

export const LOCALITY_SCOPE_VERSION = 'locality-scope-v1';

/** Input nội bộ tối thiểu cho aggregate/gate. Không bao giờ serialize ra client. */
export type LocalityReportRow = {
  id: string;
  title: string | null;
  area_id: string | null;
  district_id: string | null;
  ward_id: string | null;
  property_type_id: string | null;
  listing_type: string | null;
  price: number | null;
  price_unit: string | null;
  price_per_month: number | null;
  area_sqm: number | null;
};

export type LocalityPriceStats = {
  count: number;
  excludedCount: number;
  meanVnd: number | null;
  medianVnd: number | null;
  minVnd: number | null;
  maxVnd: number | null;
  perSqmVnd: number | null;
  perSqmSampleCount: number;
  sampleMet: boolean;
};

export type LocalityDistributions = {
  districts: Record<string, number>;
  wards: Record<string, number>;
  propertyTypes: Record<string, number>;
  priceBands: Record<string, number>;
};

export type LocalityReport = {
  scopeVersion: string;
  computedAt: string;
  counts: { total: number; sale: number; rent: number; unknownWard: number; unknownListingType: number };
  titledCount: number;
  distinctTitleCount: number;
  price: { sale: LocalityPriceStats; rent: LocalityPriceStats };
  distributions: LocalityDistributions;
  analyticalModules: string[];
  sampleCounts: { priceSamples: number; perSqmSamples: number };
};

export type LocalitySeoEvaluation = {
  indexable: boolean;
  robots: { index: boolean; follow: boolean };
  reasons: string[];
  scopeVersion: string;
  dataVersion: string;
};

const UNKNOWN = 'unknown';

function emptyPriceStats(): LocalityPriceStats {
  return {
    count: 0, excludedCount: 0, meanVnd: null, medianVnd: null, minVnd: null, maxVnd: null,
    perSqmVnd: null, perSqmSampleCount: 0, sampleMet: false,
  };
}

function validPositive(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * IDs loại hình cho scope, LẤY TỪ CONTEXT (đã resolve từ taxonomy). Không suy từ rows:
 * rows không mang slug nên mọi so khớp slug-với-ID đều rỗng và làm mất filter.
 * Trả về:

 *  - `null`  : không có scope loại hình → không lọc theo loại.
 *  - `[]`    : có scope loại hình nhưng taxonomy KHÔNG có thành viên nào → facet rỗng,
 *              phải khớp 0 row (không được nới thành "mọi row có loại").
 *  - `[...]` : tập ID hợp lệ; row phải có property_type_id thuộc tập này.
 */
function scopedTypeIds(context: LocalityPageContext): Set<string> | null {
  if (!context.typePathSegment) return null;
  return new Set(context.propertyTypeIds);
}

/**
 * Lọc rows theo ID trong context. KHÔNG khớp theo tên/slug. Row thiếu ward vẫn thuộc
 * count tỉnh/huyện đã xác định; chỉ loại khi context yêu cầu đúng một ward. Khoảng giá
 * LỌC row theo biên VND đã chuẩn hóa (xem below) — không phải chiều phân bố.
 */
export function filterLocalityRows(
  rows: readonly LocalityReportRow[],
  context: LocalityPageContext,
): LocalityReportRow[] {
  const typeIds = scopedTypeIds(context);
  const band = context.priceBand ? getPriceBand(context.priceBand) : null;
  return rows.filter(row => {
    if (row.area_id !== context.areaId) return false;
    if (context.districtId && row.district_id !== context.districtId) return false;
    if (context.wardId && row.ward_id !== context.wardId) return false;
    if (context.listingType && row.listing_type !== context.listingType) return false;
    // Loại hình: khớp CHÍNH XÁC theo ID. Tập rỗng → loại mọi row (facet rỗng thật).
    if (typeIds && (!row.property_type_id || !typeIds.has(row.property_type_id))) return false;
    // Khoảng giá thu hẹp phạm vi tin theo biên VND chuẩn hóa (min inclusive, max exclusive).
    // Row không có giá hợp lệ KHÔNG thuộc bất kỳ khoảng nào — bị loại, không gán mặc định.
    if (band) {
      const priceVnd = effectivePriceVnd(row);
      if (priceVnd == null) return false;
      if (band.minVnd != null && priceVnd < band.minVnd) return false;
      if (band.maxVnd != null && priceVnd >= band.maxVnd) return false;
    }
    return true;
  });
}

type Accumulator = { sum: number; values: number[] };

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

// Giá hợp lệ cho mẫu thống kê: bán dùng giá bán (đơn vị hỗ trợ tường minh), thuê dùng
// giá thuê/tháng. Đơn vị lạ bị loại, không quy về 0 và không đoán đơn vị.
function effectivePriceVnd(row: LocalityReportRow): number | null {
  if (row.listing_type === 'cho_thue') {
    const monthly = validPositive(row.price_per_month);
    if (monthly != null) {
      // Nhân 1e6 có thể tràn Number.MAX_VALUE → Infinity. Giá vô cực sẽ phá mean/median
      // của cả chiều thuê, nên loại hẳn thay vì đưa vào accumulator.
      const vnd = Math.round(monthly * 1_000_000);
      return Number.isFinite(vnd) ? vnd : null;
    }
    const effective = getEffectiveListingPrice(row);
    if (effective.source !== 'price' && effective.source !== 'price_per_month') return null;
    return priceToVnd(row);
  }
  if (row.price_unit !== 'tỷ' && row.price_unit !== 'triệu') return null;
  const effective = getEffectiveListingPrice(row);
  if (effective.source !== 'price') return null;
  return priceToVnd(row);
}

function summarize(acc: Accumulator, perSqm: Accumulator, total: number): LocalityPriceStats {
  const count = acc.values.length;
  const stats = emptyPriceStats();
  stats.count = count;
  stats.excludedCount = total - count;
  // Đếm mẫu /m² LUÔN được điền, kể cả dưới ngưỡng — đây là số liệu kiểm toán thật,
  // không phải thống kê suy diễn, nên không phụ thuộc sampleMet.
  stats.perSqmSampleCount = perSqm.values.length;
  stats.sampleMet = count >= MIN_PRICE_SAMPLES;
  if (!stats.sampleMet) return stats;
  stats.meanVnd = acc.sum / count;
  stats.medianVnd = median(acc.values);
  stats.minVnd = Math.min(...acc.values);
  stats.maxVnd = Math.max(...acc.values);
  // Đơn giá/m² từ từng tin (giá/diện tích), không lấy mean giá chia mean diện tích.
  if (perSqm.values.length >= MIN_PRICE_SAMPLES) stats.perSqmVnd = perSqm.sum / perSqm.values.length;
  return stats;
}

function bump(bucket: Record<string, number>, key: string | null): void {
  bucket[key ?? UNKNOWN] = (bucket[key ?? UNKNOWN] ?? 0) + 1;
}

export function getLocalityReport(
  rows: readonly LocalityReportRow[],
  context: LocalityPageContext,
  computedAt = new Date().toISOString(),
): LocalityReport {
  const scoped = filterLocalityRows(rows, context);
  const sale: Accumulator = { sum: 0, values: [] };
  const rent: Accumulator = { sum: 0, values: [] };
  const salePerSqm: Accumulator = { sum: 0, values: [] };
  const rentPerSqm: Accumulator = { sum: 0, values: [] };
  const distributions: LocalityDistributions = {
    districts: Object.create(null), wards: Object.create(null),
    propertyTypes: Object.create(null), priceBands: Object.create(null),
  };
  let saleCount = 0;
  let rentCount = 0;
  let unknownWard = 0;
  let unknownListingType = 0;
  const titles = new Set<string>();
  let titledCount = 0;

  for (const row of scoped) {
    if (row.ward_id) bump(distributions.wards, row.ward_id);
    else { bump(distributions.wards, null); unknownWard++; }
    bump(distributions.districts, row.district_id);
    bump(distributions.propertyTypes, row.property_type_id);
    const title = typeof row.title === 'string' ? row.title.trim() : '';
    if (title) { titledCount++; titles.add(title); }

    const priceVnd = effectivePriceVnd(row);
    // Phân loại TƯỜNG MINH: chỉ mua_ban mới là bán, chỉ cho_thue mới là thuê. Listing
    // type lạ/thiếu KHÔNG được gán vào bán — nếu gán, một tin rác làm sai mọi mean/median
    // của chiều bán. Row lạ vẫn nằm trong total và distributions (đếm trung thực), chỉ
    // không đóng góp vào accumulator giá nào.
    const isRent = row.listing_type === 'cho_thue';
    const isSale = row.listing_type === 'mua_ban';
    if (isRent) rentCount++;
    else if (isSale) saleCount++;
    else unknownListingType++;
    if (priceVnd != null && (isRent || isSale)) {
      bump(distributions.priceBands, isRent ? null : priceBandFromVnd(priceVnd));
    }
    const target = isRent ? rent : isSale ? sale : null;
    const perSqmTarget = isRent ? rentPerSqm : isSale ? salePerSqm : null;
    if (priceVnd != null && target && perSqmTarget) {
      target.values.push(priceVnd);
      target.sum += priceVnd;
      const sqm = validPositive(row.area_sqm);
      if (sqm != null) {
        const perSqm = priceVnd / sqm;
        if (Number.isFinite(perSqm) && perSqm > 0) { perSqmTarget.values.push(perSqm); perSqmTarget.sum += perSqm; }
      }
    }
  }

  const saleStats = summarize(sale, salePerSqm, saleCount);
  const rentStats = summarize(rent, rentPerSqm, rentCount);

  const analyticalModules = buildAnalyticalModules(distributions, saleStats, rentStats, scoped.length);

  return {
    scopeVersion: LOCALITY_SCOPE_VERSION,
    computedAt,
    counts: { total: scoped.length, sale: saleCount, rent: rentCount, unknownWard, unknownListingType },
    titledCount,
    distinctTitleCount: titles.size,
    price: { sale: saleStats, rent: rentStats },
    distributions,
    analyticalModules,
    sampleCounts: { priceSamples: saleStats.count + rentStats.count, perSqmSamples: salePerSqm.values.length + rentPerSqm.values.length },
  };
}

// Module phân tích "thật" — phải có dữ liệu đủ để kể một câu chuyện khác intro/FAQ/count.
function buildAnalyticalModules(
  distributions: LocalityDistributions,
  sale: LocalityPriceStats,
  rent: LocalityPriceStats,
  total: number,
): string[] {
  const modules: string[] = [];
  const withData = (bucket: Record<string, number>) => Object.keys(bucket).filter(key => key !== UNKNOWN).length;
  if (total > 0 && withData(distributions.districts) >= 2) modules.push('district_distribution');
  if (total > 0 && withData(distributions.propertyTypes) >= 2) modules.push('property_type_mix');
  if (total > 0 && withData(distributions.priceBands) >= 1) modules.push('price_band_distribution');
  if (sale.sampleMet || rent.sampleMet) modules.push('price_summary');
  if (sale.perSqmVnd != null || rent.perSqmVnd != null) modules.push('per_sqm_price');
  if (total > 0 && withData(distributions.wards) >= 2) modules.push('ward_coverage');
  return modules;
}

export type LocalitySeoOptions = {
  hasDescription?: boolean;
};

/**
 * Một evaluator chung cho metadata, sitemap và Search Visibility. Giữ nguyên chính
 * sách cũ: URL loại hình/huyện chính xác vẫn noindex. Report phải đủ inventory có
 * tiêu đề, đủ mẫu giá và >= 2 module phân tích thật, nếu không thì noindex + reasons.
 */
export function evaluateLocalitySeo(
  context: LocalityPageContext,
  report: LocalityReport,
  options: LocalitySeoOptions = {},
): LocalitySeoEvaluation {
  const reasons: string[] = [];
  // Chính sách index theo ĐÚNG gate cũ:
  //  - /khu-vuc/a (tổng quan tỉnh, không filter) và route cũ huyện+nhóm nha/dat: có thể index.
  //  - Giao dịch cấp tỉnh trần (/mua-ban/a), huyện trần (/a/d), và loại hình chính xác cũ: NOINDEX.
  //  - Namespace mới (loai/gia/phuong-xa) và report: index khi đủ ngưỡng + chất lượng.
  // Ngoại lệ index legacy CHỈ áp cho segment NHÓM nha/dat ở cấp huyện, không áp cho
  // slug loại hình chính xác (nha-pho) dù cùng nhóm — exact type giữ noindex.
  const isLegacyDistrictPrimaryGroup = context.districtId !== null
    && context.typeSegmentIsGroup
    && (context.propertyGroup === 'nha' || context.propertyGroup === 'dat')
    && context.priceBand === null
    && context.wardId === null;

  if (context.mode === 'report') {
    if (report.counts.total < MIN_REPORT_INVENTORY) reasons.push('not_enough_active_listings');
    if (report.titledCount < report.counts.total) reasons.push('missing_listing_title');
    if (report.distinctTitleCount < MIN_REPORT_INVENTORY) reasons.push('not_enough_distinct_titles');
    if (report.price.sale.count + report.price.rent.count < MIN_PRICE_SAMPLES) reasons.push('not_enough_price_samples');
    if (report.analyticalModules.length < MIN_REPORT_ANALYTICAL_MODULES) reasons.push('not_enough_analytical_modules');
  } else if (context.wardId !== null || context.priceBand !== null || context.typeNamespaced) {
    // Namespace mới: index khi đủ ngưỡng có tiêu đề phân biệt.
    if (!(options.hasDescription ?? true)) reasons.push('missing_unique_description');
    if (report.counts.total < MIN_REPORT_INVENTORY) reasons.push('not_enough_active_listings');
    if (report.titledCount < report.counts.total) reasons.push('missing_listing_title');
    if (report.distinctTitleCount < MIN_REPORT_INVENTORY) reasons.push('not_enough_distinct_titles');
  } else if (isLegacyDistrictPrimaryGroup) {
    // Route cũ huyện + nhóm nha/dat: giữ policy index như metadata cũ.
    if (!(options.hasDescription ?? true)) reasons.push('missing_unique_description');
    if (report.counts.total < MIN_REPORT_INVENTORY) reasons.push('not_enough_active_listings');
    if (report.titledCount < report.counts.total) reasons.push('missing_listing_title');
    if (report.distinctTitleCount < MIN_REPORT_INVENTORY) reasons.push('not_enough_distinct_titles');
  } else if (context.districtId === null && context.listingType === null && context.propertyGroup === null) {
    // /khu-vuc/a — tổng quan tỉnh: giữ gate area cũ.
    if (!(options.hasDescription ?? true)) reasons.push('missing_unique_description');
    if (report.counts.total < MIN_REPORT_INVENTORY) reasons.push('not_enough_active_listings');
    if (report.distinctTitleCount < MIN_REPORT_INVENTORY) reasons.push('not_enough_distinct_titles');
  } else {
    // /mua-ban/a, /a/d, và loại hình chính xác cũ: giữ noindex như gate legacy.
    reasons.push('legacy_scope_noindex');
  }

  const indexable = reasons.length === 0;
  return {
    indexable,
    robots: { index: indexable, follow: true },
    reasons,
    scopeVersion: LOCALITY_SCOPE_VERSION,
    dataVersion: report.computedAt,
  };
}

// Nhãn phạm vi phải phản ánh ĐÚNG facet đang lọc: nếu scope có loại hình hoặc khoảng giá,
// câu "hiện có N tin tại {place}" mà bỏ facet sẽ ngụ ý N là toàn tỉnh — sai. Thêm phần
// loại hình/khoảng giá vào nhãn để con số khớp phạm vi thật của report.
function scopeLabel(context: LocalityPageContext): string {
  const place = [context.wardName, context.districtName, context.areaName].filter(Boolean).join(', ');
  const facets: string[] = [];
  if (context.typePathSegment) facets.push(`loại ${context.typePathSegment}`);
  if (context.priceBand) facets.push(`khoảng giá ${getPriceBand(context.priceBand).label}`);
  return facets.length ? `${place} (${facets.join(', ')})` : place;
}

const vndFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });

// Diễn giải giá VND thật sang câu tiếng Việt; không bịa và không đổi nhãn mean/median.
// `suffix` bắt buộc cho giá thuê để đơn vị tháng hiện rõ trên MỌI con số (mean/median/range).
function describePriceVnd(vnd: number | null, suffix = ''): string {
  if (vnd == null || !Number.isFinite(vnd) || vnd <= 0) return '—';
  const amount = vnd >= 1e9 ? `${vndFormatter.format(vnd / 1e9)} tỷ` : `${vndFormatter.format(vnd / 1e6)} triệu`;
  return `${amount}${suffix}`;
}

function buildPriceAnswer(place: string, stats: LocalityPriceStats, kind: 'bán' | 'thuê'): string {
  const suffix = kind === 'thuê' ? '/tháng' : '';
  const mean = describePriceVnd(stats.meanVnd, suffix);
  const medianValue = describePriceVnd(stats.medianVnd, suffix);
  const range = stats.minVnd != null && stats.maxVnd != null
    ? ` Khoảng giá ${describePriceVnd(stats.minVnd, suffix)} – ${describePriceVnd(stats.maxVnd, suffix)}.`
    : '';
  const perSqm = stats.perSqmVnd != null
    ? kind === 'thuê'
      ? ` Đơn giá thuê khoảng ${describePriceVnd(stats.perSqmVnd)}/m²/tháng.`
      : ` Đơn giá khoảng ${describePriceVnd(stats.perSqmVnd)}/m².`
    : '';
  return `Giá chào ${kind} trung bình tại ${place} khoảng ${mean}, trung vị ${medianValue}, từ ${stats.count} tin có giá hợp lệ.${range}${perSqm}`;
}

// FAQ tự-sinh CHỈ từ số liệu thật trong report. Không hứa hạ tầng, tăng giá hay tư vấn
// đầu tư. Hai chế độ TÁCH BIỆT:
//  - landing: câu đếm + giá (khi đủ mẫu).
//  - report : câu PHƯƠNG PHÁP/nguồn/giới hạn/dữ liệu thiếu — KHÔNG lặp lại câu đếm/giá
//             của landing, vì đó là nội dung khác chứ không phải chi tiết thêm.
// Địa lý hợp lệ nhưng 0 tin vẫn phải có FAQ thật (đếm 0 + nguồn + giới hạn), không trả [].
export function buildLocalityFaq(context: LocalityPageContext, report: LocalityReport): FaqItem[] {
  const items: FaqItem[] = [];
  const place = scopeLabel(context);
  if (!place) return items;

  const updated = formatUpdateDate(report.computedAt);
  const updatedPart = updated ? ` Số liệu tính đến ${updated}.` : '';
  const sale = report.price.sale;
  const rent = report.price.rent;

  if (context.mode === 'report') {
    const scopeNote = context.typePathSegment || context.priceBand
      ? ' Phạm vi đã thu hẹp theo bộ lọc loại hình/khoảng giá của trang này.'
      : '';
    // Nguồn + phương pháp + giới hạn, kèm con số tổng để người đọc biết quy mô thật.
    items.push({
      question: `Số liệu trong báo cáo ${place} được tổng hợp theo phương pháp nào?`,
      answer: `Báo cáo chỉ dùng tin đăng công khai đang hoạt động trên Chợ Nhà Việt (${report.counts.total} tin trong phạm vi này), không dùng giá giao dịch thực tế hay ước lượng thị trường.${scopeNote}${updatedPart}`,
    });
    items.push({
      question: `Giá trung bình và trung vị trong báo cáo ${place} khác nhau thế nào?`,
      answer: 'Giá trung bình là tổng giá chia số tin; trung vị là giá đứng giữa khi sắp xếp. Trung vị ít bị lệch bởi vài tin giá rất cao hoặc rất thấp, nên hai số lệch nhau nhiều là dấu hiệu dữ liệu phân tán.',
    });
    // Ngưỡng mẫu: nói rõ vì sao có thể KHÔNG thấy giá, dù có tin.
    if (sale.sampleMet || rent.sampleMet) {
      items.push({
        question: `Bao nhiêu tin được dùng để tính giá tại ${place}?`,
        answer: `Thống kê giá bán dựa trên ${sale.count} tin có giá hợp lệ, giá thuê dựa trên ${rent.count} tin có giá hợp lệ. Chỉ hiện trung bình/trung vị khi đạt tối thiểu ${MIN_PRICE_SAMPLES} mẫu.`,
      });
    } else {
      items.push({
        question: `Vì sao báo cáo ${place} chưa hiển thị giá trung bình?`,
        answer: `Chưa đủ ${MIN_PRICE_SAMPLES} tin có giá hợp lệ để tính trung bình/trung vị (hiện có ${sale.count} mẫu giá bán, ${rent.count} mẫu giá thuê). Hiển thị giá từ quá ít tin sẽ gây hiểu sai, nên báo cáo chỉ nêu số lượng.`,
      });
    }
    // Dữ liệu thiếu: nói ĐÚNG hệ quả của từng bucket. Thiếu phường/xã chỉ chặn phân bổ
    // theo xã — KHÔNG loại tin khỏi thống kê giá; thiếu loại giao dịch mới là tin không
    // vào được thống kê giá (vì không biết là bán hay thuê).
    const unknowns: string[] = [];
    if (report.counts.unknownWard > 0) {
      unknowns.push(`${report.counts.unknownWard} tin chưa gắn phường/xã (vẫn được tính vào thống kê giá nếu có giá hợp lệ, chỉ không phân bổ được theo xã)`);
    }
    if (report.counts.unknownListingType > 0) {
      unknowns.push(`${report.counts.unknownListingType} tin chưa xác định loại giao dịch (không đóng góp vào thống kê giá bán/thuê)`);
    }
    if (unknowns.length) {
      items.push({
        question: `Những tin chưa đủ dữ liệu tại ${place} được xử lý ra sao?`,
        answer: `Trong phạm vi này có ${unknowns.join(', và ')}.`,
      });
    }
    return items;
  }

  // Landing: câu đếm luôn có, kể cả khi 0 tin — phải trung thực, không được im lặng.
  if (context.listingType === 'mua_ban') {
    items.push({
      question: `${place} hiện có bao nhiêu tin bất động sản đang bán?`,
      answer: `Hiện có ${report.counts.sale} tin đang bán tại ${place}, tính từ tin đăng công khai trên Chợ Nhà Việt.`,
    });
  } else if (context.listingType === 'cho_thue') {
    items.push({
      question: `${place} hiện có bao nhiêu tin bất động sản cho thuê?`,
      answer: `Hiện có ${report.counts.rent} tin cho thuê tại ${place}, tính từ tin đăng công khai trên Chợ Nhà Việt.`,
    });
  } else {
    items.push({
      question: `${place} hiện có bao nhiêu tin bất động sản?`,
      answer: `Hiện có ${report.counts.total} tin đang hoạt động tại ${place} (${report.counts.sale} tin bán, ${report.counts.rent} tin cho thuê).`,
    });
  }

  items[0].answer += `${updatedPart} Nguồn: tin đăng công khai trên Chợ Nhà Việt, không đại diện toàn thị trường.`;
  if (report.counts.total === 0) items[0].answer += ' Chưa có mẫu để thống kê giá trong phạm vi này.';

  if (sale.sampleMet) {
    items.push({
      question: `Giá chào bán bất động sản tại ${place} khoảng bao nhiêu?`,
      answer: `${buildPriceAnswer(place, sale, 'bán')}${updatedPart} Số liệu từ tin đăng công khai, không phải giá giao dịch hay đại diện toàn thị trường.`,
    });
  }
  if (rent.sampleMet) {
    items.push({
      question: `Giá thuê bất động sản tại ${place} khoảng bao nhiêu?`,
      answer: `${buildPriceAnswer(place, rent, 'thuê')}${updatedPart} Số liệu từ tin đăng công khai.`,
    });
  }

  return items;
}
