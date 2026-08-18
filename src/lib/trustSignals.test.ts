import { describe, it, expect } from 'vitest';
import type { Property } from './supabase';
import { buildTrustSignals, isVerified } from './trustSignals';

function property(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1', title: 'Nhà đẹp', description: null,
    price: 3, price_unit: 'tỷ', price_label: null, price_per_month: null, loan_support: null,
    listing_type: 'mua_ban', area_sqm: 80, address: null, city: 'Bình Dương',
    district: null, ward: null, neighborhood_slug: null, area_id: null, district_id: null, property_type_id: null,
    image_url: null, images: null, badge: null, badge_color: null, legal_status: null,
    is_featured: false, is_hot: false, is_active: true, is_verified: false, views: 0,
    contact_name: null, contact_phone: null, bedrooms: null, bathrooms: null,
    floor_count: null, floor_number: null, direction: null, road_width: null, frontage: null,
    amenities: null, latitude: null, longitude: null, formatted_address: null,
    vr_tour_url: null, video_url: null, contact_zalo: null, tags: null,
    meta_title: null, meta_description: null, focus_keywords: null, schema_markup: null, faq: null,
    slug: 'nha-dep', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

const verified = {
  is_verified: true,
  verification_status: 'verified' as const,
  verification_scope_codes: ['contact_confirmed'],
  verified_at: '2026-08-01T00:00:00.000Z',
  verified_until: '2099-01-01T00:00:00.000Z',
};

describe('isVerified', () => {
  it('fails closed for legacy boolean-only rows', () => {
    expect(isVerified(property({ is_verified: true }))).toBe(false);
    expect(isVerified(property({ is_verified: false }))).toBe(false);
  });

  it('is true only for an eligible P7 verification summary', () => {
    expect(isVerified(property(verified))).toBe(true);
  });
});

describe('buildTrustSignals', () => {
  it('không tín hiệu nào → mảng rỗng', () => {
    expect(buildTrustSignals(property())).toEqual([]);
  });

  it('adds verification only for evidence-backed P7 status', () => {
    const s = buildTrustSignals(property(verified));
    expect(s.map(x => x.key)).toContain('verified');
    expect(s.find(x => x.key === 'verified')?.label).toBe('Hồ sơ đã được kiểm tra');
  });

  it('pháp lý rõ khi legal_status có', () => {
    const s = buildTrustSignals(property({ legal_status: 'Sổ hồng' }));
    expect(s.map(x => x.key)).toContain('legal');
  });

  it('có bản đồ khi đủ lat/lng', () => {
    const s = buildTrustSignals(property({ latitude: 10.9, longitude: 106.6 }));
    expect(s.map(x => x.key)).toContain('map');
  });

  it('không tính map khi thiếu 1 tọa độ', () => {
    const s = buildTrustSignals(property({ latitude: 10.9, longitude: null }));
    expect(s.map(x => x.key)).not.toContain('map');
  });

  it('nhiều hình khi gallery >= 3 ảnh thật', () => {
    const s = buildTrustSignals(property({ image_url: '/a.jpg', images: ['/b.jpg', '/c.jpg'] }));
    expect(s.map(x => x.key)).toContain('photos');
  });

  it('không tính photos khi ít ảnh', () => {
    const s = buildTrustSignals(property({ image_url: '/a.jpg', images: ['/a.jpg'] }));
    expect(s.map(x => x.key)).not.toContain('photos');
  });
});
