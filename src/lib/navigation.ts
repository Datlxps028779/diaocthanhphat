import type { Area, MenuItem } from './supabase';
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
        { key: 'neighborhoods', label: label(content, 'menu_neighborhoods', 'Khu dân cư'), href: '/khu-dan-cu', activePage: 'regions' },
        { key: 'price-data', label: label(content, 'menu_price_data', 'Dữ liệu giá'), href: '/du-lieu-gia', activePage: 'regions' },
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
    {
      key: 'news',
      label: label(content, 'menu_news', 'Tin tức'),
      page: { name: 'news' },
      activePage: 'news',
      children: [
        { key: 'news-all', label: label(content, 'menu_news_all', 'Tất cả tin tức'), href: '/tin-tuc', activePage: 'news' },
        { key: 'knowledge', label: label(content, 'menu_knowledge', 'Kiến thức'), href: '/kien-thuc', activePage: 'news' },
      ],
    },
    { key: 'about', label: label(content, 'menu_about', 'Về chúng tôi'), page: { name: 'about' } },
  ];
}

// Dựng cây menu đệ quy từ bảng menu_items (phẳng, parent_id tự tham chiếu). Node
// item_type='dynamic_areas' được bung thành danh sách khu vực thật (thêm area mới
// → menu tự cập nhật). Chỉ lấy item is_active. Sort theo order_index từng cấp.
export function buildMenuTree(items: MenuItem[], areas: Area[] = []): NavigationItem[] {
  const active = items.filter(i => i.is_active);
  const byParent = new Map<string | null, MenuItem[]>();
  for (const it of active) {
    const arr = byParent.get(it.parent_id) ?? [];
    arr.push(it);
    byParent.set(it.parent_id, arr);
  }

  const areaNodes = (): NavigationItem[] =>
    areas.map(a => ({ key: `region-${a.slug}`, label: a.name, href: `/khu-vuc/${a.slug}`, activePage: 'regions' as const }));

  const build = (parentId: string | null): NavigationItem[] => {
    const rows = (byParent.get(parentId) ?? []).slice().sort((a, b) => a.order_index - b.order_index);
    return rows.map(row => {
      const children = build(row.id);
      if (row.item_type === 'dynamic_areas') children.push(...areaNodes());
      const node: NavigationItem = { key: row.id, label: row.label };
      if (row.url) node.href = row.url;
      if (children.length > 0) node.children = children;
      return node;
    });
  };

  return build(null);
}
