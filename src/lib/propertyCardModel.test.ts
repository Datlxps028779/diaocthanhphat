import { describe, expect, it } from 'vitest';
import { buildPropertyCardModel, formatPropertyPricePerSqm, UNKNOWN_CARD_POSTER } from './propertyCardModel';

const base = { id: 'p1', title: 'Nhà bán', listing_type: 'mua_ban', price: 340, price_unit: 'triệu', area_sqm: 200 };

describe('public property card model', () => {
  it('preserves fractional sale unit prices', () => {
    expect(formatPropertyPricePerSqm(base)).toBe('≈ 1,7 triệu/m²');
    expect(formatPropertyPricePerSqm({ ...base, price: 0.34, price_unit: 'tỷ' })).toBe('≈ 1,7 triệu/m²');
    expect(formatPropertyPricePerSqm({ ...base, price: 760, area_sqm: 241 })).toBe('≈ 3,2 triệu/m²');
  });
  it.each([null, 0, -1, NaN, Infinity])('rejects invalid area %s', area_sqm => {
    expect(formatPropertyPricePerSqm({ ...base, area_sqm })).toBeNull();
  });
  it('does not divide rental or negotiable prices', () => {
    expect(formatPropertyPricePerSqm({ ...base, listing_type: 'cho_thue' })).toBeNull();
    expect(formatPropertyPricePerSqm({ ...base, price_unit: 'triệu/tháng' })).toBeNull();
    expect(formatPropertyPricePerSqm({ ...base, price: 0 })).toBeNull();
    expect(formatPropertyPricePerSqm({ ...base, listing_type: null })).toBeNull();
  });
  it('never rounds a small positive unit price to zero', () => {
    expect(formatPropertyPricePerSqm({ ...base, price: 1, area_sqm: 1000 })).toBe('≈ 1.000 đ/m²');
  });
  it('renders honest missing fields and never private contact identity', () => {
    const source = { id: 'p1', title: 'Đất', contact_name: 'Private person' };
    const model = buildPropertyCardModel(source);
    expect(model.poster.name).toBe(UNKNOWN_CARD_POSTER);
    expect(model.poster.identified).toBe(false);
    expect(model.areaLabel).toBe('Chưa cung cấp diện tích');
    expect(model.legalLabel).toBe('Chưa cung cấp pháp lý');
    expect(model.postedAt).toBeNull();
    expect(model.images).toEqual([]);
    expect(JSON.stringify(model)).not.toContain('Private person');
  });
  it('requires matching public attribution, not a consultant name', () => {
    const poster = { displayName: 'Nguyễn An', propertyId: 'p1', source: 'published-profile' as const, profileSlug: 'nguyen-an' };
    expect(buildPropertyCardModel(base, poster).poster).toMatchObject({ name: 'Nguyễn An', identified: true, href: '/nguoi-dang-tin/nguyen-an' });
    expect(buildPropertyCardModel(base, { ...poster, propertyId: 'p2' }).poster.identified).toBe(false);
    expect(buildPropertyCardModel(base, { ...poster, displayName: ' ' }).poster.identified).toBe(false);
  });
  it('does not apply room counts to land', () => {
    expect(buildPropertyCardModel({ ...base, property_types: { name: 'Đất nền', slug: 'dat-nen' }, bedrooms: 0, bathrooms: 0 }).roomLabels).toEqual([]);
    expect(buildPropertyCardModel({ ...base, property_types: { name: 'Nhà phố', slug: 'nha-pho' }, bedrooms: 3, bathrooms: 2 }).roomLabels).toEqual(['3 phòng ngủ', '2 phòng tắm']);
  });
  it('uses publication data rather than current time', () => {
    expect(buildPropertyCardModel({ ...base, created_at: '2026-01-02T22:00:00Z' }).postedLabel).toBe('Đăng ngày 02/01/2026');
    expect(buildPropertyCardModel({ ...base, created_at: 'invalid' }).postedAt).toBeNull();
  });
  it('normalizes public media without inventing fallback photography', () => {
    const model = buildPropertyCardModel({ ...base, image_url: 'https://chonhaviet.com/hinh-anh/property-images/a.jpg', images: ['javascript:alert(1)', '/hinh-anh/property-images/a.jpg'] });
    expect(model.images).toEqual(['/hinh-anh/property-images/a.jpg']);
    expect(model.imageCount).toBe(1);
  });
  it('deduplicates administrative labels without removing a city matching a street name', () => {
    expect(buildPropertyCardModel({ ...base, address: 'Đường A, Phường An Phú', ward: 'An Phú', city: 'Bình Dương' }).address).toBe('Đường A, Phường An Phú, Bình Dương');
    expect(buildPropertyCardModel({ ...base, address: 'Đường Huế', city: 'Huế' }).address).toBe('Đường Huế, Huế');
  });
  it('preserves the source address rather than guessing from title', () => {
    expect(buildPropertyCardModel({ ...base, address: '12 Đường A', ward: 'Phường B', district: 'Dĩ An', city: 'Bình Dương' }).address).toBe('12 Đường A, Phường B, Dĩ An, Bình Dương');
  });
});
