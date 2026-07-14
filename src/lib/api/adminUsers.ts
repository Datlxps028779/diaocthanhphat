import { supabase } from '../supabase';
import type { UserListing, UserMedia } from '../supabase';

// Client gọi API route /api/admin/users. Đính access_token của phiên hiện tại làm
// Bearer để route xác thực caller là admin (route tự kiểm role qua RLS). Mọi thao
// tác ghi (đổi role/khóa) chạy server-side bằng service_role — client chỉ ra lệnh.

export interface AdminUserRow {
  id: string;
  display_name: string | null;
  phone: string | null;
  role: 'user' | 'staff' | 'admin';
  created_at: string;
  email: string | null;   // null nếu server chưa cấu hình service_role
  banned: boolean;
}

async function authHeader(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token ?? '';
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

// Trả kèm cờ serviceRole để UI báo nếu tính năng email/khóa chưa dùng được.
export async function getAdminUsers(): Promise<{ users: AdminUserRow[]; serviceRole: boolean }> {
  const res = await fetch('/api/admin/users', { headers: await authHeader() });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Không tải được danh sách người dùng.');
  return { users: json.users ?? [], serviceRole: !!json.serviceRole };
}

async function postAction(body: Record<string, unknown>): Promise<void> {
  const res = await fetch('/api/admin/users', {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? 'Thao tác thất bại.');
}

export async function setUserRole(userId: string, role: 'user' | 'staff' | 'admin'): Promise<void> {
  await postAction({ action: 'set_role', userId, role });
}
export async function banUser(userId: string): Promise<void> {
  await postAction({ action: 'ban', userId });
}
export async function unbanUser(userId: string): Promise<void> {
  await postAction({ action: 'unban', userId });
}

// Hoạt động của MỘT user (dùng ở chi tiết admin). Đọc trực tiếp qua RLS admin sẵn có:
// user_listings có um... policy admin, user_media có um_select_admin. KHÔNG gồm yêu
// thích vì user_favorites chỉ cho chủ sở hữu đọc (không có policy admin).
export interface UserActivity {
  listings: UserListing[];
  media: UserMedia[];
}
export async function getUserActivity(userId: string): Promise<UserActivity> {
  const [listingsRes, mediaRes] = await Promise.all([
    supabase
      .from('user_listings')
      .select('*, areas(id,name,slug), property_types(id,name,slug)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('user_media')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ]);
  return {
    listings: (listingsRes.data ?? []) as UserListing[],
    media: (mediaRes.data ?? []) as UserMedia[],
  };
}
