import { describe, it, expect } from 'vitest';
import { buildAutoSchema, schemaToJson } from './seoAuto';

describe('buildAutoSchema — news', () => {
  it('dựng NewsArticle với headline/description/url', () => {
    const s = buildAutoSchema('news', { title: 'Tin BĐS', description: 'Mô tả', path: '/tin-tuc/a' });
    expect(s['@type']).toBe('NewsArticle');
    expect(s.headline).toBe('Tin BĐS');
    expect(s.description).toBe('Mô tả');
    expect(s.url).toBe('/tin-tuc/a');
  });

  it('thiếu title → suy name từ focus_keywords rồi path', () => {
    const s = buildAutoSchema('news', { focus_keywords: 'đất nền, dĩ an', path: '/tin-tuc/x' });
    expect(s.headline).toBe('đất nền');
    const s2 = buildAutoSchema('news', { path: '/tin-tuc/gia-dat-di-an' });
    expect(s2.headline).toBe('tin tuc gia dat di an');
  });

  it('thiếu hết → name mặc định "Trang"', () => {
    const s = buildAutoSchema('news', {});
    expect(s.headline).toBe('Trang');
  });
});

describe('buildAutoSchema — property', () => {
  it('mua bán có giá → offers VND', () => {
    const s = buildAutoSchema('property', { title: 'Nhà', listing_type: 'mua_ban', price: 3, price_unit: 'tỷ', path: '/bat-dong-san/nha' });
    expect(s['@type']).toBe('RealEstateListing');
    expect((s.offers as Record<string, unknown>).price).toBe('3000000000');
  });

  it('cho thuê dùng price_per_month', () => {
    const s = buildAutoSchema('property', { title: 'Nhà thuê', listing_type: 'cho_thue', price_per_month: 10, path: '/p' });
    expect((s.offers as Record<string, unknown>).price).toBe('10000000');
  });

  it('KHÔNG có giá → không set offers (không bịa)', () => {
    const s = buildAutoSchema('property', { title: 'Nhà', listing_type: 'mua_ban', path: '/p' });
    expect(s).not.toHaveProperty('offers');
  });

  it('có diện tích/phòng → floorSize/numberOfRooms', () => {
    const s = buildAutoSchema('property', { title: 'Nhà', area_sqm: 80, bedrooms: 3, path: '/p' });
    expect((s.floorSize as Record<string, unknown>).value).toBe(80);
    expect(s.numberOfRooms).toBe(3);
  });

  it('có địa chỉ/thành phố → PostalAddress', () => {
    const s = buildAutoSchema('property', { title: 'Nhà', city: 'Bình Dương', district: 'Dĩ An', path: '/p' });
    const addr = s.address as Record<string, unknown>;
    expect(addr.addressLocality).toBe('Dĩ An');
    expect(addr.addressRegion).toBe('Bình Dương');
  });
});

describe('buildAutoSchema — route/area/home', () => {
  it('route "/" → WebPage', () => {
    const s = buildAutoSchema('route', { path: '/' });
    expect(s['@type']).toBe('WebPage');
  });

  it('route "/tin-tuc" → CollectionPage + mainEntityOfPage', () => {
    const s = buildAutoSchema('route', { path: '/tin-tuc' });
    expect(s['@type']).toBe('CollectionPage');
    expect(s.mainEntityOfPage).toBe('/tin-tuc');
  });

  it('routeType truyền qua options được ưu tiên', () => {
    const s = buildAutoSchema('route', { path: '/faq' }, { routeType: 'FAQPage' });
    expect(s['@type']).toBe('FAQPage');
  });

  it('home → WebSite; area → CollectionPage', () => {
    expect(buildAutoSchema('home', { path: '/' })['@type']).toBe('WebSite');
    expect(buildAutoSchema('area', { path: '/khu-vuc/di-an' })['@type']).toBe('CollectionPage');
  });
});

describe('schemaToJson', () => {
  it('serialize đẹp, parse lại được', () => {
    const s = buildAutoSchema('news', { title: 'A', path: '/a' });
    expect(() => JSON.parse(schemaToJson(s))).not.toThrow();
  });
});
