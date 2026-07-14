// Helper thuần cho việc nối lead ↔ BĐS quan tâm (dùng ở PropertyPicker).
// Tách khỏi component để test được nhãn hiển thị mà không cần render.

export interface PropertyOption {
  id: string;
  title: string;
  price: number;
  price_unit: string;
  price_label: string | null;
  area_sqm: number | null;
}

// Nhãn giá: ưu tiên price_label (đã format sẵn ở CMS, vd "Thỏa thuận"),
// else ghép số + đơn vị. price<=0 và không có label → rỗng (tránh "0 tỷ").
export function priceText(p: Pick<PropertyOption, 'price' | 'price_unit' | 'price_label'>): string {
  if (p.price_label && p.price_label.trim()) return p.price_label.trim();
  if (p.price > 0) return `${p.price} ${p.price_unit || ''}`.trim();
  return '';
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
