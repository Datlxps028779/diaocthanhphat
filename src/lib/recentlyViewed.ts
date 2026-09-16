// Lịch sử trên thiết bị chỉ là danh sách ứng viên; phải xác minh public trước khi render.
import type { Property } from './supabase';

export const RECENTLY_VIEWED_STORAGE_KEY = 'dtp_recently_viewed';
export const RECENTLY_VIEWED_CHANGED_EVENT = 'dtp:recently-viewed-changed';
export const RECENTLY_VIEWED_MAX = 8;
const KEY = RECENTLY_VIEWED_STORAGE_KEY;

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

function normalize(value: unknown): RecentProperty[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.filter((item): item is RecentProperty => {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim() || seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  }).slice(0, RECENTLY_VIEWED_MAX);
}

function read(): RecentProperty[] {
  if (typeof window === 'undefined') return [];
  try { return normalize(JSON.parse(window.localStorage.getItem(KEY) ?? '[]')); } catch { return []; }
}

function write(list: RecentProperty[]): void {
  if (typeof window === 'undefined') return;
  try {
    const serialized = JSON.stringify(list);
    if (window.localStorage.getItem(KEY) === serialized) return;
    window.localStorage.setItem(KEY, serialized);
    window.dispatchEvent(new CustomEvent(RECENTLY_VIEWED_CHANGED_EVENT));
  } catch { /* Storage có thể bị chặn. */ }
}

export function subscribeRecentlyViewedChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onStorage = (event: StorageEvent) => { if (!event.key || event.key === KEY) listener(); };
  window.addEventListener(RECENTLY_VIEWED_CHANGED_EVENT, listener);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(RECENTLY_VIEWED_CHANGED_EVENT, listener);
    window.removeEventListener('storage', onStorage);
  };
}

export function getRecentlyViewed(excludeId?: string): RecentProperty[] {
  return read().filter(item => item.id !== excludeId);
}

// Giữ các ID được ghi thêm trong lúc yêu cầu xác minh cũ đang chờ.
export function pruneRecentlyViewedUnavailable(requestedIds: string[], availableIds: string[], excludeId?: string): RecentProperty[] {
  const requested = new Set(requestedIds);
  const available = new Set(availableIds);
  const next = read().filter(item => !requested.has(item.id) || (available.has(item.id) && item.id !== excludeId));
  write(next);
  return next;
}

export function pruneRecentlyViewed(validIds: string[], excludeId?: string): RecentProperty[] {
  return pruneRecentlyViewedUnavailable(read().map(item => item.id), validIds, excludeId);
}

export function toRecentProperty(p: Property): RecentProperty {
  return {
    id: p.id, slug: p.slug ?? null, title: p.title,
    image_url: p.image_url, price: p.price, price_unit: p.price_unit,
    price_label: p.price_label, area_sqm: p.area_sqm,
    district: p.district, city: p.city, listing_type: p.listing_type ?? null,
  };
}

export function recordRecentlyViewed(p: Property): void {
  write(normalize([toRecentProperty(p), ...read().filter(item => item.id !== p.id)]));
}
