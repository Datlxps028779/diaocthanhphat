import { describe, it, expect } from 'vitest';
import { listingToFormState } from './listingForm';
import type { UserListing } from './supabase';

// Row DB tối thiểu để dựng state form. Các test override phần cần kiểm.
function makeListing(over: Partial<UserListing> = {}): UserListing {
  return {
    id: 'l1', user_id: 'u1', status: 'approved', reject_reason: null, expires_at: null,
    title: 'Bán nhà', description: null,
    price: 0, price_unit: 'tỷ', price_label: null,
    listing_type: 'mua_ban', price_per_month: null,
    area_sqm: null, address: null, city: '', district: null, ward: null,
    area_id: null, property_type_id: null,
    image_url: null, images: null, legal_status: null,
    bedrooms: null, bathrooms: null, direction: null,
    contact_name: null, contact_phone: null,
    amenities: null, latitude: null, longitude: null,
    formatted_address: null, vr_tour_url: null, video_url: null, contact_zalo: null,
    slug: null, meta_title: null, meta_description: null,
    focus_keywords: null, schema_markup: null,
    property_id: null,
    created_at: '2026-01-01', updated_at: '2026-01-01',
    ...over,
  };
}

describe('listingToFormState — DB row → state form đăng tin', () => {
  it('đổi số thành chuỗi (price, diện tích, phòng, toạ độ)', () => {
    const f = listingToFormState(makeListing({
      price: 2.5, area_sqm: 120, bedrooms: 3, bathrooms: 2,
      latitude: 10.98, longitude: 106.65,
    }));
    expect(f.price).toBe('2.5');
    expect(f.area_sqm).toBe('120');
    expect(f.bedrooms).toBe('3');
    expect(f.bathrooms).toBe('2');
    expect(f.latitude).toBe('10.98');
    expect(f.longitude).toBe('106.65');
  });

  it('đổi null thành chuỗi rỗng cho các trường text', () => {
    const f = listingToFormState(makeListing());
    expect(f.description).toBe('');
    expect(f.price_label).toBe('');
    expect(f.address).toBe('');
    expect(f.district).toBe('');
    expect(f.ward).toBe('');
    expect(f.area_id).toBe('');
    expect(f.property_type_id).toBe('');
    expect(f.legal_status).toBe('');
    expect(f.direction).toBe('');
    expect(f.contact_name).toBe('');
    expect(f.contact_phone).toBe('');
    expect(f.video_url).toBe('');
  });

  it('price 0 (tin cho thuê) → rỗng, price_per_month lấy đúng', () => {
    const f = listingToFormState(makeListing({
      listing_type: 'cho_thue', price: 0, price_per_month: 8,
    }));
    expect(f.price).toBe('');
    expect(f.price_per_month).toBe('8');
    expect(f.listing_type).toBe('cho_thue');
  });

  it('mảng null → [], mảng có phần tử giữ nguyên', () => {
    expect(listingToFormState(makeListing()).images).toEqual([]);
    expect(listingToFormState(makeListing()).amenities).toEqual([]);
    const f = listingToFormState(makeListing({
      images: ['a.jpg', 'b.jpg'], amenities: ['Gần chợ', 'View sông'],
    }));
    expect(f.images).toEqual(['a.jpg', 'b.jpg']);
    expect(f.amenities).toEqual(['Gần chợ', 'View sông']);
  });

  it('schema_markup: object → chuỗi JSON, null → rỗng', () => {
    expect(listingToFormState(makeListing()).schema_markup).toBe('');
    const f = listingToFormState(makeListing({ schema_markup: { '@type': 'Residence' } }));
    expect(JSON.parse(f.schema_markup)).toEqual({ '@type': 'Residence' });
  });

  it('giữ nguyên các trường chuỗi có sẵn (title, city, image_url, SEO)', () => {
    const f = listingToFormState(makeListing({
      title: 'Bán đất Dĩ An', city: 'Bình Dương', image_url: 'cover.jpg',
      meta_title: 'MT', meta_description: 'MD', focus_keywords: 'đất, Dĩ An',
      price_unit: 'triệu',
    }));
    expect(f.title).toBe('Bán đất Dĩ An');
    expect(f.city).toBe('Bình Dương');
    expect(f.image_url).toBe('cover.jpg');
    expect(f.meta_title).toBe('MT');
    expect(f.meta_description).toBe('MD');
    expect(f.focus_keywords).toBe('đất, Dĩ An');
    expect(f.price_unit).toBe('triệu');
  });
});
