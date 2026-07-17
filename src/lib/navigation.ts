import type { Area } from './supabase';
import type { Page } from './router';

export type NavContent = Record<string, string | null | undefined>;

export type NavigationItem = {
  key: string;
  label: string;
  page?: Page;
  href?: string;
  activePage?: Page['name'];
  children?: NavigationItem[];
};

function label(content: NavContent, key: string, fallback: string): string {
  return content[key]?.trim() || fallback;
}

export function buildNavigationItems(content: NavContent, areas: Area[] = []): NavigationItem[] {
  return [
    { key: 'home', label: label(content, 'menu_home', 'Trang chủ'), page: { name: 'home' } },
    { key: 'buy', label: label(content, 'menu_buy', 'Mua bán'), page: { name: 'listings', listingType: 'mua_ban' } },
    { key: 'rent', label: label(content, 'menu_rent', 'Cho thuê'), page: { name: 'listings', listingType: 'cho_thue' } },
    {
      key: 'regions',
      label: label(content, 'menu_regions', 'Tìm theo khu vực'),
      page: { name: 'regions' },
      activePage: 'regions',
      children: [
        { key: 'regions-all', label: label(content, 'menu_regions_all', 'Tất cả khu vực'), href: '/khu-vuc', activePage: 'regions' },
        ...areas.map(area => ({
          key: `region-${area.slug}`,
          label: label(content, `menu_region_${area.slug}`, area.name),
          href: `/khu-vuc/${area.slug}`,
          activePage: 'regions' as const,
        })),
      ],
    },
    { key: 'projects', label: label(content, 'menu_projects', 'Dự án'), page: { name: 'projects' } },
    { key: 'invest', label: label(content, 'menu_invest', 'Đầu tư'), page: { name: 'invest' } },
    { key: 'valuation', label: label(content, 'menu_valuation', 'Định giá'), page: { name: 'valuation' } },
    { key: 'news', label: label(content, 'menu_news', 'Tin tức'), page: { name: 'news' } },
    { key: 'about', label: label(content, 'menu_about', 'Về chúng tôi'), page: { name: 'about' } },
  ];
}
