// Giá được lưu dưới dạng số theo price_unit (triệu/tỷ), còn form dùng chuỗi đã nhóm
// hàng nghìn để dễ đọc. Không quy đổi đơn vị: 1,500 triệu khác hoàn toàn 1,500 tỷ.
export type ListingPriceSource = {
  listing_type?: string | null;
  price?: number | null;
  price_unit?: string | null;
  price_per_month?: number | null;
  price_label?: string | null;
};

export type EffectiveListingPrice = {
  value: number | null;
  unit: 'triệu' | 'tỷ' | 'triệu/tháng' | null;
  label: string | null;
  source: 'price' | 'price_per_month' | 'price_label' | null;
};

function positiveNumber(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) && value > 0 ? value : null;
}

export function normalizePriceInput(raw: string): string {
  const compact = raw.replace(/[^\d.,]/g, '');
  if (!compact) return '';
  if (compact.includes('.')) {
    const withoutGrouping = compact.replace(/,/g, '');
    const firstDecimal = withoutGrouping.indexOf('.');
    const integer = withoutGrouping.slice(0, firstDecimal).replace(/^0+(?=\d)/, '') || '0';
    const fraction = withoutGrouping.slice(firstDecimal + 1).replace(/\./g, '');
    return `${integer}.${fraction}`;
  }
  const commaParts = compact.split(',');
  if (commaParts.length === 2 && commaParts[1].length <= 2) {
    const integer = commaParts[0].replace(/^0+(?=\d)/, '') || '0';
    return `${integer}.${commaParts[1]}`;
  }
  return compact.replace(/,/g, '').replace(/^0+(?=\d)/, '');
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

function isRental(source: ListingPriceSource): boolean {
  return source.listing_type === 'cho_thue' || (source.price_unit ?? '').toLocaleLowerCase('vi-VN').includes('tháng');
}

function fallbackLabel(source: ListingPriceSource): string | null {
  const label = source.price_label?.trim();
  return label && !/[\d]/.test(label) ? label : null;
}

export function getEffectiveListingPrice(source: ListingPriceSource): EffectiveListingPrice {
  if (isRental(source)) {
    const monthly = positiveNumber(source.price_per_month) ?? positiveNumber(source.price);
    if (monthly != null) {
      return {
        value: monthly,
        unit: 'triệu/tháng',
        label: null,
        source: positiveNumber(source.price_per_month) != null ? 'price_per_month' : 'price',
      };
    }
  } else {
    const value = positiveNumber(source.price);
    if (value != null) {
      const unit = source.price_unit === 'triệu' ? 'triệu' : 'tỷ';
      return { value, unit, label: null, source: 'price' };
    }
  }
  const label = fallbackLabel(source);
  return { value: null, unit: null, label, source: label ? 'price_label' : null };
}

export function formatPropertyPrice(source: ListingPriceSource): string {
  const effective = getEffectiveListingPrice(source);
  if (effective.value != null && effective.unit) return formatListingPrice(effective.value, effective.unit);
  return effective.label ?? 'Giá thỏa thuận';
}

export function formatCompactPropertyPrice(source: ListingPriceSource): string {
  return formatPropertyPrice(source);
}

export function priceToVnd(source: ListingPriceSource): number | null {
  const effective = getEffectiveListingPrice(source);
  if (effective.value == null || effective.unit == null) return null;
  if (effective.unit === 'tỷ') return effective.value * 1_000_000_000;
  return effective.value * 1_000_000;
}
