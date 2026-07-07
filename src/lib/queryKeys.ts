// Factory query-key dùng chung cho React Query. Tập trung một chỗ để tránh
// bug key trùng/lệch giữa các trang (vd news list ở NewsPage vs LandingPage).
// Giữ đơn giản: object các hàm trả về tuple key, không abstraction thừa.

export type PropertyFilters = Parameters<
  typeof import('./api/properties')['getAllProperties']
>[0];

export const qk = {
  // Taxonomy đã có hook riêng (useTaxonomy) — key khai báo ở đây để nhất quán
  areas: () => ['areas'] as const,
  propertyTypes: () => ['propertyTypes'] as const,
  districts: (areaId?: string) => ['districts', areaId ?? 'all'] as const,

  // Properties
  properties: (filters?: PropertyFilters) => ['properties', filters ?? {}] as const,
  propertiesMap: (f?: { areaId?: string; typeId?: string }) => ['propertiesMap', f ?? {}] as const,
  property: (id: string) => ['property', id] as const,
  relatedProperties: (id: string) => ['relatedProperties', id] as const,
  areaProperties: (areaId?: string) => ['areaProperties', areaId ?? 'none'] as const,
  sectionProperties: (sectionId: string) => ['sectionProperties', sectionId] as const,

  // News
  news: (category?: string, limit = 20) => ['news', category ?? 'all', limit] as const,
  newsArticle: (id: string) => ['newsArticle', id] as const,

  // CMS / trang
  featuredSections: () => ['featuredSections'] as const,
  pageBlocks: (section: string) => ['pageBlocks', section] as const,
  pageLayout: () => ['pageLayout'] as const,

  // Banners
  banners: (position: string) => ['banners', position] as const,

  // User
  favoriteIds: () => ['favoriteIds'] as const,
  userFavorites: () => ['userFavorites'] as const,
  myListings: () => ['myListings'] as const,
  testimonials: () => ['testimonials'] as const,

  // Projects
  projects: () => ['projects'] as const,
} as const;
