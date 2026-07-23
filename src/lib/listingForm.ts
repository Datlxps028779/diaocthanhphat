import type { UserListing, ListingType, Property, PropertyType } from './supabase';
import type { FaqItem } from './propertyFaq';
import { generateSlug } from './useSEOAutofill';

// State của form đăng tin (PostListingPage). Mọi trường là chuỗi vì input HTML
// dùng chuỗi; số/JSON được nén lại lúc submit.
export interface ListingFormState {
  listing_type: ListingType;
  title: string; description: string;
  price: string; price_unit: string; price_label: string;
  price_per_month: string;
  loan_support: string;
  area_sqm: string; address: string; city: string; district: string; ward: string;
  area_id: string; property_type_id: string;
  image_url: string; images: string[];
  video_url: string;
  legal_status: string; bedrooms: string; bathrooms: string; direction: string;
  contact_name: string; contact_phone: string; amenities: string[];
  latitude: string; longitude: string;
  meta_title: string; meta_description: string; focus_keywords: string; schema_markup: string;
  faq: { question: string; answer: string }[];
}

const s = (v: string | null | undefined) => v ?? '';
// Số → chuỗi; 0 coi như "chưa nhập" (price=0 ở tin cho thuê, hoặc chưa điền).
const n = (v: number | null | undefined) => (v == null || v === 0 ? '' : String(v));

// Chuyển một row DB thành state form để mở lại ở chế độ sửa. Nghịch đảo của bước
// nén dữ liệu lúc submit trong PostListingPage.
export function listingToFormState(l: UserListing): ListingFormState {
  return {
    listing_type: l.listing_type,
    title: s(l.title), description: s(l.description),
    price: n(l.price), price_unit: s(l.price_unit) || 'tỷ', price_label: s(l.price_label),
    price_per_month: n(l.price_per_month),
    loan_support: n(l.loan_support),
    area_sqm: n(l.area_sqm), address: s(l.address), city: s(l.city),
    district: s(l.district), ward: s(l.ward),
    area_id: s(l.area_id), property_type_id: s(l.property_type_id),
    image_url: s(l.image_url), images: l.images ?? [],
    video_url: s(l.video_url),
    legal_status: s(l.legal_status), bedrooms: n(l.bedrooms), bathrooms: n(l.bathrooms),
    direction: s(l.direction),
    contact_name: s(l.contact_name), contact_phone: s(l.contact_phone),
    amenities: l.amenities ?? [],
    latitude: n(l.latitude), longitude: n(l.longitude),
    meta_title: s(l.meta_title), meta_description: s(l.meta_description),
    focus_keywords: s(l.focus_keywords),
    schema_markup: l.schema_markup ? JSON.stringify(l.schema_markup, null, 2) : '',
    faq: l.faq ?? [],
  };
}

// Dựng Property tạm từ form state để tái dùng builder public (buildPropertyMetadata +
// buildPropertyJsonLd) và render preview bằng chính PropertyDetailPage — form khớp 1:1
// trang công khai /bat-dong-san/[slug]. Field số trong form là chuỗi → number | null;
// field không có trong form → null.
export function formToProperty(
  form: Record<string, unknown>,
  property: Property | null,
  types: PropertyType[],
  faq: FaqItem[],
): Property {
  const num = (v: unknown) => {
    if (v === '' || v === null || v === undefined) return null;
    const parsed = Number(v);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const str = (v: unknown) => (v === '' || v === null || v === undefined ? null : String(v));
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : null);
  const slug = (str(form.slug) || generateSlug(String(form.title ?? '')) || 'slug') as string;
  const now = new Date().toISOString();
  const typeId = str(form.property_type_id);
  const propertyType = types.find(t => t.id === typeId) ?? null;
  return {
    id: property?.id ?? 'draft',
    title: String(form.title ?? ''),
    description: str(form.description),
    price: num(form.price) ?? 0,
    price_unit: String(form.price_unit ?? 'tỷ'),
    price_label: str(form.price_label),
    price_per_month: num(form.price_per_month),
    loan_support: num(form.loan_support),
    listing_type: (form.listing_type as Property['listing_type']) ?? 'mua_ban',
    area_sqm: num(form.area_sqm),
    address: str(form.address),
    city: String(form.city ?? ''),
    district: str(form.district),
    ward: str(form.ward),
    area_id: str(form.area_id),
    district_id: property?.district_id ?? null,
    property_type_id: typeId,
    image_url: str(form.image_url),
    images: arr(form.images),
    badge: str(form.badge),
    badge_color: str(form.badge_color),
    legal_status: str(form.legal_status),
    is_featured: Boolean(form.is_featured),
    is_hot: Boolean(form.is_hot),
    is_active: Boolean(form.is_active),
    is_verified: Boolean(form.is_verified),
    views: property?.views ?? 0,
    contact_name: str(form.contact_name),
    contact_phone: str(form.contact_phone),
    bedrooms: num(form.bedrooms),
    bathrooms: num(form.bathrooms),
    floor_count: num(form.floor_count),
    floor_number: num(form.floor_number),
    direction: str(form.direction),
    road_width: num(form.road_width),
    frontage: num(form.frontage),
    amenities: arr(form.amenities) ?? property?.amenities ?? null,
    latitude: num(form.latitude),
    longitude: num(form.longitude),
    formatted_address: property?.formatted_address ?? null,
    vr_tour_url: str(form.vr_tour_url),
    video_url: str(form.video_url),
    contact_zalo: str(form.contact_zalo),
    tags: property?.tags ?? null,
    meta_title: str(form.meta_title),
    meta_description: str(form.meta_description),
    focus_keywords: str(form.focus_keywords),
    schema_markup: null,
    slug,
    faq: (() => {
      const valid = faq
        .map(it => ({ question: it.question.trim(), answer: it.answer.trim() }))
        .filter(it => it.question && it.answer);
      return valid.length ? valid : null;
    })(),
    created_at: property?.created_at ?? now,
    updated_at: now,
    property_types: propertyType,
  };
}
