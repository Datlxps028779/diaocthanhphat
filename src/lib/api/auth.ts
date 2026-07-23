import { supabase, type Profile } from '../supabase';
import { isElevatedRole } from '../authGuard';
import type { Role } from '../adminAccess';

// ─── AUTH ─────────────────────────────────────────────────────────────────────
// Đăng ký. emailRedirectTo dựng theo origin hiện tại → link xác nhận trong mail
// quay về đúng host (localhost khi dev, domain thật khi prod) tại /xac-nhan-email.
// KHÔNG upsert profiles ở đây: trigger DB handle_new_user() (SECURITY DEFINER) tạo
// profile server-side, tránh RLS chặn khi email confirm bật (lúc này chưa có session).
// display_name + phone gửi qua user metadata để trigger đọc.
export async function signUp(email: string, password: string, displayName: string, phone: string) {
  const emailRedirectTo = typeof window !== 'undefined' ? `${window.location.origin}/xac-nhan-email` : undefined;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: displayName, phone },
      emailRedirectTo,
    },
  });
  if (error) throw error;
  return data;
}
export async function signIn(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}
export async function signOut() { await supabase.auth.signOut(); }

// Gửi lại email xác nhận đăng ký khi user chưa kích hoạt tài khoản (mail lạc/hết hạn).
// Dùng cùng emailRedirectTo như signUp để link quay về /xac-nhan-email đúng host.
export async function resendConfirmation(email: string) {
  const emailRedirectTo = typeof window !== 'undefined' ? `${window.location.origin}/xac-nhan-email` : undefined;
  const { error } = await supabase.auth.resend({ type: 'signup', email, options: { emailRedirectTo } });
  if (error) throw error;
}

// Gửi email đặt lại mật khẩu. redirectTo trỏ về /dat-lai-mat-khau (cùng cơ chế host
// như xác nhận email) — user bấm link trong mail sẽ vào trang đó với session recovery
// tạm, rồi gọi updatePassword. Lưu ý: Supabase bật chống dò email nên hàm này KHÔNG
// báo lỗi khi email chưa đăng ký (tránh lộ email nào tồn tại) — UI luôn báo "đã gửi".
export async function requestPasswordReset(email: string) {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/dat-lai-mat-khau` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

// Đặt mật khẩu mới. Chỉ chạy được khi đã có session (recovery từ link mail hoặc đang
// đăng nhập). Trang /dat-lai-mat-khau kiểm tra session trước khi cho nhập.
export async function updatePassword(newPassword: string) {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
}
export async function getProfile(): Promise<Profile | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
  return data as Profile | null;
}
export async function getAdminRole(): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return false;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return isElevatedRole((data as { role: string } | null)?.role);
}
// Lấy role của session hiện tại (đọc profiles). Dùng để chặn admin đăng nhập ở cổng
// người dùng: sau signIn/recovery, nếu role cao thì cắt phiên ngay. maybeSingle → null
// nếu chưa có profile (người dùng mới) → không chặn nhầm.
export async function getCurrentRole(): Promise<string | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  return (data as { role: string } | null)?.role ?? null;
}
// Role dùng để gate admin panel (admin|staff|user|null). Dùng ở AdminClient để
// quyết được vào panel + lọc tab. Chuẩn hoá về kiểu Role của adminAccess.
export async function getPanelRole(): Promise<Role | null> {
  const role = await getCurrentRole();
  return role === 'admin' || role === 'staff' || role === 'user' ? role : null;
}
export async function updateProfile(updates: Partial<Profile>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase.from('profiles').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', user.id);
  if (error) throw error;
}
