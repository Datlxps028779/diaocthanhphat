import { describe, it, expect } from 'vitest';
import { evaluatePropertyTypeSeo } from './propertyTypeSeo';
import type { PropertyType } from './supabase';

// Mock data cho property type page integration test
describe('Property Type Page Integration', () => {
  const mockPropertyType: PropertyType = {
    id: 'pt-1',
    name: 'Nhà phố',
    slug: 'nha-pho',
    icon: 'Home',
    created_at: '2024-01-01T00:00:00Z',
  };

  describe('Quality Gate Integration', () => {
    it('should pass quality gate with sufficient data', () => {
      const evaluation = evaluatePropertyTypeSeo({
        propertyType: mockPropertyType,
        activeListings: 10,
        distinctAreas: 3,
        distinctDistricts: 2,
      });

      expect(evaluation.indexable).toBe(true);
      expect(evaluation.robots.index).toBe(true);
      expect(evaluation.robots.follow).toBe(true);
    });

    it('should fail quality gate with insufficient listings but show page', () => {
      const evaluation = evaluatePropertyTypeSeo({
        propertyType: mockPropertyType,
        activeListings: 3,
        distinctAreas: 2,
        distinctDistricts: 1,
      });

      expect(evaluation.indexable).toBe(false);
      expect(evaluation.robots.index).toBe(false);
      expect(evaluation.robots.follow).toBe(true); // Still follow links
    });

    it('should fail quality gate with insufficient geographic diversity', () => {
      const evaluation = evaluatePropertyTypeSeo({
        propertyType: mockPropertyType,
        activeListings: 10,
        distinctAreas: 1,
        distinctDistricts: 1,
      });

      expect(evaluation.indexable).toBe(false);
      expect(evaluation.reasons).toContain('not_enough_distinct_signals');
    });
  });

  describe('Search Visibility Integration', () => {
    it('should generate correct canonical path', () => {
      const path = `/loai-nha-dat/${mockPropertyType.slug}`;
      expect(path).toBe('/loai-nha-dat/nha-pho');
    });

    it('should generate valid source key', () => {
      const sourceKey = `property_type:${mockPropertyType.id}`;
      expect(sourceKey).toMatch(/^property_type:[a-z0-9-]+$/);
    });
  });

  describe('Edge Cases', () => {
    it('should handle property type with special characters in name', () => {
      const specialType: PropertyType = {
        ...mockPropertyType,
        name: 'Đất nền & Đất mẫu',
        slug: 'dat-nen-dat-mau',
      };

      const evaluation = evaluatePropertyTypeSeo({
        propertyType: specialType,
        activeListings: 5,
        distinctAreas: 2,
        distinctDistricts: 1,
      });

      expect(evaluation.indexable).toBe(true);
    });

    it('should handle zero stats gracefully', () => {
      const evaluation = evaluatePropertyTypeSeo({
        propertyType: mockPropertyType,
        activeListings: 0,
        distinctAreas: 0,
        distinctDistricts: 0,
      });

      expect(evaluation.indexable).toBe(false);
      expect(evaluation.robots.follow).toBe(true);
      expect(evaluation.reasons.length).toBeGreaterThan(0);
    });

    it('should handle empty slug', () => {
      const invalidType: PropertyType = {
        ...mockPropertyType,
        slug: '',
      };

      const evaluation = evaluatePropertyTypeSeo({
        propertyType: invalidType,
        activeListings: 10,
        distinctAreas: 3,
        distinctDistricts: 2,
      });

      expect(evaluation.indexable).toBe(false);
      expect(evaluation.reasons).toContain('missing_slug');
    });
  });
});
