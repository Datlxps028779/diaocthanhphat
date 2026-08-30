import { stripHtml } from './markdown';
import { parsePriceInput } from './listingPrice';
import { validateCoordinatePair, type CoordinatePair } from './locationCoordinates';

export const LISTING_TITLE_MAX = 120;
export const DESCRIPTION_MIN = 80;
export const MAX_LISTING_IMAGES = 10;

type ListingFormLike = {
  listing_type: 'mua_ban' | 'cho_thue';
  title: string;
  price: string;
  price_per_month: string;
  loan_support: string;
  area_sqm: string;
  bedrooms: string;
  bathrooms: string;
  city: string;
  property_type_id: string;
  contact_name: string;
  contact_phone: string;
  latitude: string;
  longitude: string;
  image_url: string;
  images: string[];
  description: string;
};

export type ListingValidationErrors = Record<string, string>;

export function parseOptionalPositiveDecimal(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const raw = String(value).trim().replace(',', '.');
  if (!/^(?:\d+\.?\d*|\.\d+)$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseOptionalNonNegativeInteger(value: unknown): number | null {
  if (value === null || value === undefined || String(value).trim() === '') return null;
  const raw = String(value).trim();
  if (!/^\d+$/.test(raw)) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function plainTextDescription(value: string): string {
  return stripHtml(value || '').replace(/\s+/g, ' ').trim();
}

export function hasMeaningfulDescription(value: string): boolean {
  const text = plainTextDescription(value);
  return text.length >= DESCRIPTION_MIN && /[\p{L}\p{N}]/u.test(text);
}

function validImageUrls(form: Pick<ListingFormLike, 'images' | 'image_url'>): string[] {
  return [...new Set([
    ...form.images.filter(url => typeof url === 'string' && url.trim()),
    form.image_url.trim(),
  ].filter(Boolean))];
}

export function validateListingForm(form: ListingFormLike, options: { includeQualityGate?: boolean } = {}): ListingValidationErrors {
  const errors: ListingValidationErrors = {};
  if (!form.title.trim()) errors.title = 'Vui lòng nhập tiêu đề';
  else if ([...form.title.trim()].length > LISTING_TITLE_MAX) errors.title = `Tiêu đề tối đa ${LISTING_TITLE_MAX} ký tự`;
  if (!form.property_type_id) errors.property_type_id = 'Vui lòng chọn loại BĐS';

  if (form.listing_type === 'cho_thue') {
    if (parsePriceInput(form.price_per_month) === null) errors.price_per_month = 'Vui lòng nhập giá thuê hợp lệ (số lớn hơn 0)';
  } else {
    const price = parsePriceInput(form.price);
    if (price === null) errors.price = 'Vui lòng nhập giá hợp lệ (số lớn hơn 0)';
    const loan = parsePriceInput(form.loan_support);
    if (loan !== null && (price === null || loan >= price)) errors.loan_support = 'Khoản vay phải nhỏ hơn giá bán.';
  }

  if (!form.city.trim()) errors.city = 'Vui lòng nhập tỉnh/thành phố';
  if (form.area_sqm.trim() && parseOptionalPositiveDecimal(form.area_sqm) === null) errors.area_sqm = 'Diện tích phải là số lớn hơn 0';
  if (form.bedrooms.trim() && parseOptionalNonNegativeInteger(form.bedrooms) === null) errors.bedrooms = 'Số phòng ngủ phải là số nguyên từ 0 trở lên';
  if (form.bathrooms.trim() && parseOptionalNonNegativeInteger(form.bathrooms) === null) errors.bathrooms = 'Số phòng tắm phải là số nguyên từ 0 trở lên';

  const coordinates = validateCoordinatePair(form.latitude, form.longitude);
  if (!coordinates.valid) Object.assign(errors, coordinates.fieldErrors ?? { latitude: coordinates.message, longitude: coordinates.message });

  if (!form.contact_name.trim()) errors.contact_name = 'Vui lòng nhập họ tên';
  if (!form.contact_phone.trim()) errors.contact_phone = 'Vui lòng nhập số điện thoại';

  if (options.includeQualityGate) {
    if (validImageUrls(form).length === 0) errors.images = 'Vui lòng thêm ít nhất 1 ảnh bất động sản';
    if (!hasMeaningfulDescription(form.description)) errors.description = `Mô tả cần có ít nhất ${DESCRIPTION_MIN} ký tự có nội dung`;
  }
  return errors;
}

export function serializeOptionalCoordinatePair(form: Pick<ListingFormLike, 'latitude' | 'longitude'>): CoordinatePair {
  const result = validateCoordinatePair(form.latitude, form.longitude);
  return result.valid ? result.coordinates : { latitude: null, longitude: null };
}

export function countListingImages(form: Pick<ListingFormLike, 'images' | 'image_url'>): number {
  return validImageUrls(form).length;
}
