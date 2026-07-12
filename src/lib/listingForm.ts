import type { UserListing, ListingType } from './supabase';

// State của form đăng tin (PostListingPage). Mọi trường là chuỗi vì input HTML
// dùng chuỗi; số/JSON được nén lại lúc submit.
export interface ListingFormState {
  listing_type: ListingType;
  title: string; description: string;
  price: string; price_unit: string; price_label: string;
  price_per_month: string;
  area_sqm: string; address: string; city: string; district: string; ward: string;
  area_id: string; property_type_id: string;
  image_url: string; images: string[];
  video_url: string;
  legal_status: string; bedrooms: string; bathrooms: string; direction: string;
  contact_name: string; contact_phone: string; amenities: string[];
  latitude: string; longitude: string;
  meta_title: string; meta_description: string; focus_keywords: string; schema_markup: string;
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
  };
}
