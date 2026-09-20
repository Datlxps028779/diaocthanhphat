import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PropertyCard } from './PropertyCard';

vi.stubGlobal('React', React);
const property = { id: 'p1', title: 'Nhà có sân vườn', price: 340, price_unit: 'triệu', listing_type: 'mua_ban', area_sqm: 200, bedrooms: 3, bathrooms: 2, property_types: { name: 'Nhà phố', slug: 'nha-pho' }, legal_status: 'Sổ hồng', created_at: '2026-01-02T12:00:00Z', district: 'Dĩ An', city: 'Bình Dương' };

describe('shared property card', () => {
  it.each(['grid', 'list', 'compact'] as const)('keeps the complete information contract in %s', variant => {
    const html = renderToStaticMarkup(<PropertyCard property={property} variant={variant} onContact={() => {}} />);
    for (const text of ['Nhà có sân vườn', '340 triệu', '≈ 1,7 triệu/m²', '200 m²', '3 phòng ngủ', '2 phòng tắm', 'Sổ hồng', 'Dĩ An', 'Người đăng', 'Chưa có thông tin người đăng', '02/01/2026', 'Chi tiết', 'Liên hệ']) expect(html).toContain(text);
    expect(html).not.toContain('pexels');
    expect(html).toContain('Ảnh chưa có sẵn');
    for (const anchor of html.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)) expect(anchor[1]).not.toMatch(/<(?:a|button)\b/);
  });
  it('keeps unknown poster visible and does not expose private contact fields', () => {
    const source = { ...property, contact_name: 'Private contact', contact_phone: '0900000000' };
    const html = renderToStaticMarkup(<PropertyCard property={source} />);
    expect(html).toContain('Chưa có thông tin người đăng');
    expect(html).not.toContain('Private contact');
    expect(html).not.toContain('0900000000');
  });
  it('renders a real public profile link separately from property actions', () => {
    const html = renderToStaticMarkup(<PropertyCard property={property} poster={{ propertyId: 'p1', source: 'published-profile', displayName: 'Nguyễn Văn An', profileSlug: 'nguyen-van-an' }} />);
    expect(html).toContain('href="/nguoi-dang-tin/nguyen-van-an"');
    expect(html).toContain('Nguyễn Văn An');
    expect(html).not.toContain('Chưa có thông tin người đăng');
  });
  it('keeps optional actions absent when the surface has no handler', () => {
    const html = renderToStaticMarkup(<PropertyCard property={property} />);
    expect(html).not.toContain('>Liên hệ');
    expect(html).not.toContain('Lưu tin đăng');
  });
  it('keeps transaction/type badges, area once and metadata inside the compact footer', () => {
    const html = renderToStaticMarkup(<PropertyCard property={property} onContact={() => {}} />);
    expect(html).toContain('Nhà phố');
    expect(html).toContain('Mua bán');
    expect(html.match(/200 m²/g)).toHaveLength(1);
    expect(html).toMatch(/data-testid="property-card-footer"[\s\S]*02\/01\/2026[\s\S]*Chi tiết[\s\S]*Liên hệ/);
  });
  it('uses relative safe image URLs on server and client renders', () => {
    const html = renderToStaticMarkup(<PropertyCard property={{ ...property, image_url: 'https://chonhaviet.com/hinh-anh/property-images/a.jpg' }} />);
    expect(html).toContain('/hinh-anh/property-images/a.jpg');
    expect(html).not.toContain('https://chonhaviet.com/hinh-anh');
  });
});
