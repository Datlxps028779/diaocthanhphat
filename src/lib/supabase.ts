import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './env';

// Client browser. LƯU Ý: trong bundle client, Next chỉ inline biến NEXT_PUBLIC_*
// (fallback VITE_* trong env.ts chỉ hiệu lực ở server). Nếu Vercel đặt sai tên
// (VITE_* thay vì NEXT_PUBLIC_*) thì client sẽ rỗng — phải sửa tên trên Vercel.
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error('[Supabase] Thiếu NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ' +
    'lúc build. Kiểm tra Vercel → Settings → Environment Variables rồi Redeploy.');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export type Area = {
  id: string; name: string; description: string | null;
  image_url: string | null; slug: string; order_index: number; created_at: string;
};
export type District = {
  id: string; area_id: string; name: string; slug: string; order_index: number; created_at: string;
};
export type Ward = {
  id: string; district_id: string; name: string; slug: string; order_index: number; created_at: string;
};
export type PropertyType = {
  id: string; name: string; slug: string; icon: string | null; created_at: string;
};
export type ListingType = 'mua_ban' | 'cho_thue';
export type Property = {
  id: string; title: string; description: string | null;
  price: number; price_unit: string; price_label: string | null;
  price_per_month: number | null;
  listing_type: ListingType;
  area_sqm: number | null; address: string | null; city: string; district: string | null; ward: string | null;
  area_id: string | null; district_id: string | null; property_type_id: string | null;
  image_url: string | null; images: string[] | null;
  badge: string | null; badge_color: string | null; legal_status: string | null;
  is_featured: boolean; is_hot: boolean; is_active: boolean; views: number;
  contact_name: string | null; contact_phone: string | null;
  bedrooms: number | null; bathrooms: number | null; floor_count: number | null; floor_number: number | null;
  direction: string | null; road_width: number | null; frontage: number | null;
  amenities: string[] | null; latitude: number | null; longitude: number | null;
  formatted_address: string | null; vr_tour_url: string | null; video_url: string | null;
  contact_zalo: string | null; tags: string[] | null;
  meta_title: string | null; meta_description: string | null;
  focus_keywords: string | null; schema_markup: Record<string, unknown> | null;
  slug: string | null;
  created_at: string; updated_at: string;
  areas?: Area | null; property_types?: PropertyType | null;
};
export type Testimonial = {
  id: string; name: string; location: string | null; content: string;
  rating: number; avatar_url: string | null; is_active: boolean; created_at: string;
};
export type Lead = {
  id: string; full_name: string; phone: string;
  area_interest: string | null; message: string | null;
  property_id: string | null; status: 'new' | 'contacted' | 'closed'; created_at: string;
  source: string | null; note: string | null; assigned_to: string | null; budget: string | null;
  follow_up_at: string | null;
  properties?: Pick<Property, 'id' | 'title'> | null;
};
export type NewsArticle = {
  id: string; title: string; slug: string; excerpt: string | null; content: string | null;
  image_url: string | null; category: string; author: string;
  is_published: boolean; views: number; created_at: string; updated_at: string;
};
export type Project = {
  id: string; name: string; description: string | null;
  location: string | null; city: string | null; area_id: string | null;
  developer: string | null; total_units: number | null; sold_units: number;
  price_from: number | null; price_to: number | null; price_unit: string;
  image_url: string | null; images: string[] | null; phase: string;
  handover_date: string | null; legal_status: string | null; amenities: string[] | null;
  is_featured: boolean; is_active: boolean;
  latitude: number | null; longitude: number | null;
  created_at: string; updated_at: string; areas?: Area | null;
};
export type Profile = {
  id: string; display_name: string | null; phone: string | null;
  avatar_url: string | null; role: 'user' | 'admin'; created_at: string; updated_at: string;
};
export type UserListing = {
  id: string; user_id: string; status: 'pending' | 'approved' | 'rejected' | 'expired';
  reject_reason: string | null; expires_at: string | null;
  title: string; description: string | null;
  price: number; price_unit: string; price_label: string | null;
  listing_type: ListingType;
  price_per_month: number | null;
  area_sqm: number | null; address: string | null; city: string; district: string | null; ward: string | null;
  area_id: string | null; property_type_id: string | null;
  image_url: string | null; images: string[] | null; legal_status: string | null;
  bedrooms: number | null; bathrooms: number | null; direction: string | null;
  contact_name: string | null; contact_phone: string | null;
  amenities: string[] | null; latitude: number | null; longitude: number | null;
  formatted_address: string | null; vr_tour_url: string | null; video_url: string | null;
  contact_zalo: string | null;
  slug: string | null; meta_title: string | null; meta_description: string | null;
  focus_keywords: string | null; schema_markup: Record<string, unknown> | null;
  property_id: string | null;
  created_at: string; updated_at: string;
  areas?: Area | null; property_types?: PropertyType | null;
  profiles?: Pick<Profile, 'display_name' | 'phone'> | null;
};
export type SiteSetting = {
  id: string; key: string; value: string | null; label: string;
  group_name: string; type: string; created_at: string; updated_at: string;
};
export type SiteContent = {
  id: string; section: string; key: string; value: string | null;
  label: string; type: string; order_index: number;
  created_at: string; updated_at: string;
};
export type Banner = {
  id: string; title: string; subtitle: string | null; cta_text: string | null;
  cta_link: string | null; image_url: string | null; bg_color: string;
  position: 'hero' | 'sidebar' | 'footer_cta' | 'listings_top';
  order_index: number; is_active: boolean;
  impressions: number; clicks: number;
  created_at: string; updated_at: string;
};
export type FeaturedSection = {
  id: string; title: string; subtitle: string | null;
  mode: 'auto' | 'manual';
  filter_area_id: string | null; filter_listing_type: string | null;
  filter_property_type_id: string | null; filter_is_hot: boolean; filter_is_featured: boolean;
  auto_sort: 'newest' | 'views' | 'price_asc' | 'price_desc';
  display_count: number; display_style: 'grid' | 'horizontal';
  is_active: boolean; order_index: number;
  created_at: string; updated_at: string;
};
export type FeaturedSectionItem = {
  id: string; section_id: string; property_id: string; order_index: number; created_at: string;
  properties?: Property | null;
};
export type PropertyFavorite = {
  id: string; user_id: string; property_id: string; created_at: string;
  properties?: Property | null;
};
export type UserFavorite = {
  id: string; user_id: string; property_id: string; created_at: string;
  properties?: Property | null;
};
export type Subscriber = {
  id: string; email: string; name: string | null; phone: string | null;
  area_interest: string | null; is_active: boolean; created_at: string;
};

export type PageSection = {
  id: string; label: string; description: string | null; icon: string | null;
  is_visible: boolean; order_index: number; settings: Record<string, unknown>;
  created_at: string; updated_at: string;
};

export type ManagedPage = {
  id: string; slug: string; title: string; description: string | null;
  hero_image: string | null; is_active: boolean; is_system: boolean;
  order_index: number; created_at: string; updated_at: string;
};

export type PageBlock = {
  id: string; page_slug: string; section: string; key: string;
  label: string; type: string; value: string | null;
  order_index: number; created_at: string; updated_at: string;
};

// ─── User Media Library ───────────────────────────────────────────────────────
// Metadata cho ảnh user đã upload vào Storage — hỗ trợ liệt kê, xóa, tái sử dụng
export type UserMedia = {
  id: string;
  user_id: string;
  url: string;
  filename: string;
  folder: string;
  mime_type: string | null;
  size_bytes: number | null;
  width: number | null;
  height: number | null;
  created_at: string;
};

