import { describe, expect, it } from 'vitest';
import { buildNavigationItems } from './navigation';
import type { Area } from './supabase';

const areas = [
  { id: 'a1', name: 'Bình Dương', slug: 'binh-duong', description: null, image_url: null, order_index: 1, created_at: '' },
  { id: 'a2', name: 'Đồng Nai', slug: 'dong-nai', description: null, image_url: null, order_index: 2, created_at: '' },
] satisfies Area[];

describe('buildNavigationItems', () => {
  it('adds a two-level region menu with fallback labels', () => {
    const nav = buildNavigationItems({}, areas);
    const regions = nav.find(item => item.key === 'regions');

    expect(regions?.label).toBe('Tìm theo khu vực');
    expect(regions?.page).toEqual({ name: 'regions' });
    expect(regions?.children?.[0]).toMatchObject({ label: 'Tất cả khu vực', href: '/khu-vuc' });
    expect(regions?.children?.[1]).toMatchObject({ label: 'Bình Dương', href: '/khu-vuc/binh-duong' });
    expect(regions?.children?.[2]).toMatchObject({ label: 'Đồng Nai', href: '/khu-vuc/dong-nai' });
  });

  it('allows CMS labels for region menu and area children', () => {
    const nav = buildNavigationItems({
      menu_regions: 'Khu vực',
      menu_regions_all: 'Toàn bộ khu vực',
      'menu_region_binh-duong': 'BĐS Bình Dương',
    }, areas);
    const regions = nav.find(item => item.key === 'regions');

    expect(regions?.label).toBe('Khu vực');
    expect(regions?.children?.[0].label).toBe('Toàn bộ khu vực');
    expect(regions?.children?.[1].label).toBe('BĐS Bình Dương');
    expect(regions?.children?.[2].label).toBe('Đồng Nai');
  });

  it('keeps existing menu routes and customizable valuation label', () => {
    const nav = buildNavigationItems({ menu_valuation: 'Định giá nhà đất' }, []);

    expect(nav.find(item => item.key === 'home')?.page).toEqual({ name: 'home' });
    expect(nav.find(item => item.key === 'buy')?.page).toEqual({ name: 'listings', listingType: 'mua_ban' });
    expect(nav.find(item => item.key === 'rent')?.page).toEqual({ name: 'listings', listingType: 'cho_thue' });
    expect(nav.find(item => item.key === 'valuation')?.label).toBe('Định giá nhà đất');
    expect(nav.find(item => item.key === 'valuation')?.page).toEqual({ name: 'valuation' });
  });
});
