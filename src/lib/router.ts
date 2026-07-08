export type Page =
  | { name: 'home' }
  | {
      name: 'listings';
      listingType?: 'mua_ban' | 'cho_thue';
      areaId?: string; typeId?: string; keyword?: string;
      minPrice?: number; maxPrice?: number; minArea?: number; maxArea?: number;
      bedrooms?: string; direction?: string; legal?: string;
      isFeatured?: boolean; isHot?: boolean; sort?: string;
    }
  | { name: 'property'; id: string; slug?: string }
  | { name: 'projects'; areaId?: string; phase?: string }
  | { name: 'invest' }
  | { name: 'regions'; areaId?: string }
  | { name: 'news'; articleId?: string; slug?: string; category?: string }
  | { name: 'about' }
  | { name: 'post-listing' }
  | { name: 'my-listings' }
  | { name: 'account' }
  | { name: 'quantri-login' }
  | { name: 'quantri'; tab?: string };

export function scrollTop() {
  if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
}

export const ADMIN_PATH = '/quantrihethong';

// Ánh xạ một Page → URL path. Là nguồn chân lý duy nhất cho điều hướng trong Next
// (thay window.history.pushState của SPA cũ). Dùng cho <Link> và router.push.
export function pageToHref(page: Page): string {
  switch (page.name) {
    case 'home': return '/';
    case 'property': return `/bat-dong-san/${(page.slug && page.slug.trim()) || page.id}`;
    case 'news':
      return page.slug ? `/tin-tuc/${page.slug}` : (page.articleId ? `/tin-tuc/${page.articleId}` : '/tin-tuc');
    case 'listings':
      if (page.listingType === 'mua_ban') return '/mua-ban';
      if (page.listingType === 'cho_thue') return '/cho-thue';
      return '/danh-sach';
    case 'projects': return '/du-an';
    case 'invest': return '/dau-tu';
    case 'regions': return '/khu-vuc';
    case 'about': return '/ve-chung-toi';
    case 'post-listing': return '/dang-tin';
    case 'my-listings': return '/tin-cua-toi';
    case 'account': return '/tai-khoan';
    case 'quantri-login':
    case 'quantri': return ADMIN_PATH;
    default: return '/';
  }
}
