import { describe, expect, it } from 'vitest';
import { buildPropertyDetailContinuationTargets } from './propertyDetailContinuation';
import { pageToHref } from './router';

const taxonomy = {
  areas: [{ id: 'area-1', slug: 'binh-duong' }],
  districts: [{ area_id: 'area-1', name: 'Thuận An', slug: 'binh-duong-thuan-an' }],
  propertyTypes: [],
};

describe('buildPropertyDetailContinuationTargets', () => {
  it('prioritizes real neighborhood, district, area, then rendered related inventory', () => {
    expect(buildPropertyDetailContinuationTargets({
      property: { listing_type: 'mua_ban', area_id: 'area-1', district: 'Thuận An' },
      taxonomy,
      pageToHref,
      neighborhood: { name: 'Phú Hồng Thịnh 8', slug: 'kdc-phu-hong-thinh-8' },
      relatedCount: 3,
    })).toEqual([
      { key: 'neighborhood', label: 'Xem dữ liệu khu dân cư Phú Hồng Thịnh 8', href: '/khu-dan-cu/kdc-phu-hong-thinh-8' },
      { key: 'district', label: 'Xem thêm tin tại Thuận An', href: '/mua-ban/binh-duong/thuan-an' },
      { key: 'area', label: 'Xem thêm tin trong khu vực', href: '/mua-ban/binh-duong' },
      { key: 'related_properties', label: 'Xem bất động sản tương tự bên dưới', href: '#related-properties' },
    ]);
  });

  it('keeps rental routes and falls back from unresolved district to its real area', () => {
    expect(buildPropertyDetailContinuationTargets({
      property: { listing_type: 'cho_thue', area_id: 'area-1', district: 'Không có trong taxonomy' },
      taxonomy,
      pageToHref,
      relatedCount: 0,
    })).toEqual([
      { key: 'area', label: 'Xem thêm tin trong khu vực', href: '/cho-thue/binh-duong' },
    ]);
  });

  it('does not infer routes from incomplete location data or expose an empty related anchor', () => {
    expect(buildPropertyDetailContinuationTargets({
      property: { listing_type: 'mua_ban', area_id: null, district: 'Thuận An' },
      taxonomy,
      pageToHref,
      neighborhood: null,
      relatedCount: 0,
    })).toEqual([]);
  });

  it('deduplicates identical resolved destinations', () => {
    const targets = buildPropertyDetailContinuationTargets({
      property: { listing_type: 'mua_ban', area_id: 'area-1', district: 'Thuận An' },
      taxonomy,
      pageToHref: () => '/mua-ban/binh-duong',
      relatedCount: 0,
    });

    expect(targets).toEqual([
      { key: 'district', label: 'Xem thêm tin tại Thuận An', href: '/mua-ban/binh-duong' },
    ]);
  });
});
