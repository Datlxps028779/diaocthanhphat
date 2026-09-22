import { describe, expect, it } from 'vitest';
import type { Property } from './supabase';
import { buildLocalityGroups, getLocalityGroupKey, localityGroupIntersectsBounds, localityGroupPropertyFilters } from './localityGroupModel';

const property = (overrides: Partial<Property> = {}): Property => ({
  id: 'p1', title: 'Tin', description: null, price: 1, price_unit: 'tỷ', price_label: null, price_per_month: null, loan_support: null,
  listing_type: 'mua_ban', area_sqm: 80, address: null, city: 'Bình Dương', district: 'Thuận An', ward: 'An Phú', area_id: 'area-1', district_id: 'district-1', ward_id: 'ward-1', property_type_id: null, neighborhood_slug: null,
  image_url: null, images: null, badge: null, badge_color: null, legal_status: null, is_featured: false, is_hot: false, is_active: true, is_verified: false, views: 0,
  contact_name: null, contact_phone: null, bedrooms: null, bathrooms: null, floor_count: null, floor_number: null, direction: null, road_width: null, frontage: null, amenities: null, latitude: 10.8, longitude: 106.7, formatted_address: null, vr_tour_url: null, video_url: null, contact_zalo: null, tags: null,
  meta_title: null, meta_description: null, focus_keywords: null, schema_markup: null, slug: null, faq: null, created_at: '', updated_at: '', ...overrides,
});

describe('locality group model', () => {
  it('uses stable taxonomy IDs and falls back by geography level', () => {
    expect(getLocalityGroupKey(property())).toBe('ward:ward-1');
    expect(getLocalityGroupKey(property({ ward_id: null, ward: null }))).toBe('district:district-1');
    expect(getLocalityGroupKey(property({ ward_id: null, ward: null, district_id: null, district: null }), 'area-1')).toBe('area:area-1');
  });

  it('counts the complete map dataset and preserves property IDs', () => {
    const groups = buildLocalityGroups([
      property({ id: 'p1', latitude: 10.8, longitude: 106.7 }),
      property({ id: 'p2', latitude: 10.9, longitude: 106.8 }),
      property({ id: 'p3', ward_id: 'ward-2', ward: 'Lái Thiêu', latitude: 10.7, longitude: 106.6 }),
    ]);
    expect(groups.map(group => [group.key, group.count])).toEqual([['ward:ward-1', 2], ['ward:ward-2', 1]]);
    expect(groups[0].propertyIds).toEqual(['p1', 'p2']);
    expect(groups[0].center).toEqual({ latitude: 10.85, longitude: 106.75 });
  });

  it('queries the entire selected ward or district by taxonomy ID without stale name filters', () => {
    const [ward, district, area] = buildLocalityGroups([
      property(),
      property({ id: 'p2', ward_id: null, ward: null }),
      property({ id: 'p3', district_id: null, district: null, ward_id: null, ward: null }),
    ]);
    const base = { areaId: 'area-1', listingType: 'mua_ban', district: 'Thuận An', ward: 'An Phú', minArea: 50, page: 3, limit: 16 };
    expect(localityGroupPropertyFilters(base, ward)).toMatchObject({ areaId: 'area-1', districtId: 'district-1', wardId: 'ward-1', minArea: 50, district: undefined, ward: undefined, page: undefined, limit: undefined });
    expect(localityGroupPropertyFilters(base, district)).toBeNull();
    expect(localityGroupPropertyFilters(base, area)).toBeNull();
  });

  it('checks group bounds against map viewport', () => {
    const group = buildLocalityGroups([property()])[0];
    expect(localityGroupIntersectsBounds(group, { north: 11, south: 10, east: 107, west: 106 })).toBe(true);
    expect(localityGroupIntersectsBounds(group, { north: 10, south: 9, east: 107, west: 106 })).toBe(false);
  });
});
