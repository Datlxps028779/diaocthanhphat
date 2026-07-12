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
