import { describe, it, expect } from 'vitest';
import { evaluatePropertyTypeSeo, type PropertyTypeSeoInput } from './propertyTypeSeo';

describe('evaluatePropertyTypeSeo', () => {
  const basePropertyType = {
    id: 'pt1',
    name: 'Nhà phố',
    slug: 'nha-pho',
  };

  it('should be indexable when meeting all criteria', () => {
    const input: PropertyTypeSeoInput = {
      propertyType: basePropertyType,
      activeListings: 10,
      distinctAreas: 3,
      distinctDistricts: 2,
    };

    const result = evaluatePropertyTypeSeo(input);

    expect(result.indexable).toBe(true);
    expect(result.robots.index).toBe(true);
    expect(result.robots.follow).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('should be indexable with enough listings and distinct areas', () => {
    const input: PropertyTypeSeoInput = {
      propertyType: basePropertyType,
      activeListings: 5,
      distinctAreas: 2,
      distinctDistricts: 1,
    };

    const result = evaluatePropertyTypeSeo(input);

    expect(result.indexable).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('should be indexable with enough listings and distinct districts', () => {
    const input: PropertyTypeSeoInput = {
      propertyType: basePropertyType,
      activeListings: 5,
      distinctAreas: 1,
      distinctDistricts: 2,
    };

    const result = evaluatePropertyTypeSeo(input);

    expect(result.indexable).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  it('should not be indexable when not enough listings', () => {
    const input: PropertyTypeSeoInput = {
      propertyType: basePropertyType,
      activeListings: 4,
      distinctAreas: 3,
      distinctDistricts: 2,
    };

    const result = evaluatePropertyTypeSeo(input);

    expect(result.indexable).toBe(false);
    expect(result.robots.index).toBe(false);
    expect(result.robots.follow).toBe(true);
    expect(result.reasons).toContain('not_enough_active_listings');
  });

  it('should not be indexable when not enough distinct signals', () => {
    const input: PropertyTypeSeoInput = {
      propertyType: basePropertyType,
      activeListings: 10,
      distinctAreas: 1,
      distinctDistricts: 1,
    };

    const result = evaluatePropertyTypeSeo(input);

    expect(result.indexable).toBe(false);
    expect(result.reasons).toContain('not_enough_distinct_signals');
  });

  it('should not be indexable when missing slug', () => {
    const input: PropertyTypeSeoInput = {
      propertyType: { ...basePropertyType, slug: '' },
      activeListings: 10,
      distinctAreas: 3,
      distinctDistricts: 2,
    };

    const result = evaluatePropertyTypeSeo(input);

    expect(result.indexable).toBe(false);
    expect(result.reasons).toContain('missing_slug');
  });

  it('should not be indexable when missing name', () => {
    const input: PropertyTypeSeoInput = {
      propertyType: { ...basePropertyType, name: '' },
      activeListings: 10,
      distinctAreas: 3,
      distinctDistricts: 2,
    };

    const result = evaluatePropertyTypeSeo(input);

    expect(result.indexable).toBe(false);
    expect(result.reasons).toContain('missing_name');
  });

  it('should accumulate multiple reasons', () => {
    const input: PropertyTypeSeoInput = {
      propertyType: { ...basePropertyType, slug: '', name: '' },
      activeListings: 2,
      distinctAreas: 1,
      distinctDistricts: 0,
    };

    const result = evaluatePropertyTypeSeo(input);

    expect(result.indexable).toBe(false);
    expect(result.reasons).toContain('missing_slug');
    expect(result.reasons).toContain('missing_name');
    expect(result.reasons).toContain('not_enough_active_listings');
    expect(result.reasons).toContain('not_enough_distinct_signals');
  });

  it('should always allow follow even when not indexable', () => {
    const input: PropertyTypeSeoInput = {
      propertyType: basePropertyType,
      activeListings: 0,
      distinctAreas: 0,
      distinctDistricts: 0,
    };

    const result = evaluatePropertyTypeSeo(input);

    expect(result.indexable).toBe(false);
    expect(result.robots.follow).toBe(true);
  });
});
