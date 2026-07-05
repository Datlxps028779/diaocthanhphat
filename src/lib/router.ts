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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
