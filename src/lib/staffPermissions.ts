import type { AdminTab } from '../components/admin/types';

export type StaffPermissionAction =
  | 'view'
  | 'create'
  | 'edit'
  | 'delete'
  | 'publish'
  | 'approve'
  | 'reject'
  | 'manage_media'
  | 'manage_seo'
  | 'manage_permissions';

export type StaffPermissionScopeKind = 'global' | 'area' | 'district' | 'ward' | 'neighborhood';

export type StaffPermission = {
  module: AdminTab;
  action: StaffPermissionAction;
  scope_kind: StaffPermissionScopeKind;
  scope_id: string | null;
};

export type StaffPermissionCatalogItem = {
  module: AdminTab;
  label: string;
  actions: readonly StaffPermissionAction[];
  locationScoped?: boolean;
};

export const STAFF_PERMISSION_CATALOG: readonly StaffPermissionCatalogItem[] = [
  { module: 'dashboard', label: 'Tổng quan', actions: ['view'] },
  { module: 'properties', label: 'Bất động sản', actions: ['view', 'create', 'edit', 'delete', 'publish', 'manage_media', 'manage_seo'], locationScoped: true },
  { module: 'property-verification', label: 'Hồ sơ kiểm tra', actions: ['view', 'approve', 'reject'], locationScoped: true },
  { module: 'leads', label: 'Leads / CRM', actions: ['view', 'edit'] },
  { module: 'chat-sessions', label: 'Phiên chat', actions: ['view', 'edit'] },
  { module: 'nurture', label: 'Nuôi dưỡng', actions: ['view', 'edit'] },
  { module: 'user-listings', label: 'Duyệt tin đăng', actions: ['view', 'edit', 'approve', 'reject', 'manage_media', 'manage_seo'], locationScoped: true },
  { module: 'users', label: 'Khách hàng / CRM', actions: ['view', 'edit'] },
  { module: 'agent-profiles', label: 'Hồ sơ công khai', actions: ['view', 'edit', 'publish'] },
  { module: 'projects', label: 'Dự án', actions: ['view', 'create', 'edit', 'delete', 'publish'], locationScoped: true },
  { module: 'news', label: 'Tin tức', actions: ['view', 'create', 'edit', 'delete', 'publish', 'manage_seo'], locationScoped: true },
  { module: 'news-categories', label: 'Danh mục tin tức', actions: ['view', 'edit'] },
  { module: 'testimonials', label: 'Đánh giá', actions: ['view', 'create', 'edit', 'delete'] },
  { module: 'cms', label: 'Nội dung trang', actions: ['view', 'edit'] },
  { module: 'banners', label: 'Banners', actions: ['view', 'edit'] },
  { module: 'featured-sections', label: 'Tin nổi bật', actions: ['view', 'edit'] },
  { module: 'page-builder', label: 'Bố cục trang', actions: ['view', 'edit'] },
  { module: 'home-experience', label: 'Trải nghiệm trang chủ', actions: ['view', 'edit'] },
  { module: 'pages', label: 'Quản lý trang', actions: ['view', 'edit'] },
  { module: 'neighborhoods', label: 'Khu dân cư', actions: ['view', 'create', 'edit', 'delete'], locationScoped: true },
  { module: 'menu', label: 'Menu điều hướng', actions: ['view', 'edit'] },
  { module: 'seo-geo', label: 'SEO / GEO', actions: ['view', 'edit'], locationScoped: true },
  { module: 'settings', label: 'Cài đặt', actions: ['view', 'edit'] },
  { module: 'footer', label: 'Footer', actions: ['view', 'edit'] },
  { module: 'backup', label: 'Sao lưu dữ liệu', actions: ['view', 'create'] },
  { module: 'ai-analytics', label: 'AI Phân tích', actions: ['view'] },
  { module: 'google-analytics', label: 'Thống kê website', actions: ['view'] },
  { module: 'ai-chat', label: 'Đào tạo AI', actions: ['view', 'edit'] },
  { module: 'ai-rag', label: 'RAG / Tri thức AI', actions: ['view', 'edit'] },
];

export const STAFF_PERMISSION_ACTION_LABELS: Record<StaffPermissionAction, string> = {
  view: 'Xem',
  create: 'Tạo mới',
  edit: 'Chỉnh sửa',
  delete: 'Xóa',
  publish: 'Đăng / xuất bản',
  approve: 'Duyệt',
  reject: 'Từ chối',
  manage_media: 'Quản lý media',
  manage_seo: 'Quản lý SEO',
  manage_permissions: 'Cấp quyền',
};

export const STAFF_PERMISSION_SCOPE_LABELS: Record<StaffPermissionScopeKind, string> = {
  global: 'Toàn quốc',
  area: 'Tỉnh / thành',
  district: 'Quận / huyện',
  ward: 'Phường / xã',
  neighborhood: 'Khu dân cư',
};

export function canUseStaffPermission(
  permissions: readonly StaffPermission[],
  module: AdminTab,
  action: StaffPermissionAction,
): boolean {
  return permissions.some(permission =>
    permission.module === module && permission.action === action,
  );
}

export function visibleTabsFromPermissions(permissions: readonly StaffPermission[]): AdminTab[] {
  return STAFF_PERMISSION_CATALOG
    .filter(item => canUseStaffPermission(permissions, item.module, 'view'))
    .map(item => item.module);
}

export function permissionKey(permission: Pick<StaffPermission, 'module' | 'action' | 'scope_kind' | 'scope_id'>): string {
  return [permission.module, permission.action, permission.scope_kind, permission.scope_id ?? ''].join(':');
}
