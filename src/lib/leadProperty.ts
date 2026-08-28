// Helper thuần cho việc nối lead ↔ BĐS quan tâm (dùng ở PropertyPicker).
import { formatPriceInput, formatPropertyPrice } from './listingPrice';
// Tách khỏi component để test được nhãn hiển thị mà không cần render.

export interface PropertyOption {
  id: string;
  title: string;
  price: number;
  price_unit: string;
  price_label: string | null;
  price_per_month?: number | null;
  listing_type?: string | null;
  area_sqm: number | null;
}

export function priceText(p: Pick<PropertyOption, 'price' | 'price_unit' | 'price_label' | 'price_per_month' | 'listing_type'>): string {
  const label = p.price_label?.trim();
  if (label && !/[\d]/.test(label)) return label;
  if (p.price > 0 && !p.price_unit) return formatPriceInput(String(p.price));
  const value = formatPropertyPrice(p);
  return value === 'Giá thỏa thuận' ? '' : value;
}

// Dòng phụ gọn cho option: giá · diện tích. Bỏ phần rỗng, ngăn bằng " · ".
export function propertySubtitle(p: PropertyOption): string {
  const parts: string[] = [];
  const price = priceText(p);
  if (price) parts.push(price);
  if (p.area_sqm && p.area_sqm > 0) parts.push(`${p.area_sqm} m²`);
  return parts.join(' · ');
}

// Lọc theo từ khóa (không dấu phân biệt hoa thường) — client-side sau khi đã tải.
export function filterProperties(list: PropertyOption[], keyword: string): PropertyOption[] {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return list;
  return list.filter(p => p.title.toLowerCase().includes(kw));
}
