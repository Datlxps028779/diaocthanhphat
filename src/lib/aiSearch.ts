import type { Area, District, PropertyType, Ward } from './supabase';
import type { PropertyFilters } from './api/properties';
import { LEGAL_OPTIONS } from './legalOptions';

export type AiSearchMatchKind = 'listingType' | 'area' | 'district' | 'ward' | 'type' | 'price' | 'areaSize' | 'bedrooms' | 'legal' | 'direction';
export interface AiSearchMatch { kind: AiSearchMatchKind; label: string }
export interface SearchTaxonomy {
  areas: Area[];
  districts: District[];
  wards: Ward[];
  propertyTypes: PropertyType[];
}
export interface SearchIntent {
  filters: Partial<PropertyFilters>;
  residualKeyword: string;
  matched: AiSearchMatch[];
  confidence: 'high' | 'medium' | 'low';
}

const DIRECTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Bắc', 'Đông Nam', 'Tây Bắc', 'Tây Nam'];

export function normalizeVietnamese(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/m\s*[²2]/g, ' m2')
    .replace(/(\d)\s*(pn)\b/g, '$1 pn')
    .replace(/\b(tỉ|ty)\b/g, 'ty')
    .replace(/\b(trieu|triệu)\b/g, 'trieu')
    .replace(/\btr\b/g, 'trieu')
    .replace(/[-–—]/g, '-')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function removeSpan(spans: string[], phrase: string) {
  if (phrase.trim()) spans.push(phrase.trim());
}

function mergeFilter<T extends keyof PropertyFilters>(out: Partial<PropertyFilters>, explicit: Partial<PropertyFilters> | undefined, key: T, value: PropertyFilters[T]) {
  if ((explicit?.[key] as unknown) !== undefined && explicit?.[key] !== '' && explicit?.[key] !== 'all') return false;
  out[key] = value;
  return true;
}

function findNamed<T extends { name: string }>(queryNorm: string, items: T[]): T | null {
  const sorted = [...items].sort((a, b) => normalizeVietnamese(b.name).length - normalizeVietnamese(a.name).length);
  return sorted.find(item => new RegExp(`(^| )${escapeRegExp(normalizeVietnamese(item.name))}($| )`).test(queryNorm)) ?? null;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findType(queryNorm: string, types: PropertyType[]): PropertyType | null {
  const direct = findNamed(queryNorm, types);
  if (direct) return direct;
  const aliases: Array<{ terms: string[]; re: RegExp }> = [
    { terms: ['Căn hộ', 'Chung cư'], re: /(^| )(can ho|chung cu)($| )/ },
    { terms: ['Đất nền'], re: /(^| )(dat nen|dat)($| )/ },
    { terms: ['Nhà phố'], re: /(^| )(nha pho|nha o)($| )/ },
    { terms: ['Biệt thự'], re: /(^| )(biet thu)($| )/ },
  ];
  const matched = aliases.find(a => a.re.test(queryNorm));
  if (!matched) return null;
  return types.find(t => matched.terms.some(term => normalizeVietnamese(t.name).includes(normalizeVietnamese(term)))) ?? null;
}

function extractPrice(queryNorm: string): { min?: number; max?: number; unit?: 'ty' | 'trieu'; phrase?: string } | null {
  const range = queryNorm.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*(ty|trieu)/);
  if (range) return { min: Number(range[1]), max: Number(range[2]), unit: range[3] as 'ty' | 'trieu', phrase: range[0] };
  const under = queryNorm.match(/\b(duoi|nho hon|toi da)\s+(\d+(?:\.\d+)?)\s*(ty|trieu)/);
  if (under) return { max: Number(under[2]), unit: under[3] as 'ty' | 'trieu', phrase: under[0] };
  const above = queryNorm.match(/\b(tren|tu)\s+(\d+(?:\.\d+)?)\s*(ty|trieu)/);
  if (above) return { min: Number(above[2]), unit: above[3] as 'ty' | 'trieu', phrase: above[0] };
  // Cụm chỉ NGÂN SÁCH ("tôi có 500 triệu", "ngân sách 2 tỷ", "tầm/khoảng/với X")
  // → hiểu là giá trần (max). Trước đây không bắt → không lọc giá → gợi cả BĐS vượt xa túi tiền.
  const budget = queryNorm.match(/\b(co|toi co|minh co|ngan sach|tam|khoang|voi|trong tam)\s+(\d+(?:\.\d+)?)\s*(ty|trieu)/);
  if (budget) return { max: Number(budget[2]), unit: budget[3] as 'ty' | 'trieu', phrase: budget[0] };
  // Fallback: bất kỳ "X triệu/tỷ" đứng một mình cũng coi là ngân sách trần (bối cảnh tìm/tư vấn).
  const bare = queryNorm.match(/(\d+(?:\.\d+)?)\s*(ty|trieu)/);
  if (bare) return { max: Number(bare[1]), unit: bare[2] as 'ty' | 'trieu', phrase: bare[0] };
  return null;
}

