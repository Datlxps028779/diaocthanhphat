import { describe, expect, it } from 'vitest';
import { isValidTaxonomyBounds, pickTaxonomyGeo, taxonomyGeoLabel, type TaxonomyGeo } from './taxonomyGeo';

const geo = (
  entity_type: TaxonomyGeo['entity_type'],
  entity_id: string,
  bounds = { south: 10, west: 106, north: 11, east: 107 },
): TaxonomyGeo => ({
  entity_type,
  entity_id,
  bounds,
  center_lat: 10.5,
  center_lng: 106.5,
  geojson: null,
  source: 'test',
  source_year: 2020,
  administrative_vintage: 'legacy_pre_merger',
});

describe('taxonomyGeo', () => {
  it('validates ordered geographic bounds', () => {
    expect(isValidTaxonomyBounds({ south: 10, west: 106, north: 11, east: 107 })).toBe(true);
    expect(isValidTaxonomyBounds({ south: 11, west: 106, north: 10, east: 107 })).toBe(false);
    expect(isValidTaxonomyBounds({ south: 10, west: 106, north: 91, east: 107 })).toBe(false);
  });

  it('prefers ward, then district, then area geometry by selected IDs', () => {
    expect(pickTaxonomyGeo([geo('area', 'a'), geo('district', 'd'), geo('ward', 'w')], {
      areaId: 'a', districtId: 'd', wardId: 'w',
    })?.entity_type).toBe('ward');
    expect(pickTaxonomyGeo([geo('area', 'a'), geo('district', 'd')], {
      areaId: 'a', districtId: 'd', wardId: 'missing',
    })?.entity_type).toBe('district');
    expect(pickTaxonomyGeo([geo('area', 'a')], {
      areaId: 'a', districtId: 'missing',
    })?.entity_type).toBe('area');
  });

  it('accepts an internal center when bounds are not available', () => {
    const centerOnly = geo('ward', 'w', { south: 10, west: 107, north: 10, east: 107 });
    expect(pickTaxonomyGeo([centerOnly], { wardId: 'w' })).toBe(centerOnly);
    expect(taxonomyGeoLabel(centerOnly)).toContain('Đã định tâm');
  });
  it('does not choose geometry for an unrelated entity with the same name', () => {
    expect(pickTaxonomyGeo([geo('ward', 'other-ward')], {
      areaId: 'a', districtId: 'd', wardId: 'selected-ward',
    })).toBeNull();
  });

  it('explains missing and parent-level geometry states', () => {
    expect(taxonomyGeoLabel(null)).toContain('Chưa có');
    expect(taxonomyGeoLabel(geo('district', 'd'))).toContain('cấp xã');
    expect(taxonomyGeoLabel(geo('area', 'a'))).toContain('cấp huyện/xã');
    expect(taxonomyGeoLabel(geo('ward', 'w'))).toContain('xã/phường');
  });
});
