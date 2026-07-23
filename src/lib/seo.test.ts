import { describe, it, expect } from 'vitest';
import { buildLocalBusinessJsonLd, staticPageMetadata, buildBreadcrumbJsonLd, buildPropertyJsonLd } from './seo';
import type { Property } from './supabase';

const SITE_URL = 'https://diaocthanhphat.com';

function property(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1', title: 'Nhà phố đẹp', description: 'Mô tả nhà phố.',
    price: 3, price_unit: 'tỷ', price_label: null, price_per_month: null, loan_support: null,
    listing_type: 'mua_ban', area_sqm: 80, address: null, city: 'Bình Dương',
    district: 'Thủ Dầu Một', ward: null, area_id: null, district_id: null, property_type_id: null,
    image_url: null, images: null, badge: null, badge_color: null, legal_status: null,
    is_featured: false, is_hot: false, is_active: true, is_verified: false, views: 0,
    contact_name: null, contact_phone: null, bedrooms: null, bathrooms: null,
    floor_count: null, floor_number: null, direction: null, road_width: null, frontage: null,
    amenities: null, latitude: null, longitude: null, formatted_address: null,
    vr_tour_url: null, video_url: null, contact_zalo: null, tags: null,
    meta_title: null, meta_description: null, focus_keywords: null, schema_markup: null, faq: null,
    slug: 'nha-pho-dep', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildLocalBusinessJsonLd', () => {
  it('luôn có các trường cơ bản kể cả settings rỗng', () => {
    const ld = buildLocalBusinessJsonLd({});
    expect(ld['@type']).toBe('RealEstateAgent');
    expect(ld.name).toBeTruthy();
    expect(ld.url).toBe(SITE_URL);
    expect(ld).not.toHaveProperty('telephone');
    expect(ld).not.toHaveProperty('address');
    expect(ld).not.toHaveProperty('sameAs');
  });

  it('thêm telephone/email/address khi settings non-empty', () => {
    const ld = buildLocalBusinessJsonLd({
      phone_main: '0901 234 567',
      email: 'info@bds.vn',
      address: 'Thủ Dầu Một, Bình Dương',
    });
    expect(ld.telephone).toBe('0901 234 567');
    expect(ld.email).toBe('info@bds.vn');
    expect(ld.address).toEqual({
      '@type': 'PostalAddress',
      streetAddress: 'Thủ Dầu Một, Bình Dương',
      addressRegion: 'Bình Dương',
      addressCountry: 'VN',
    });
  });

  it('email fallback sang email_contact khi email rỗng', () => {
    const ld = buildLocalBusinessJsonLd({ email: '', email_contact: 'lienhe@bds.vn' });
    expect(ld.email).toBe('lienhe@bds.vn');
  });

  it('sameAs lọc bỏ social rỗng, bỏ hẳn khi tất cả rỗng', () => {
    const withSocial = buildLocalBusinessJsonLd({
      facebook_url: 'https://fb.com/bds',
      youtube_url: '',
      social_tiktok: 'https://tiktok.com/@bds',
    });
    expect(withSocial.sameAs).toEqual(['https://fb.com/bds', 'https://tiktok.com/@bds']);

    const noSocial = buildLocalBusinessJsonLd({ facebook_url: '', youtube_url: '' });
    expect(noSocial).not.toHaveProperty('sameAs');
  });

  it('logo/image lấy site_logo_url, fallback og_image', () => {
    expect(buildLocalBusinessJsonLd({ site_logo_url: 'https://x/logo.png' }).logo).toBe('https://x/logo.png');
    expect(buildLocalBusinessJsonLd({ og_image: 'https://x/og.png' }).logo).toBe('https://x/og.png');
  });
});

describe('staticPageMetadata', () => {
  it('dựng canonical + openGraph.url + twitter card', () => {
    const m = staticPageMetadata({ title: 'Định giá', description: 'Ước tính giá', path: '/dinh-gia' });
    expect(m.title).toBe('Định giá');
    expect(m.description).toBe('Ước tính giá');
    expect(m.alternates?.canonical).toBe('/dinh-gia');
    expect(m.openGraph?.url).toBe('/dinh-gia');
    expect(m.openGraph?.title).toBe('Định giá');
    expect((m.twitter as { card?: string })?.card).toBe('summary_large_image');
  });
});

describe('buildBreadcrumbJsonLd', () => {
  it('position tăng dần và item = SITE_URL + path', () => {
    const ld = buildBreadcrumbJsonLd([
      { name: 'Trang chủ', path: '/' },
      { name: 'Mua bán', path: '/mua-ban' },
    ]);
    const items = ld.itemListElement as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[0].position).toBe(1);
    expect(items[1].position).toBe(2);
    expect(items[1].item).toBe(`${SITE_URL}/mua-ban`);
  });
});

