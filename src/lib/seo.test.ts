import { describe, it, expect } from 'vitest';
import { buildLocalBusinessJsonLd, staticPageMetadata, buildBreadcrumbJsonLd } from './seo';

const SITE_URL = 'https://diaocthanhphat.com';

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
