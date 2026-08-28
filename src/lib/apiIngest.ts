import { sanitizeArticleHtml } from './sanitizeHtml';
import { validateCoordinatePair } from './locationCoordinates';

// Chuẩn hóa payload từ nguồn ngoài (make.com) trước khi ghi DB. Tách khỏi route để
// test được không cần network/DB.
//
// Nguyên tắc bảo mật: hàm ở đây KHÔNG BAO GIỜ đọc cờ xuất bản từ body. status và
// is_published được ép cứng (pending / false) nên dù payload có gửi
// {"status":"approved"} thì tin vẫn phải qua duyệt tay. Tương tự, các cột do hệ
// thống quản (user_id, property_id, expires_at, slug, views) không nhận từ body —
// gán ở route hoặc để DB tự sinh.

export const LISTING_TYPES = ['mua_ban', 'cho_thue', 'can_mua', 'can_thue'] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const MAX_IMAGES = 30;

const MAX_TITLE = 300;
const MAX_SHORT = 200;
const MAX_TEXT = 20000;

export interface ListingRow {
  title: string;
  description: string | null;
  price: number;
  price_unit: string;
  price_label: string | null;
  price_per_month: number | null;
  listing_type: ListingType;
  area_sqm: number | null;
  address: string | null;
  city: string;
  district: string | null;
  ward: string | null;
  image_url: string | null;
  images: string[] | null;
  legal_status: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  direction: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_zalo: string | null;
  latitude: number | null;
  longitude: number | null;
  video_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  focus_keywords: string | null;
  external_id: string | null;
  status: 'pending';
}

export interface ArticleFaqItem {
  question: string;
  answer: string;
}

export interface ArticleCitationItem {
  title: string;
  url: string;
}

export interface ArticleRow {
  title: string;
  content: string;
  excerpt: string | null;
  category: string;
  author: string;
  image_url: string | null;
  meta_title: string | null;
  meta_description: string | null;
  focus_keywords: string | null;
  external_id: string;
  geo_area: string;
  geo_entity: string;
  geo_notes: string;
  faq: ArticleFaqItem[];
  citations: ArticleCitationItem[];
  is_published: false;
}

export type NormalizeResult<T> =
  | { ok: true; row: T }
  | { ok: false; errors: string[] };

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function str(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

function missingArticleString(v: unknown) {
  return v == null || (typeof v === 'string' && !v.trim());
}

function articleString(
  v: unknown,
  field: string,
  max: number,
  errors: string[],
): string | null {
  if (v == null) return null;
  if (typeof v !== 'string') {
    errors.push(`${field}: phải là chuỗi.`);
    return null;
  }
  const value = v.trim();
  if (!value) return null;
  if (value.length > max) {
    errors.push(`${field}: tối đa ${max} ký tự, không được cắt mất dữ liệu.`);
    return null;
  }
  return value;
}

// Số từ make.com hay về dạng chuỗi ("3.5") vì HTTP module không giữ kiểu.
function num(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim()) {
    const n = Number(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function int(v: unknown): number | null {
  const n = num(v);
  return n === null ? null : Math.trunc(n);
}

// Chỉ nhận http(s) — chặn javascript:, data:, và đường dẫn tương đối (ảnh ở host
// khác nên URL tương đối luôn sai).
function httpUrl(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:' ? s.slice(0, 2000) : null;
  } catch {
    return null;
  }
}

function listingType(v: unknown): ListingType {
  return typeof v === 'string' && (LISTING_TYPES as readonly string[]).includes(v)
    ? (v as ListingType)
    : 'mua_ban';
}

// Gộp keywords: nhận cả mảng và chuỗi "a, b, c".
function keywords(v: unknown): string | null {
  if (Array.isArray(v)) {
    const parts = v.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
    return parts.length ? parts.join(', ').slice(0, MAX_SHORT) : null;
  }
  return str(v, MAX_SHORT);
}

function hasOwn(object: Record<string, unknown>, key: string) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function articleKeywords(v: unknown, errors: string[]): string | null {
  if (v == null) return null;
  const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : null;
  if (!list || list.some(value => typeof value !== 'string')) {
    errors.push('focus_keywords: phải là chuỗi phân cách bằng dấu phẩy hoặc mảng chuỗi.');
    return null;
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  list.forEach(value => {
    const keyword = str(value, MAX_SHORT);
    if (!keyword) return;
    const key = keyword.toLocaleLowerCase('vi');
    if (seen.has(key)) return;
    seen.add(key);
    normalized.push(keyword);
  });

  const joined = normalized.join(', ');
  if (joined.length > MAX_SHORT) {
    errors.push(`focus_keywords: tổng độ dài không được vượt quá ${MAX_SHORT} ký tự.`);
  }
  return joined || null;
}

function normalizeFaq(v: unknown, errors: string[]): ArticleFaqItem[] {
  if (v == null) return [];
  if (!Array.isArray(v)) {
    errors.push('faq: phải là một mảng object { question, answer }.');
    return [];
  }
  if (v.length > 6) errors.push('faq: tối đa 6 cặp hỏi đáp.');

  const result: ArticleFaqItem[] = [];
  v.slice(0, 6).forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`faq[${index}]: phải là object { question, answer }.`);
      return;
    }
    const question = articleString(entry.question, `faq[${index}].question`, 500, errors);
    const answer = articleString(entry.answer, `faq[${index}].answer`, 5000, errors);
    if (!question || !answer) {
      errors.push(`faq[${index}]: question và answer là bắt buộc.`);
      return;
    }
    result.push({ question, answer });
  });
  return result;
}

