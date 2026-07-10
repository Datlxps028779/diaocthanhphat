// Lịch sử BĐS đã xem — lưu localStorage (không cần đăng nhập, không cần DB).
// Lưu subset đủ để render card + link, tránh phải fetch lại khi hiển thị.
import type { Property } from './supabase';

const KEY = 'dtp_recently_viewed';
const MAX = 8;

export interface RecentProperty {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  price: number;
  price_unit: string;
  price_label: string | null;
  area_sqm: number | null;
  district: string | null;
  city: string;
  listing_type: string | null;
}

function read(): RecentProperty[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentProperty[]) : [];
  } catch {
    return [];
  }
}

export function getRecentlyViewed(excludeId?: string): RecentProperty[] {
  const list = read();
  return excludeId ? list.filter((p) => p.id !== excludeId) : list;
}

// Ghi nhận 1 BĐS vừa xem: đưa lên đầu, khử trùng, giới hạn MAX mục.
export function recordRecentlyViewed(p: Property): void {
  if (typeof window === 'undefined') return;
  const entry: RecentProperty = {
    id: p.id, slug: p.slug ?? null, title: p.title,
    image_url: p.image_url, price: p.price, price_unit: p.price_unit,
    price_label: p.price_label, area_sqm: p.area_sqm,
    district: p.district, city: p.city, listing_type: p.listing_type ?? null,
  };
  const next = [entry, ...read().filter((x) => x.id !== p.id)].slice(0, MAX);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // localStorage đầy hoặc bị chặn (private mode) → bỏ qua, không phải lỗi nghiêm trọng.
  }
}
