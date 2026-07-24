// Phân quyền truy cập admin panel theo role (thuần, test được).
// admin: toàn quyền. staff (nhân viên sales): CHỈ CRM khách hàng + duyệt tin đăng.
// user: không vào panel. Nguồn quyền thật là RLS ở DB (is_admin/is_admin_or_staff);
// đây là lớp gate UI để staff không thấy khu nhạy cảm.
import type { AdminTab } from '../components/admin/types';

export type Role = 'user' | 'staff' | 'admin';

// Toàn bộ tab (khớp AdminTab). Giữ đồng bộ với navItems trong AdminPanel.
export const ALL_TABS: AdminTab[] = [
  'dashboard', 'properties', 'leads', 'chat-sessions', 'nurture', 'user-listings', 'users', 'staff', 'projects',
  'news', 'testimonials', 'cms', 'settings', 'banners', 'featured-sections',
  'page-builder', 'pages', 'backup', 'ai-analytics', 'ai-chat', 'seo-geo',
];

// Tab staff được thấy: chăm sóc khách + duyệt tin đăng.
export const STAFF_TABS: AdminTab[] = ['leads', 'chat-sessions', 'user-listings'];

export function canAccessPanel(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

export function visibleTabs(role: Role | null | undefined): AdminTab[] {
  if (role === 'admin') return [...ALL_TABS];
  if (role === 'staff') return [...STAFF_TABS];
  return [];
}
