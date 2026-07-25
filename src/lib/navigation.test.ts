import { describe, expect, it } from 'vitest';
import { buildNavigationItems, buildMenuTree } from './navigation';
import type { Area, MenuItem } from './supabase';

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
    expect(regions?.children?.[1]).toMatchObject({ label: 'Khu dân cư', href: '/khu-dan-cu' });
    expect(regions?.children?.[2]).toMatchObject({ label: 'Dữ liệu giá', href: '/du-lieu-gia' });
    expect(regions?.children?.[3]).toMatchObject({ label: 'Bình Dương', href: '/khu-vuc/binh-duong' });
    expect(regions?.children?.[4]).toMatchObject({ label: 'Đồng Nai', href: '/khu-vuc/dong-nai' });
  });

  it('adds a news dropdown with knowledge hub', () => {
    const nav = buildNavigationItems({}, []);
    const news = nav.find(item => item.key === 'news');

    expect(news?.label).toBe('Tin tức');
    expect(news?.children?.[0]).toMatchObject({ label: 'Tất cả tin tức', href: '/tin-tuc' });
    expect(news?.children?.[1]).toMatchObject({ label: 'Kiến thức', href: '/kien-thuc' });
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
    expect(regions?.children?.[3].label).toBe('BĐS Bình Dương');
    expect(regions?.children?.[4].label).toBe('Đồng Nai');
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

function mkMenuItem(over: Partial<MenuItem> & { id: string }): MenuItem {
  return {
    id: over.id, parent_id: over.parent_id ?? null, label: over.label ?? over.id,
    url: over.url ?? null, item_type: over.item_type ?? 'link',
    open_new_tab: over.open_new_tab ?? false, order_index: over.order_index ?? 0,
    is_active: over.is_active ?? true, created_at: '', updated_at: '',
  };
}

describe('buildMenuTree', () => {
  it('dựng cây theo parent_id + sort order_index', () => {
    const items: MenuItem[] = [
      mkMenuItem({ id: 'rent', label: 'Cho thuê', url: '/cho-thue', order_index: 1 }),
      mkMenuItem({ id: 'buy', label: 'Mua bán', url: '/mua-ban', order_index: 0 }),
      mkMenuItem({ id: 'news', label: 'Tin tức', url: '/tin-tuc', order_index: 2 }),
      mkMenuItem({ id: 'kt', parent_id: 'news', label: 'Kiến thức', url: '/kien-thuc', order_index: 0 }),
    ];
    const tree = buildMenuTree(items, []);
    expect(tree.map(t => t.label)).toEqual(['Mua bán', 'Cho thuê', 'Tin tức']);
    const news = tree.find(t => t.key === 'news');
    expect(news?.children?.[0]).toMatchObject({ label: 'Kiến thức', href: '/kien-thuc' });
  });

  it('bung mục dynamic_areas thành danh sách khu vực', () => {
    const areas = [
      { id: 'a1', name: 'Bình Dương', slug: 'binh-duong', description: null, image_url: null, order_index: 1, created_at: '' },
    ] satisfies Area[];
    const items: MenuItem[] = [
      mkMenuItem({ id: 'regions', label: 'Khu vực', url: '/khu-vuc', order_index: 0 }),
      mkMenuItem({ id: 'dyn', parent_id: 'regions', label: 'DS khu vực', item_type: 'dynamic_areas', order_index: 0 }),
    ];
    const tree = buildMenuTree(items, areas);
    const regions = tree.find(t => t.key === 'regions');
    // node động không có href; children của nó gồm cây con động (khu vực thật)
    const dyn = regions?.children?.find(c => c.key === 'dyn');
    expect(dyn?.children?.[0]).toMatchObject({ label: 'Bình Dương', href: '/khu-vuc/binh-duong' });
  });

  it('bỏ mục is_active=false', () => {
    const items: MenuItem[] = [
      mkMenuItem({ id: 'buy', label: 'Mua bán', url: '/mua-ban', order_index: 0 }),
      mkMenuItem({ id: 'hidden', label: 'Ẩn', url: '/x', order_index: 1, is_active: false }),
    ];
    const tree = buildMenuTree(items, []);
    expect(tree.map(t => t.key)).toEqual(['buy']);
  });
});
