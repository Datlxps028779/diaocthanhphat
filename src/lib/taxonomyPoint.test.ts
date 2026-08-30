import { describe, expect, it } from 'vitest';
import { canConfirmTaxonomyCandidate, findExactTaxonomyGeo, geoJsonCoversPoint, normalizePersistedTaxonomyPoint, validatePointForWard } from './taxonomyPoint';
import type { TaxonomyGeo } from './taxonomyGeo';

const polygon: TaxonomyGeo = {
  entity_type: 'ward',
  entity_id: 'ward-a',
  bounds: { south: 0, west: 0, north: 10, east: 10 },
  center_lat: 5,
  center_lng: 5,
  geojson: {
    type: 'Polygon',
    coordinates: [
      [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]],
      [[4, 4], [6, 4], [6, 6], [4, 6], [4, 4]],
    ],
  },
  source: 'test',
  source_year: 2023,
  administrative_vintage: 'legacy_pre_merger',
};

describe('geoJsonCoversPoint', () => {
  it('accepts points inside a polygon and on its boundary', () => {
    expect(geoJsonCoversPoint(polygon.geojson, { lat: 2, lng: 2 })).toBe(true);
    expect(geoJsonCoversPoint(polygon.geojson, { lat: 0, lng: 5 })).toBe(true);
  });

  it('rejects points outside and inside polygon holes', () => {
    expect(geoJsonCoversPoint(polygon.geojson, { lat: 12, lng: 2 })).toBe(false);
    expect(geoJsonCoversPoint(polygon.geojson, { lat: 5, lng: 5 })).toBe(false);
  });

  it('supports multipolygons', () => {
    const geojson = {
      type: 'MultiPolygon',
      coordinates: [
        [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]],
        [[[8, 8], [10, 8], [10, 10], [8, 10], [8, 8]]],
      ],
    };
    expect(geoJsonCoversPoint(geojson, { lat: 9, lng: 9 })).toBe(true);
    expect(geoJsonCoversPoint(geojson, { lat: 5, lng: 5 })).toBe(false);
  });
});

describe('validatePointForWard', () => {
  it('requires an exact ward polygon, not district or bounds-only fallback', () => {
    expect(validatePointForWard({ lat: 2, lng: 2 }, '', polygon)).toMatchObject({ valid: false, code: 'missing_selection' });
    expect(validatePointForWard({ lat: 2, lng: 2 }, 'ward-a', { ...polygon, geojson: null })).toMatchObject({ valid: false, code: 'missing_geometry' });
    expect(validatePointForWard({ lat: 2, lng: 2 }, 'ward-a', { ...polygon, entity_type: 'district' })).toMatchObject({ valid: false, code: 'missing_geometry' });
  });

  it('rejects coordinates outside the selected ward and accepts coordinates inside it', () => {
    expect(validatePointForWard({ lat: 20, lng: 20 }, 'ward-a', polygon, 'An Phú')).toMatchObject({ valid: false, code: 'outside' });
    expect(validatePointForWard({ lat: 2, lng: 2 }, 'ward-a', polygon, 'An Phú')).toEqual({ valid: true });
  });
});

describe('canConfirmTaxonomyCandidate', () => {
  it('normalizes the exact six-decimal point that will be persisted', () => {
    expect(normalizePersistedTaxonomyPoint({ lat: 10.1234567, lng: 106.7654324 }))
      .toEqual({ lat: 10.123457, lng: 106.765432 });
  });

  it('keeps geocoder mismatches locked until the user moves the candidate', () => {
    expect(canConfirmTaxonomyCandidate({ valid: true }, true)).toBe(false);
    expect(canConfirmTaxonomyCandidate({ valid: true }, false)).toBe(true);
    expect(canConfirmTaxonomyCandidate({ valid: false, code: 'outside', message: 'outside' }, false)).toBe(false);
  });
});

describe('findExactTaxonomyGeo', () => {
  it('does not return a parent fallback for a missing ward geometry', () => {
    const district = { ...polygon, entity_type: 'district' as const, entity_id: 'district-a' };
    expect(findExactTaxonomyGeo([district], 'ward', 'ward-a')).toBeNull();
    expect(findExactTaxonomyGeo([district, polygon], 'ward', 'ward-a')).toBe(polygon);
  });
});