function normalizeCitations(v: unknown, errors: string[]): ArticleCitationItem[] {
  if (v == null) return [];
  if (!Array.isArray(v)) {
    errors.push('citations: phải là một mảng object { title, url }.');
    return [];
  }
  if (v.length > 6) errors.push('citations: tối đa 6 nguồn tham khảo.');

  const result: ArticleCitationItem[] = [];
  v.slice(0, 6).forEach((entry, index) => {
    if (!isPlainObject(entry)) {
      errors.push(`citations[${index}]: phải là object { title, url }.`);
      return;
    }
    const title = articleString(entry.title, `citations[${index}].title`, 500, errors);
    const rawUrl = articleString(entry.url, `citations[${index}].url`, 2000, errors);
    const url = httpUrl(rawUrl);
    if (!title || !url) {
      errors.push(`citations[${index}]: title và URL HTTP(S) hợp lệ là bắt buộc.`);
      return;
    }
    result.push({ title, url });
  });
  return result;
}

export function normalizeListingPayload(body: unknown): NormalizeResult<ListingRow> {
  if (!isPlainObject(body)) {
    return { ok: false, errors: ['Body phải là một object JSON.'] };
  }

  const errors: string[] = [];

  const title = str(body.title, MAX_TITLE);
  if (!title) errors.push('title: bắt buộc, phải là chuỗi không rỗng.');

  const price = num(body.price);
  const monthlyPrice = num(body.price_per_month);
  const type = listingType(body.listing_type);
  const effectivePrice = type === 'cho_thue' ? (monthlyPrice ?? price) : price;
  if (effectivePrice === null || effectivePrice <= 0) {
    errors.push(type === 'cho_thue' ? 'price_per_month: bắt buộc, phải là số lớn hơn 0.' : 'price: bắt buộc, phải là số lớn hơn 0.');
  }

  const city = str(body.city, MAX_SHORT);
  if (!city) errors.push('city: bắt buộc (tên tỉnh/thành, ví dụ "Bình Dương").');

  const coordinates = validateCoordinatePair(body.latitude, body.longitude);
  if (!coordinates.valid) errors.push(`coordinates: ${coordinates.message}`);

  const rawImages = body.images;
  if (Array.isArray(rawImages) && rawImages.length > MAX_IMAGES) {
    errors.push(`images: tối đa ${MAX_IMAGES} ảnh, nhận được ${rawImages.length}.`);
  }

  if (errors.length) return { ok: false, errors };

  const images = Array.isArray(rawImages)
    ? rawImages.map(httpUrl).filter((u): u is string => u !== null)
    : [];

  return {
    ok: true,
    row: {
      title: title as string,
      description: str(body.description, MAX_TEXT),
      price: type === 'cho_thue' ? 0 : price as number,
      price_unit: type === 'cho_thue' ? 'triệu/tháng' : str(body.price_unit, 20) ?? 'tỷ',
      price_label: str(body.price_label, MAX_SHORT),
      price_per_month: type === 'cho_thue' ? effectivePrice : null,
      listing_type: type,
      area_sqm: num(body.area_sqm),
      address: str(body.address, MAX_SHORT),
      city: city as string,
      district: str(body.district, MAX_SHORT),
      ward: str(body.ward, MAX_SHORT),
      image_url: httpUrl(body.image_url) ?? images[0] ?? null,
      images: images.length ? images : null,
      legal_status: str(body.legal_status, MAX_SHORT),
      bedrooms: int(body.bedrooms),
      bathrooms: int(body.bathrooms),
      direction: str(body.direction, 50),
      contact_name: str(body.contact_name, MAX_SHORT),
      contact_phone: str(body.contact_phone, 30),
      contact_zalo: str(body.contact_zalo, 30),
      latitude: coordinates.valid ? coordinates.coordinates.latitude : null,
      longitude: coordinates.valid ? coordinates.coordinates.longitude : null,
      video_url: httpUrl(body.video_url),
      meta_title: str(body.meta_title, MAX_SHORT),
      meta_description: str(body.meta_description, 400),
      focus_keywords: keywords(body.focus_keywords),
      external_id: str(body.external_id, MAX_SHORT),
      status: 'pending',
    },
  };
}

