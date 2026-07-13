// Khoảng giá & diện tích dùng chung cho hero (LandingPage) và trang danh sách
// (ListingsPage). Tách ra module thuần để: (1) hero + listing dùng CÙNG một bộ
// khoảng → chọn ở hero khớp đúng index ở listing; (2) test được findRangeIndex
// (ánh xạ ngược min/max từ URL → index dropdown).

export interface Range {
  label: string;
  min: number | undefined;
  max: number | undefined;
}

// Mua bán: đơn vị tỷ. Cho thuê: đơn vị triệu/tháng.
export const PRICE_RANGES_SALE: Range[] = [
  { label: 'Tất cả mức giá', min: undefined, max: undefined },
  { label: 'Dưới 500 triệu', min: 0, max: 0.5 },
  { label: '500tr – 1 tỷ', min: 0.5, max: 1 },
  { label: '1 – 2 tỷ', min: 1, max: 2 },
  { label: '2 – 5 tỷ', min: 2, max: 5 },
  { label: '5 – 10 tỷ', min: 5, max: 10 },
  { label: '10 – 20 tỷ', min: 10, max: 20 },
  { label: '20 – 50 tỷ', min: 20, max: 50 },
  { label: 'Trên 50 tỷ', min: 50, max: undefined },
];

export const PRICE_RANGES_RENT: Range[] = [
  { label: 'Tất cả mức giá', min: undefined, max: undefined },
  { label: 'Dưới 3 triệu/tháng', min: 0, max: 3 },
  { label: '3 – 5 triệu/tháng', min: 3, max: 5 },
  { label: '5 – 10 triệu/tháng', min: 5, max: 10 },
  { label: '10 – 20 triệu/tháng', min: 10, max: 20 },
  { label: '20 – 50 triệu/tháng', min: 20, max: 50 },
  { label: 'Trên 50 triệu/tháng', min: 50, max: undefined },
];

export const AREA_RANGES: Range[] = [
  { label: 'Tất cả diện tích', min: undefined, max: undefined },
  { label: 'Dưới 50 m²', min: 0, max: 50 },
  { label: '50 – 100 m²', min: 50, max: 100 },
  { label: '100 – 200 m²', min: 100, max: 200 },
  { label: '200 – 500 m²', min: 200, max: 500 },
  { label: '500m² – 1.000m²', min: 500, max: 1000 },
  { label: 'Trên 1.000 m²', min: 1000, max: undefined },
];

// Ánh xạ ngược: cho min/max (đọc từ URL / initialFilters) → index khoảng khớp.
// Trả 0 (Tất cả) nếu không có giá trị hoặc không khớp khoảng nào — an toàn để
// dùng thẳng làm state ban đầu của dropdown.
export function findRangeIndex(ranges: Range[], min: number | undefined, max: number | undefined): number {
  if (min == null && max == null) return 0;
  const idx = ranges.findIndex(r => r.min === min && r.max === max);
  return idx >= 0 ? idx : 0;
}
