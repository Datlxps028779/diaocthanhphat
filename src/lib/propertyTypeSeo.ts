import type { PropertyType } from './supabase';

// Ngưỡng tối thiểu để index property type page. Tránh thin content khi type mới
// chưa có đủ listings. Gate này bảo vệ SEO, không chặn route render.
const MIN_PROPERTY_TYPE_LISTINGS_FOR_INDEX = 5;
const MIN_PROPERTY_TYPE_DISTINCT_SIGNALS = 2;

export interface PropertyTypeSeoInput {
  propertyType: Pick<PropertyType, 'id' | 'name' | 'slug'>;
  activeListings: number;
  distinctAreas: number;
  distinctDistricts: number;
}

export interface PropertyTypeSeoEvaluation {
  indexable: boolean;
  robots: {
    index: boolean;
    follow: boolean;
  };
  reasons: string[];
}

/**
 * Đánh giá property type page có đủ dày để index không.
 *
 * Rules:
 * - ≥5 active listings
 * - ≥2 distinct areas HOẶC ≥2 distinct districts
 *
 * Follow luôn true (crawler vẫn đi qua listings).
 */
export function evaluatePropertyTypeSeo(input: PropertyTypeSeoInput): PropertyTypeSeoEvaluation {
  const reasons: string[] = [];

  if (!input.propertyType.slug?.trim()) reasons.push('missing_slug');
  if (!input.propertyType.name?.trim()) reasons.push('missing_name');

  if (input.activeListings < MIN_PROPERTY_TYPE_LISTINGS_FOR_INDEX) {
    reasons.push('not_enough_active_listings');
  }

  const hasDistinctSignals =
    input.distinctAreas >= MIN_PROPERTY_TYPE_DISTINCT_SIGNALS ||
    input.distinctDistricts >= MIN_PROPERTY_TYPE_DISTINCT_SIGNALS;

  if (!hasDistinctSignals) {
    reasons.push('not_enough_distinct_signals');
  }

  const indexable = reasons.length === 0;

  return {
    indexable,
    robots: { index: indexable, follow: true },
    reasons,
  };
}
