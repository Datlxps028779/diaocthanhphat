import { supabase, type Profile } from '../supabase';

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
  return (data as { role: string } | null)?.role === 'admin';
}
export async function updateProfile(updates: Partial<Profile>): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const { error } = await supabase.from('profiles').update({ ...updates, updated_at: new Date().toISOString() }).eq('id', user.id);
  if (error) throw error;
}