// Mua bán lưu giá theo tỷ; cho thuê theo triệu/tháng. "900 triệu" mua bán → 0.9 tỷ.
function normalizePriceForListing(value: number, unit: 'ty' | 'trieu' | undefined, listingType?: string): number {
  if (unit === 'trieu' && listingType !== 'cho_thue') return value / 1000;
  if (unit === 'ty' && listingType === 'cho_thue') return value * 1000;
  return value;
}

function extractArea(queryNorm: string): { min?: number; max?: number; phrase?: string } | null {
  const range = queryNorm.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*m2/);
  if (range) return { min: Number(range[1]), max: Number(range[2]), phrase: range[0] };
  const under = queryNorm.match(/\b(duoi|nho hon|toi da)\s+(\d+(?:\.\d+)?)\s*m2/);
  if (under) return { max: Number(under[2]), phrase: under[0] };
  const above = queryNorm.match(/\b(tren|tu)\s+(\d+(?:\.\d+)?)\s*m2/);
  if (above) return { min: Number(above[2]), phrase: above[0] };
  return null;
}

function extractBedrooms(queryNorm: string): { value: string; phrase: string } | null {
  const m = queryNorm.match(/\b(\d+)\s*(pn|phong ngu)\b/);
  return m ? { value: m[1], phrase: m[0] } : null;
}

function legalMatch(queryNorm: string): string | null {
  if (/\b(so hong|so do|so rieng|so hong rieng)\b/.test(queryNorm)) return LEGAL_OPTIONS.includes('Sổ hồng') ? 'Sổ hồng' : null;
  if (/\b(hdmb|hop dong mua ban)\b/.test(queryNorm)) return LEGAL_OPTIONS.includes('Hợp đồng mua bán') ? 'Hợp đồng mua bán' : null;
  return LEGAL_OPTIONS.find(opt => new RegExp(`(^| )${escapeRegExp(normalizeVietnamese(opt))}($| )`).test(queryNorm)) ?? null;
}

function directionMatch(queryNorm: string): string | null {
  return DIRECTIONS.find(d => new RegExp(`(^| )huong ${escapeRegExp(normalizeVietnamese(d))}($| )`).test(queryNorm)) ?? null;
}

function rawResidual(raw: string, rawPhrases: string[]): string {
  let out = raw;
  for (const phrase of rawPhrases.sort((a, b) => b.length - a.length)) {
    out = out.replace(new RegExp(escapeRegExp(phrase), 'iu'), ' ');
  }
  return out.replace(/\s+/g, ' ').trim();
}

function rawPhraseForNorm(raw: string, normPhrase: string): string {
  const tokens = normPhrase.split(' ').filter(Boolean);
  if (!tokens.length) return '';
  const rawTokens = raw.split(/\s+/);
  const expanded: Array<{ token: string; rawIndex: number }> = [];
  rawTokens.forEach((rt, rawIndex) => {
    normalizeVietnamese(rt).split(' ').filter(Boolean).forEach(token => expanded.push({ token, rawIndex }));
  });
  for (let i = 0; i <= expanded.length - tokens.length; i++) {
    if (!tokens.every((t, j) => expanded[i + j].token === t)) continue;
    const start = expanded[i].rawIndex;
    const end = expanded[i + tokens.length - 1].rawIndex;
    return rawTokens.slice(start, end + 1).join(' ');
  }
  return normPhrase;
}