describe('buildPropertyJsonLd', () => {
  it('không cho schema_markup tùy ý ghi đè schema BĐS thật', () => {
    const custom = { '@context': 'https://schema.org', '@type': 'Thing', name: 'custom' };
    const ld = buildPropertyJsonLd(property({ schema_markup: custom }));
    expect(ld['@type']).toBe('RealEstateListing');
    expect(ld.name).toBe('Nhà phố đẹp');
    expect(ld.url).toBe(`${SITE_URL}/bat-dong-san/nha-pho-dep`);
  });

  it('custom schema hợp lệ chỉ merge field bổ sung, không ghi đè locked field', () => {
    const custom = { '@context': 'https://schema.org', '@type': 'RealEstateListing', name: 'custom', additionalType: 'https://schema.org/House' };
    const ld = buildPropertyJsonLd(property({ schema_markup: custom }));
    expect(ld.name).toBe('Nhà phố đẹp');
    expect(ld.additionalType).toBe('https://schema.org/House');
  });

  it('RealEstateListing cơ bản: type/name/url/offers/floorSize/address', () => {
    const ld = buildPropertyJsonLd(property({ image_url: 'https://x/a.jpg' }));
    expect(ld['@type']).toBe('RealEstateListing');
    expect(ld.name).toBe('Nhà phố đẹp');
    expect(ld.url).toBe(`${SITE_URL}/bat-dong-san/nha-pho-dep`);
    expect(ld['@id']).toBe(`${SITE_URL}/bat-dong-san/nha-pho-dep#realestatelisting`);
    expect((ld.offers as Record<string, unknown>).price).toBe(3);
    expect((ld.floorSize as Record<string, unknown>).value).toBe(80);
    expect((ld.address as Record<string, unknown>).addressLocality).toBe('Thủ Dầu Một');
  });

  it('image là mảng gallery ảnh thật (không có ảnh fallback)', () => {
    const ld = buildPropertyJsonLd(property({ image_url: 'https://x/a.jpg', images: ['https://x/b.jpg', 'https://x/a.jpg'] }));
    expect(ld.image).toEqual(['https://x/a.jpg', 'https://x/b.jpg']);
  });

  it('không có ảnh thật → không set image (không nhét ảnh fallback vào schema)', () => {
    const ld = buildPropertyJsonLd(property({ image_url: null, images: null }));
    expect(ld).not.toHaveProperty('image');
  });

  it('numberOfRooms khi có bedrooms', () => {
    expect(buildPropertyJsonLd(property({ bedrooms: 3 })).numberOfRooms).toBe(3);
    expect(buildPropertyJsonLd(property({ bedrooms: null })).numberOfRooms).toBeUndefined();
  });

  it('VideoObject cho YouTube: có thumbnailUrl suy từ id + embedUrl', () => {
    const ld = buildPropertyJsonLd(property({ video_url: 'https://www.youtube.com/watch?v=abc123XYZ_1' }));
    const v = ld.video as Record<string, unknown>;
    expect(v['@type']).toBe('VideoObject');
    expect(v.thumbnailUrl).toBe('https://i.ytimg.com/vi/abc123XYZ_1/hqdefault.jpg');
    expect(v.embedUrl).toBe('https://www.youtube.com/embed/abc123XYZ_1');
    expect(v.name).toBeTruthy();
    expect(v.uploadDate).toBe('2026-01-01T00:00:00.000Z');
  });

  it('video MP4 dùng image_url làm thumbnail; không có ảnh → bỏ video (tránh VideoObject thiếu field)', () => {
    const withImg = buildPropertyJsonLd(property({ video_url: 'https://x/clip.mp4', image_url: 'https://x/a.jpg' }));
    const v = withImg.video as Record<string, unknown>;
    expect(v.thumbnailUrl).toBe('https://x/a.jpg');
    expect(v.contentUrl).toBe('https://x/clip.mp4');

    const noImg = buildPropertyJsonLd(property({ video_url: 'https://x/clip.mp4', image_url: null, images: null }));
    expect(noImg).not.toHaveProperty('video');
  });

  it('không có video_url → không set video', () => {
    expect(buildPropertyJsonLd(property({ video_url: null }))).not.toHaveProperty('video');
  });

  it('geo khi đủ lat/lng', () => {
    const ld = buildPropertyJsonLd(property({ latitude: 10.9, longitude: 106.6 }));
    expect((ld.geo as Record<string, unknown>).latitude).toBe(10.9);
  });

  it('KHÔNG bịa trường verified vào schema', () => {
    const ld = buildPropertyJsonLd(property({ is_verified: true }));
    expect(ld).not.toHaveProperty('verified');
    expect(ld).not.toHaveProperty('isVerified');
  });
});
