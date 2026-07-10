// So sánh BĐS — lưu danh sách chọn để đối chiếu vào localStorage (không cần đăng
// nhập/DB). Giới hạn 3 mục (vừa màn hình bảng so sánh). Phát sự kiện để header/nút
// cập nhật số lượng ngay khi thay đổi trong cùng tab.
import type { Property } from './supabase';

const KEY = 'dtp_compare';
const MAX = 3;
export const COMPARE_EVENT = 'dtp_compare_changed';

export interface CompareProperty {
  id: string;
  slug: string | null;
  title: string;
  image_url: string | null;
  price: number;
  price_unit: string;
  price_label: string | null;
  area_sqm: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  direction: string | null;
  legal_status: string | null;
  district: string | null;
  city: string;
  listing_type: string | null;
}

function read(): CompareProperty[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CompareProperty[]) : [];
  } catch {
    return [];
  }
}

function write(list: CompareProperty[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list));
    window.dispatchEvent(new Event(COMPARE_EVENT));
  } catch {
    // localStorage đầy/bị chặn → bỏ qua.
  }
}

export function getCompareList(): CompareProperty[] {
  return read();
}

export function isInCompare(id: string): boolean {
  return read().some((p) => p.id === id);
}

// Bật/tắt 1 BĐS khỏi danh sách so sánh. Trả về trạng thái mới (true=đang có).
// Nếu đã đầy MAX và item chưa có → không thêm, trả về false.
export function toggleCompare(p: Property): { inList: boolean; full: boolean } {
  const list = read();
  const exists = list.some((x) => x.id === p.id);
  if (exists) {
    write(list.filter((x) => x.id !== p.id));
    return { inList: false, full: false };
  }
  if (list.length >= MAX) {
    return { inList: false, full: true };
  }
  const entry: CompareProperty = {
    id: p.id, slug: p.slug ?? null, title: p.title,
    image_url: p.image_url, price: p.price, price_unit: p.price_unit,
    price_label: p.price_label, area_sqm: p.area_sqm,
    bedrooms: p.bedrooms, bathrooms: p.bathrooms, direction: p.direction,
    legal_status: p.legal_status, district: p.district, city: p.city,
    listing_type: p.listing_type ?? null,
  };
  write([...list, entry]);
  return { inList: true, full: false };
}

export function removeFromCompare(id: string): void {
  write(read().filter((p) => p.id !== id));
}

export function clearCompare(): void {
  write([]);
}

export const COMPARE_MAX = MAX;
