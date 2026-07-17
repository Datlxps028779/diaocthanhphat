import { describe, expect, it } from 'vitest';
import { classifyPropertySegment, clearIncompatibleSpecValues, getCompatibleSpecFields } from './propertySpecs';

describe('classifyPropertySegment', () => {
  it('classifies existing land types', () => {
    expect(classifyPropertySegment({ name: 'Đất nền', slug: 'dat-nen' })).toBe('land');
    expect(classifyPropertySegment({ name: 'Đất dự án', slug: 'dat-du-an' })).toBe('land');
    expect(classifyPropertySegment({ name: 'Khu công nghiệp', slug: 'khu-cong-nghiep' })).toBe('land');
  });

  it('classifies existing house and apartment-like types', () => {
    expect(classifyPropertySegment({ name: 'Nhà phố', slug: 'nha-pho' })).toBe('house');
    expect(classifyPropertySegment({ name: 'Biệt thự', slug: 'biet-thu' })).toBe('house');
    expect(classifyPropertySegment({ name: 'Nhà ở xã hội', slug: 'nha-o-xa-hoi' })).toBe('apartment');
  });

  it('classifies rental row and apartment types before generic house', () => {
    expect(classifyPropertySegment({ name: 'Dãy trọ', slug: 'day-tro' })).toBe('rental_row');
    expect(classifyPropertySegment({ name: 'Nhà trọ', slug: 'nha-tro' })).toBe('rental_row');
    expect(classifyPropertySegment({ name: 'Chung cư', slug: 'chung-cu' })).toBe('apartment');
    expect(classifyPropertySegment({ name: 'Căn hộ', slug: 'can-ho' })).toBe('apartment');
  });
});

describe('getCompatibleSpecFields', () => {
  it('keeps land fields free from bedroom and bathroom semantics', () => {
    const fields = getCompatibleSpecFields({ name: 'Đất nền', slug: 'dat-nen' }, 'admin_property');
    expect(fields).toContain('frontage');
    expect(fields).toContain('road_width');
    expect(fields).not.toContain('bedrooms');
    expect(fields).not.toContain('bathrooms');
  });

  it('keeps apartment fields free from frontage, road width, and floor count', () => {
    const fields = getCompatibleSpecFields({ name: 'Chung cư', slug: 'chung-cu' }, 'admin_property');
    expect(fields).toContain('bedrooms');
    expect(fields).toContain('bathrooms');
    expect(fields).toContain('floor_number');
    expect(fields).not.toContain('frontage');
    expect(fields).not.toContain('road_width');
    expect(fields).not.toContain('floor_count');
  });

  it('includes full house specs for admin properties', () => {
    const fields = getCompatibleSpecFields({ name: 'Nhà phố', slug: 'nha-pho' }, 'admin_property');
    expect(fields).toEqual(['area_sqm', 'bedrooms', 'bathrooms', 'floor_count', 'frontage', 'road_width', 'legal_status', 'direction']);
  });

  it('filters admin-only specs from user listings', () => {
    const fields = getCompatibleSpecFields({ name: 'Nhà phố', slug: 'nha-pho' }, 'user_listing');
    expect(fields).toEqual(['area_sqm', 'bedrooms', 'bathrooms', 'legal_status', 'direction']);
  });
});

describe('clearIncompatibleSpecValues', () => {
  it('clears stale house fields when switching to land', () => {
    const values = clearIncompatibleSpecValues({
      area_sqm: '120', bedrooms: '3', bathrooms: '2', floor_count: '3', frontage: '5', road_width: '8', legal_status: 'Sổ hồng', direction: 'Đông',
    }, { name: 'Đất nền', slug: 'dat-nen' }, 'admin_property');

    expect(values).toMatchObject({
      area_sqm: '120', bedrooms: '', bathrooms: '', floor_count: '', frontage: '5', road_width: '8', legal_status: 'Sổ hồng', direction: 'Đông',
    });
  });

  it('clears land frontage and road width when switching to apartment', () => {
    const values = clearIncompatibleSpecValues({
      area_sqm: 70, bedrooms: 2, bathrooms: 2, floor_number: 12, frontage: 6, road_width: 12, floor_count: 20,
    }, { name: 'Chung cư', slug: 'chung-cu' }, 'admin_property');

    expect(values).toMatchObject({
      area_sqm: 70, bedrooms: 2, bathrooms: 2, floor_number: 12, frontage: null, road_width: null, floor_count: null,
    });
  });
});