export function normalizeArticlePayload(body: unknown): NormalizeResult<ArticleRow> {
  if (!isPlainObject(body)) {
    return { ok: false, errors: ['Body phải là một object JSON.'] };
  }

  const errors: string[] = [];
  const title = articleString(body.title, 'title', MAX_TITLE, errors);
  const rawContent = articleString(body.content, 'content', 200000, errors);
  const externalId = articleString(body.external_id, 'external_id', MAX_SHORT, errors);
  const category = articleString(body.category, 'category', 100, errors);
  const author = articleString(body.author, 'author', MAX_SHORT, errors);

  if (!title && missingArticleString(body.title)) {
    errors.push('title: bắt buộc, phải là chuỗi không rỗng.');
  }
  if (!rawContent && missingArticleString(body.content)) {
    errors.push('content: bắt buộc, nội dung bài viết (HTML hoặc text).');
  }
  if (!externalId && missingArticleString(body.external_id)) {
    errors.push('external_id: bắt buộc, phải ổn định cho mọi lần retry.');
  }
  if (!category && missingArticleString(body.category)) {
    errors.push('category: bắt buộc và phải khớp nhãn đang có trong Admin.');
  }
  if (!author && missingArticleString(body.author)) {
    errors.push('author: bắt buộc, dùng tên tác giả hoặc ban biên tập.');
  }
  if (hasOwn(body, 'schema_markup')) {
    errors.push('schema_markup: field hệ thống, server sẽ tự sinh.');
  }
  if (hasOwn(body, 'related_ids')) {
    errors.push('related_ids: field hệ thống, server sẽ tự chọn từ bài public.');
  }

  const focusKeywords = articleKeywords(body.focus_keywords, errors);
  const faq = normalizeFaq(body.faq, errors);
  const citations = normalizeCitations(body.citations, errors);
  const excerpt = articleString(body.excerpt, 'excerpt', 500, errors);
  const rawImageUrl = articleString(body.image_url, 'image_url', 2000, errors);
  const metaTitle = articleString(body.meta_title, 'meta_title', MAX_SHORT, errors);
  const metaDescription = articleString(body.meta_description, 'meta_description', 400, errors);
  const geoArea = articleString(body.geo_area, 'geo_area', MAX_SHORT, errors) ?? '';
  const geoEntity = articleString(body.geo_entity, 'geo_entity', MAX_SHORT, errors) ?? '';
  const geoNotes = articleString(body.geo_notes, 'geo_notes', 1000, errors) ?? '';
  const content = rawContent ? sanitizeArticleHtml(rawContent) : '';
  if (rawContent && !content) {
    errors.push('content: không còn nội dung hợp lệ sau khi lọc HTML nguy hiểm.');
  }

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    row: {
      title: title as string,
      content,
      excerpt,
      category: category as string,
      author: author as string,
      image_url: httpUrl(rawImageUrl),
      meta_title: metaTitle,
      meta_description: metaDescription,
      focus_keywords: focusKeywords,
      external_id: externalId as string,
      geo_area: geoArea,
      geo_entity: geoEntity,
      geo_notes: geoNotes,
      faq,
      citations,
      is_published: false,
    },
  };
}
