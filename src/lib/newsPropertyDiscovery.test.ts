import { describe, expect, it } from 'vitest';
import type { Property } from './supabase';
import { newsPropertyReasonLabel, rankNewsProperties } from './newsPropertyDiscovery';

function property(id: string, overrides: Partial<Property> = {}): Property {
  return {
    id, title: id, description: null, price: 1, price_unit: 'tỷ', price_label: null,
    price_per_month: null, loan_support: null, listing_type: 'mua_ban', area_sqm: null,
    address: null, city: 'Bình Dương', district: 'Dĩ An', ward: null, area_id: 'bd', district_id: 'di-an', property_type_id: null,
    neighborhood_slug: null, image_url: null, images: null, badge: null, badge_color: null,
    legal_status: null, is_featured: false, is_hot: false, is_active: true, is_verified: false,
    views: 0, contact_name: null, contact_phone: null, bedrooms: null, bathrooms: null,
    floor_count: null, floor_number: null, direction: null, road_width: null, frontage: null,
    amenities: null, latitude: null, longitude: null, formatted_address: null, vr_tour_url: null,
    video_url: null, contact_zalo: null, tags: null, meta_title: null, meta_description: null,
    focus_keywords: null, schema_markup: null, slug: id, faq: null, created_at: `2026-08-${id}`, updated_at: `2026-08-${id}`,
    ...overrides,
  };
}

describe('news property discovery', () => {
  it('keeps only active properties in the selected area and ranks the strongest structured relation first', () => {
    const result = rankNewsProperties([
      property('area', { district_id: null, created_at: '2026-08-03' }),
      property('district', { created_at: '2026-08-02' }),
      property('neighborhood', { neighborhood_slug: 'song-than', created_at: '2026-08-01' }),
      property('inactive', { is_active: false }),
      property('other-area', { area_id: 'bp' }),
    ], { areaId: 'bd', districtId: 'di-an', neighborhoodSlug: 'song-than' });

    expect(result.map(item => [item.property.id, item.reason])).toEqual([
      ['neighborhood', 'same_neighborhood'],
      ['district', 'same_district'],
    ]);
  });

  it('matches wards only by the selected taxonomy ward name', () => {
    const result = rankNewsProperties([
      property('same-ward', { ward: '  An   Phú ', district_id: 'di-an' }),
      property('other-ward', { ward: 'An Phú', district_id: 'another-district' }),
    ], { areaId: 'bd', districtId: 'di-an', wardName: 'An Phú' });
    expect(result.map(item => [item.property.id, item.reason])).toEqual([
      ['same-ward', 'same_ward'],
      ['other-ward', 'same_area'],
    ]);
  });

  it('uses deterministic created_at and ID tie-breakers', () => {
    const result = rankNewsProperties([
      property('b', { created_at: '2026-08-03' }),
      property('a', { created_at: '2026-08-03' }),
      property('c', { created_at: '2026-08-04' }),
    ], { areaId: 'bd' });
    expect(result.map(item => item.property.id)).toEqual(['c', 'a', 'b']);
  });

  it('does not guess a scope without a structured area ID', () => {
    expect(rankNewsProperties([property('a')], { areaId: '' })).toEqual([]);
  });

  it('returns factual reason labels only', () => {
    expect(newsPropertyReasonLabel('same_neighborhood')).toBe('Cùng khu dân cư');
    expect(newsPropertyReasonLabel('same_ward')).toBe('Cùng phường/xã');
    expect(newsPropertyReasonLabel('same_district')).toBe('Cùng quận/huyện');
    expect(newsPropertyReasonLabel('same_area')).toBe('Cùng tỉnh/thành');
  });
});
