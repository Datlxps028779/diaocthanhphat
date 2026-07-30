import { describe, it, expect } from 'vitest';
import type { Area, Property } from './supabase';
import {
  MIN_AREA_LISTINGS_FOR_INDEX,
  evaluateAreaSeo,
  areaSummaryFromData,
  buildAreaMetadata,
  buildAreaCollectionJsonLd,
  buildAreaFaq,
} from './areaSeo';
import type { PriceStat } from './supabase';

const area: Area = {
  id: 'area-1',
  name: 'Bình Dương',
  slug: 'binh-duong',
  description: 'Bình Dương là thị trường bất động sản công nghiệp và đô thị phát triển mạnh.',
  image_url: null,
  order_index: 1,
  created_at: '2026-01-01T00:00:00.000Z',
};

function property(id: string, typeId = 'type-a', district = 'Thủ Dầu Một'): Property {
  return {
    id,
    title: `Nhà đất ${id}`,
    description: null,
    price: 2,
    price_unit: 'tỷ',
    price_label: null,
    price_per_month: null,
    loan_support: null,
    listing_type: 'mua_ban',
    area_sqm: 80,
    address: null,
    city: 'Bình Dương',
    district,
    ward: null,
    neighborhood_slug: null,
    area_id: area.id,
    district_id: null,
    property_type_id: typeId,
    image_url: null,
    images: null,
    badge: null,
    badge_color: null,
    legal_status: null,
    is_featured: false,
    is_hot: false,
    is_active: true,
    is_verified: false,
    views: 0,
    contact_name: null,
    contact_phone: null,
    bedrooms: null,
    bathrooms: null,
    floor_count: null,
    floor_number: null,
    direction: null,
    road_width: null,
    frontage: null,
    amenities: null,
    latitude: null,
    longitude: null,
    formatted_address: null,
    vr_tour_url: null,
    video_url: null,
    contact_zalo: null,
    tags: null,
    meta_title: null,
    meta_description: null,
    focus_keywords: null,
    schema_markup: null,
    faq: null,
    slug: `nha-dat-${id}`,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  };
}

describe('evaluateAreaSeo', () => {
  it('noindex khi thiếu inventory đủ dày dù có mô tả', () => {
    const result = evaluateAreaSeo({ area, activeListings: [property('1')], districts: ['Thủ Dầu Một'], propertyTypes: ['Nhà phố'], hasDescription: true });
    expect(result.indexable).toBe(false);
    expect(result.robots).toEqual({ index: false, follow: true });
    expect(result.reasons).toContain('not_enough_active_listings');
  });

  it('index khi đủ slug/name/mô tả/listing và tín hiệu phân biệt', () => {
    const listings = Array.from({ length: MIN_AREA_LISTINGS_FOR_INDEX }, (_, i) => property(String(i), i % 2 ? 'type-a' : 'type-b', i % 2 ? 'Dĩ An' : 'Thủ Dầu Một'));
    const result = evaluateAreaSeo({ area, activeListings: listings, districts: ['Dĩ An', 'Thủ Dầu Một'], propertyTypes: ['Nhà phố', 'Đất nền'], hasDescription: true });
    expect(result.indexable).toBe(true);
    expect(result.robots).toEqual({ index: true, follow: true });
  });

  it('noindex khi thiếu mô tả riêng', () => {
    const result = evaluateAreaSeo({ area: { name: area.name, slug: area.slug }, activeListings: Array.from({ length: 5 }, (_, i) => property(String(i))), districts: ['Dĩ An', 'Thủ Dầu Một'], propertyTypes: ['Nhà phố', 'Đất nền'], hasDescription: false });
    expect(result.indexable).toBe(false);
    expect(result.reasons).toContain('missing_unique_description');
  });
});

describe('areaSummaryFromData', () => {
  it('ưu tiên areas.description', () => {
    expect(areaSummaryFromData(area, null)).toBe(area.description);
  });

  it('fallback sang curated detail nếu area không có description', () => {
    expect(areaSummaryFromData({ ...area, description: null }, { description: 'Curated summary' })).toBe('Curated summary');
  });

  it('fallback trung tính, không bịa số liệu', () => {
    expect(areaSummaryFromData({ ...area, description: null }, null)).toContain('Bình Dương');
  });
});

describe('buildAreaMetadata', () => {
  it('dựng canonical và robots theo evaluation', () => {
    const noindex = evaluateAreaSeo({ area, activeListings: [], districts: [], propertyTypes: [], hasDescription: true });
    const metadata = buildAreaMetadata(area, 'Tóm tắt khu vực', noindex);
    expect(metadata.alternates?.canonical).toBe('/khu-vuc/binh-duong');
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.openGraph?.url).toBe('/khu-vuc/binh-duong');
  });
});

describe('buildAreaCollectionJsonLd', () => {
  it('ItemList chỉ chứa listing được truyền vào và đúng URL', () => {
    const ld = buildAreaCollectionJsonLd(area, [property('1'), property('2')]);
    const main = ld.mainEntity as Record<string, unknown>;
    const items = main.itemListElement as Array<Record<string, unknown>>;
    expect(ld['@type']).toBe('CollectionPage');
    expect(items).toHaveLength(2);
    expect(items[0].position).toBe(1);
    expect(items[0].url).toBe('https://chonhaviet.com/bat-dong-san/nha-dat-1');
  });

  it('ItemList dùng URL sản phẩm mới khi listing có public_code và area slug', () => {
    const p = property('1');
    p.public_code = 1001;
    p.areas = area;
    const ld = buildAreaCollectionJsonLd(area, [p]);
    const main = ld.mainEntity as Record<string, unknown>;
    const items = main.itemListElement as Array<Record<string, unknown>>;
    expect(items[0].url).toBe('https://chonhaviet.com/mua-ban/binh-duong/thu-dau-mot/nha-dat-1-pr1001');
  });
});

function priceStat(over: Partial<PriceStat> = {}): PriceStat {
  return {
    id: 'ps-1', scope: 'area', scope_key: 'binh-duong', listing_type: 'mua_ban',
    property_type_id: null, sample_count: 8, avg_price_per_sqm: 30,
    median_price_per_sqm: 28, min_price_per_sqm: 20, max_price_per_sqm: 40,
    avg_area_sqm: 80, computed_at: '2026-07-01T00:00:00.000Z', ...over,
  };
}

describe('buildAreaFaq', () => {
  it('trả [] khi không có dữ liệu thật', () => {
    const faq = buildAreaFaq({ name: 'Bình Dương' }, { activeCount: 0, priceStats: [], detail: null, summary: '' });
    expect(faq).toEqual([]);
  });

  it('sinh câu hỏi giá + số tin từ dữ liệu thật', () => {
    const faq = buildAreaFaq({ name: 'Bình Dương' }, {
      activeCount: 12, priceStats: [priceStat()], detail: null, summary: '',
    });
    expect(faq.some(f => f.question.includes('Giá nhà đất Bình Dương'))).toBe(true);
    expect(faq.some(f => f.question.includes('bao nhiêu tin'))).toBe(true);
    expect(faq.every(f => f.answer.trim().length > 0)).toBe(true);
  });
});
