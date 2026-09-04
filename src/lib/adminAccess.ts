// Phân quyền truy cập admin panel theo role (thuần, test được).
// admin: toàn quyền. staff (nhân viên sales): CHỈ CRM khách hàng.
// Nguồn quyền thật là RLS ở DB; đây là lớp gate UI để staff không thấy khu nhạy cảm.
import type { AdminTab } from '../components/admin/types';

export type Role = 'user' | 'staff' | 'admin';

// Toàn bộ tab (khớp AdminTab). Giữ đồng bộ với navItems trong AdminPanel.
export const ALL_TABS: AdminTab[] = [
  'dashboard', 'properties', 'property-verification', 'leads', 'chat-sessions', 'nurture', 'user-listings', 'users', 'staff', 'agent-profiles', 'projects',
  'news', 'news-categories', 'testimonials', 'cms', 'settings', 'footer', 'banners', 'featured-sections',
  'page-builder', 'home-experience', 'pages', 'neighborhoods', 'menu', 'backup', 'ai-analytics', 'google-analytics', 'ai-chat', 'ai-rag', 'seo-geo',
];

// Tab staff được thấy: chăm sóc khách hàng, lead và phiên chat.
export const STAFF_TABS: AdminTab[] = ['agent-profiles', 'leads', 'chat-sessions', 'users'];

export function canAccessPanel(role: Role | null | undefined): boolean {
  return role === 'admin' || role === 'staff';
}

export function visibleTabs(role: Role | null | undefined): AdminTab[] {
  if (role === 'admin') return [...ALL_TABS];
  if (role === 'staff') return [...STAFF_TABS];
  return [];
}
