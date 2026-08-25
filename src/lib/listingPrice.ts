// Giá được lưu dưới dạng số theo price_unit (triệu/tỷ), còn form dùng chuỗi đã nhóm
// hàng nghìn để dễ đọc. Không quy đổi đơn vị: 1,500 triệu khác hoàn toàn 1,500 tỷ.
export function normalizePriceInput(raw: string): string {
  const compact = raw.replace(/[^\d.,]/g, '');
  // Dấu phẩy được form sinh ra để nhóm nghìn. Dấu chấm là dấu thập phân
  // tương thích input số hiện tại; không tự đoán 1,5 vì "1,500" là giá phổ biến.
  const withoutGrouping = compact.replace(/,/g, '');
  const firstDecimal = withoutGrouping.indexOf('.');
  if (firstDecimal < 0) return withoutGrouping.replace(/^0+(?=\d)/, '');
  const integer = withoutGrouping.slice(0, firstDecimal).replace(/^0+(?=\d)/, '') || '0';
  const fraction = withoutGrouping.slice(firstDecimal + 1).replace(/\./g, '');
  return `${integer}.${fraction}`;
}

export function formatPriceInput(raw: string): string {
  const normalized = normalizePriceInput(raw);
  if (!normalized) return '';
  const [integer, fraction] = normalized.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return fraction === undefined ? grouped : `${grouped}.${fraction}`;
}

export function parsePriceInput(raw: string): number | null {
  const normalized = normalizePriceInput(raw);
  if (!normalized || normalized.endsWith('.')) return null;
  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

export function priceInputFromNumber(value: number | null | undefined): string {
  return value && Number.isFinite(value) && value > 0 ? formatPriceInput(String(value)) : '';
}

export function formatListingPrice(value: number | null | undefined, unit: string, suffix = ''): string {
  if (!value || !Number.isFinite(value)) return '';
  return `${formatPriceInput(String(value))} ${unit}${suffix}`.trim();
}