export function parseSearchIntent(query: string, taxonomy: SearchTaxonomy, explicitFilters: Partial<PropertyFilters> = {}): SearchIntent {
  const q = normalizeVietnamese(query);
  const filters: Partial<PropertyFilters> = {};
  const matched: AiSearchMatch[] = [];
  const remove: string[] = [];

  if (/(^| )(cho thue|thue|rent)($| )/.test(q)) {
    if (mergeFilter(filters, explicitFilters, 'listingType', 'cho_thue')) matched.push({ kind: 'listingType', label: 'Cho thuê' });
    removeSpan(remove, rawPhraseForNorm(query, q.includes('cho thue') ? 'cho thue' : q.includes('thue') ? 'thue' : 'rent'));
  } else if (/(^| )(mua ban|mua|ban)($| )/.test(q)) {
    if (mergeFilter(filters, explicitFilters, 'listingType', 'mua_ban')) matched.push({ kind: 'listingType', label: 'Mua bán' });
    const phrase = q.includes('mua ban') ? 'mua ban' : q.includes('mua') ? 'mua' : 'ban';
    removeSpan(remove, rawPhraseForNorm(query, phrase));
  }

  const area = findNamed(q, taxonomy.areas);
  if (area && mergeFilter(filters, explicitFilters, 'areaId', area.id)) {
    matched.push({ kind: 'area', label: area.name });
    removeSpan(remove, rawPhraseForNorm(query, normalizeVietnamese(area.name)));
  }

  let district = findNamed(q, taxonomy.districts);
  if (!district && /(^| )tdm($| )/.test(q)) district = taxonomy.districts.find(d => normalizeVietnamese(d.name) === 'thu dau mot') ?? null;
  if (district && mergeFilter(filters, explicitFilters, 'district', district.name)) {
    matched.push({ kind: 'district', label: district.name });
    removeSpan(remove, /(^| )tdm($| )/.test(q) && normalizeVietnamese(district.name) === 'thu dau mot' ? 'tdm' : rawPhraseForNorm(query, normalizeVietnamese(district.name)));
  }

  const ward = findNamed(q, taxonomy.wards);
  const explicitWardPhrase = ward && new RegExp(`(^| )(phuong|xa|thi tran) ${escapeRegExp(normalizeVietnamese(ward.name).replace(/^(phuong|xa|thi tran) /, ''))}($| )`).test(q);
  const wardDuplicatesDistrict = ward && district && normalizeVietnamese(ward.name).replace(/^(phuong|xa|thi tran) /, '') === normalizeVietnamese(district.name);
  if (ward && (!wardDuplicatesDistrict || explicitWardPhrase) && mergeFilter(filters, explicitFilters, 'ward', ward.name)) {
    matched.push({ kind: 'ward', label: ward.name });
    removeSpan(remove, rawPhraseForNorm(query, normalizeVietnamese(ward.name)));
  }

  const type = findType(q, taxonomy.propertyTypes);
  if (type && mergeFilter(filters, explicitFilters, 'typeId', type.id)) {
    matched.push({ kind: 'type', label: type.name });
    const typeNorm = normalizeVietnamese(type.name);
    const aliases = [typeNorm, 'can ho', 'chung cu', 'dat nen', 'dat', 'nha pho', 'nha o', 'biet thu'];
    const phrase = aliases.find(a => new RegExp(`(^| )${escapeRegExp(a)}($| )`).test(q)) ?? typeNorm;
    removeSpan(remove, rawPhraseForNorm(query, phrase));
  }

  const price = extractPrice(q);
  if (price) {
    const listingType = filters.listingType ?? explicitFilters.listingType;
    const min = price.min == null ? undefined : normalizePriceForListing(price.min, price.unit, listingType);
    const max = price.max == null ? undefined : normalizePriceForListing(price.max, price.unit, listingType);
    const wroteMin = min == null || mergeFilter(filters, explicitFilters, 'minPrice', min);
    const wroteMax = max == null || mergeFilter(filters, explicitFilters, 'maxPrice', max);
    if (wroteMin || wroteMax) {
      const unitLabel = listingType === 'cho_thue' ? ' triệu' : price.unit === 'trieu' && listingType !== 'cho_thue' ? ' triệu' : '';
      matched.push({
        kind: 'price',
        label: price.min != null && price.max != null
          ? `${price.min}–${price.max}${unitLabel}`
          : price.max != null
            ? `Dưới ${price.max}${unitLabel}`
            : `Trên ${price.min}${unitLabel}`,
      });
    }
    if (price.phrase) removeSpan(remove, rawPhraseForNorm(query, price.phrase));
  }

  const areaSize = extractArea(q);
  if (areaSize) {
    const wroteMin = areaSize.min == null || mergeFilter(filters, explicitFilters, 'minArea', areaSize.min);
    const wroteMax = areaSize.max == null || mergeFilter(filters, explicitFilters, 'maxArea', areaSize.max);
    if (wroteMin || wroteMax) matched.push({ kind: 'areaSize', label: areaSize.min != null && areaSize.max != null ? `${areaSize.min}–${areaSize.max} m²` : areaSize.max != null ? `Dưới ${areaSize.max} m²` : `Trên ${areaSize.min} m²` });
    if (areaSize.phrase) removeSpan(remove, rawPhraseForNorm(query, areaSize.phrase));
  }

  const beds = extractBedrooms(q);
  if (beds && mergeFilter(filters, explicitFilters, 'bedrooms', beds.value)) {
    matched.push({ kind: 'bedrooms', label: `${beds.value} PN` });
    removeSpan(remove, rawPhraseForNorm(query, beds.phrase));
  }

  const legal = legalMatch(q);
  if (legal && mergeFilter(filters, explicitFilters, 'legal', legal)) {
    matched.push({ kind: 'legal', label: legal });
    const phrase = /so hong rieng/.test(q) ? 'so hong rieng' : /so hong|so do|so rieng/.exec(q)?.[0] ?? /hdmb/.exec(q)?.[0] ?? normalizeVietnamese(legal);
    removeSpan(remove, rawPhraseForNorm(query, phrase));
  }

  const direction = directionMatch(q);
  if (direction && mergeFilter(filters, explicitFilters, 'direction', direction)) {
    matched.push({ kind: 'direction', label: `Hướng ${direction}` });
    removeSpan(remove, rawPhraseForNorm(query, `huong ${normalizeVietnamese(direction)}`));
  }

  return {
    filters,
    residualKeyword: rawResidual(query, remove),
    matched,
    confidence: matched.length >= 2 ? 'high' : matched.length === 1 ? 'medium' : 'low',
  };
}
