import { describe, expect, it } from 'vitest';
import { propertyInsertFromUserListing } from './userListings';
import type { UserListing } from '../supabase';

function listing(overrides: Partial<UserListing> = {}): UserListing {
  return {
    id: 'listing-1', user_id: 'user-1', status: 'pending', reject_reason: null, expires_at: null,
    title: 'Bán nhà Dĩ An', description: 'Mô tả', price: 2.5, price_unit: 'tỷ', price_label: null,
    listing_type: 'mua_ban', price_per_month: null, loan_support: null, area_sqm: 80, address: 'Đường A',
    city: 'Bình Dương', district: 'Dĩ An', ward: 'Dĩ An', neighborhood_slug: 'kdc-di-an',
    area_id: 'area-bd', district_id: 'district-di-an', property_type_id: 'type-nha',
    image_url: 'https://example.test/cover.jpg', images: null, legal_status: null, bedrooms: null, bathrooms: null,
    direction: null, contact_name: 'Nguyễn A', contact_phone: '0900000000', amenities: null,
    latitude: 10.9, longitude: 106.7, formatted_address: null, vr_tour_url: null, video_url: null,
    contact_zalo: null, slug: null, meta_title: null, meta_description: null, focus_keywords: null,
    schema_markup: null, faq: null, property_id: null, created_at: '2026-01-01', updated_at: '2026-01-01',
    ...overrides,
  };
}

describe('propertyInsertFromUserListing', () => {
  it('retains district ID and text geography when approving a listing', () => {
    const input = listing();
    const result = propertyInsertFromUserListing(input);

    expect(result).toMatchObject({
      area_id: 'area-bd', district_id: 'district-di-an', district: 'Dĩ An', ward: 'Dĩ An',
    });
    expect(result.neighborhood_slug).toBe('kdc-di-an');
  });
});
