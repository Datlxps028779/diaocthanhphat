import { describe, expect, it } from 'vitest';
import { formatListingPrice, formatPriceInput, normalizePriceInput, parsePriceInput, priceInputFromNumber } from './listingPrice';

describe('listing price input', () => {
  it('groups digits while retaining a decimal value', () => {
    expect(formatPriceInput('1500000')).toBe('1,500,000');
    expect(formatPriceInput('1250000.50')).toBe('1,250,000.50');
  });

  it('accepts previously formatted values and removes non-numeric characters', () => {
    expect(normalizePriceInput('1,500,000.5 tỷ')).toBe('1500000.5');
    expect(parsePriceInput('1,500,000.5')).toBe(1500000.5);
  });

  it('treats commas as grouping separators consistently with the UI', () => {
    expect(parsePriceInput('1,5')).toBe(15);
    expect(formatPriceInput('1,5')).toBe('15');
  });

  it('rejects zero, empty, and incomplete decimal input for payload validation', () => {
    expect(parsePriceInput('')).toBeNull();
    expect(parsePriceInput('0')).toBeNull();
    expect(parsePriceInput('1.')).toBeNull();
  });

  it('round-trips persisted numeric values and preserves the selected unit in display', () => {
    expect(priceInputFromNumber(1500)).toBe('1,500');
    expect(formatListingPrice(1500, 'triệu')).toBe('1,500 triệu');
    expect(formatListingPrice(1.5, 'tỷ')).toBe('1.5 tỷ');
  });
});
