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
  external_id: string | null;
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

export function normalizeListingPayload(body: unknown): NormalizeResult<ListingRow> {
  if (!isPlainObject(body)) {
    return { ok: false, errors: ['Body phải là một object JSON.'] };
  }

  const errors: string[] = [];

  const title = str(body.title, MAX_TITLE);
  if (!title) errors.push('title: bắt buộc, phải là chuỗi không rỗng.');

  const price = num(body.price);
  if (price === null || price <= 0) errors.push('price: bắt buộc, phải là số lớn hơn 0.');

  const city = str(body.city, MAX_SHORT);
  if (!city) errors.push('city: bắt buộc (tên tỉnh/thành, ví dụ "Bình Dương").');

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
      price: price as number,
      price_unit: str(body.price_unit, 20) ?? 'tỷ',
      price_label: str(body.price_label, MAX_SHORT),
      price_per_month: num(body.price_per_month),
      listing_type: listingType(body.listing_type),
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
      latitude: num(body.latitude),
      longitude: num(body.longitude),
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

  const title = str(body.title, MAX_TITLE);
  if (!title) errors.push('title: bắt buộc, phải là chuỗi không rỗng.');

  const content = str(body.content, 200000);
  if (!content) errors.push('content: bắt buộc, nội dung bài viết (HTML hoặc text).');

  if (errors.length) return { ok: false, errors };

  return {
    ok: true,
    row: {
      title: title as string,
      content: content as string,
      excerpt: str(body.excerpt, 500),
      category: str(body.category, 100) ?? 'Thị trường',
      author: str(body.author, MAX_SHORT) ?? 'Ban biên tập',
      image_url: httpUrl(body.image_url),
      meta_title: str(body.meta_title, MAX_SHORT),
      meta_description: str(body.meta_description, 400),
      focus_keywords: keywords(body.focus_keywords),
      external_id: str(body.external_id, MAX_SHORT),
      is_published: false,
    },
  };
}
