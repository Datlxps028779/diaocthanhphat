import { describe, expect, it } from 'vitest';
import { formatFinancingAmount, formatListingPrice, formatPriceInput, formatPropertyPrice, getEffectiveListingPrice, normalizePriceInput, parsePriceInput, priceInputFromNumber, priceToVnd, subtractListingPriceValues } from './listingPrice';

describe('listing price input', () => {
  it('groups digits while retaining a decimal value', () => {
    expect(formatPriceInput('1500000')).toBe('1,500,000');
    expect(formatPriceInput('1250000.50')).toBe('1,250,000.50');
  });

  it('accepts previously formatted values and removes non-numeric characters', () => {
    expect(normalizePriceInput('1,500,000.5 tỷ')).toBe('1500000.5');
    expect(parsePriceInput('1,500,000.5')).toBe(1500000.5);
  });

  it('treats a short comma fraction as a decimal and three digits as grouping', () => {
    expect(parsePriceInput('1,5')).toBe(1.5);
    expect(formatPriceInput('1,5')).toBe('1.5');
    expect(parsePriceInput('1,500')).toBe(1500);
  });

  it('formats effective sale and rental prices from structured fields', () => {
    expect(formatPropertyPrice({ listing_type: 'mua_ban', price: 2.3, price_unit: 'tỷ', price_label: '2 tỷ' })).toBe('2.3 tỷ');
    expect(formatPropertyPrice({ listing_type: 'mua_ban', price: 690, price_unit: 'triệu' })).toBe('690 triệu');
    expect(formatPropertyPrice({ listing_type: 'cho_thue', price: 0, price_per_month: 8, price_unit: 'triệu/tháng' })).toBe('8 triệu/tháng');
    expect(formatPropertyPrice({ listing_type: 'cho_thue', price: 6, price_per_month: null, price_unit: 'triệu/tháng' })).toBe('6 triệu/tháng');
    expect(formatPropertyPrice({ listing_type: 'mua_ban', price: null, price_label: 'Thỏa thuận' })).toBe('Thỏa thuận');
  });

  it('converts effective prices to VND without confusing the display unit', () => {
    expect(priceToVnd({ listing_type: 'mua_ban', price: 2.3, price_unit: 'tỷ' })).toBe(2300000000);
    expect(priceToVnd({ listing_type: 'cho_thue', price: 0, price_per_month: 8, price_unit: 'triệu/tháng' })).toBe(8000000);
    expect(getEffectiveListingPrice({ listing_type: 'cho_thue', price: 0, price_per_month: 8, price_unit: 'triệu/tháng' }).source).toBe('price_per_month');
  });
  it('rejects zero, empty, and incomplete decimal input for payload validation', () => {
    expect(parsePriceInput('')).toBeNull();
    expect(parsePriceInput('0')).toBeNull();
    expect(parsePriceInput('1.')).toBeNull();
  });

  it('subtracts decimal listing prices without binary floating artifacts', () => {
    expect(subtractListingPriceValues(1.1, 0.77)).toBe(0.33);
    expect(formatListingPrice(subtractListingPriceValues(1.1, 0.77), 'tỷ')).toBe('0.33 tỷ');
  });

  it('hiển thị khoản vay dưới một tỷ bằng triệu cho trực quan', () => {
    expect(formatFinancingAmount(0.7, 'tỷ')).toBe('700 triệu');
    expect(formatFinancingAmount(subtractListingPriceValues(1.1, 0.7), 'tỷ')).toBe('400 triệu');
    expect(formatFinancingAmount(1.1, 'tỷ')).toBe('1.1 tỷ');
    expect(formatFinancingAmount(700, 'triệu')).toBe('700 triệu');
  });

  it('round-trips persisted numeric values and preserves the selected unit in display', () => {
    expect(priceInputFromNumber(1500)).toBe('1,500');
    expect(formatListingPrice(1500, 'triệu')).toBe('1,500 triệu');
    expect(formatListingPrice(1.5, 'tỷ')).toBe('1.5 tỷ');
  });
});
