import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { supabase, type Profile } from '../supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from '../env';
import { isElevatedRole } from '../authGuard';
import type { Role } from '../adminAccess';
import { isValidVnPhone, normalizeVnPhone } from '../phone';

const PASSWORD_RECOVERY_STORAGE_KEY = 'cnv-password-recovery';
let passwordResetClient: SupabaseClient | null = null;
let passwordResetVerification: { tokenHash: string; promise: Promise<Session> } | null = null;

function getPasswordResetClient() {
  if (typeof window === 'undefined') throw new Error('Luồng đặt lại mật khẩu chỉ chạy trên trình duyệt.');
  if (!passwordResetClient) {
    passwordResetClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        flowType: 'implicit',
        detectSessionInUrl: false,
        persistSession: true,
        autoRefreshToken: true,
        storage: window.sessionStorage,
        storageKey: PASSWORD_RECOVERY_STORAGE_KEY,
      },
    });
  }
  return passwordResetClient;
}

// ─── AUTH ─────────────────────────────────────────────────────────────────────
// Đăng ký. emailRedirectTo dựng theo origin hiện tại → link xác nhận trong mail
// quay về đúng host (localhost khi dev, domain thật khi prod) tại /xac-nhan-email.
// KHÔNG upsert profiles ở đây: trigger DB handle_new_user() (SECURITY DEFINER) tạo
// profile server-side, tránh RLS chặn khi email confirm bật (lúc này chưa có session).
// display_name + phone gửi qua user metadata để trigger đọc.
export async function signUp(email: string, password: string, displayName: string, phone: string) {
  const canonicalName = displayName.trim();
  const canonicalPhone = normalizeVnPhone(phone);
  if (!canonicalName) throw new Error('Họ tên là bắt buộc.');
  if (!isValidVnPhone(canonicalPhone)) throw new Error('Số điện thoại Việt Nam không hợp lệ.');
  const emailRedirectTo = typeof window !== 'undefined' ? `${window.location.origin}/xac-nhan-email` : undefined;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: canonicalName, phone: canonicalPhone },
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

// Gửi email đặt lại mật khẩu bằng client recovery cô lập. Template email đưa token_hash
// về /dat-lai-mat-khau; trang đó xác thực và đổi mật khẩu mà không tạo phiên app chính.
export async function requestPasswordReset(email: string) {
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/dat-lai-mat-khau` : undefined;
  const { error } = await getPasswordResetClient().auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function verifyPasswordResetToken(tokenHash: string) {
  if (passwordResetVerification?.tokenHash === tokenHash) {
    return passwordResetVerification.promise;
  }

  const promise = (async () => {
    const { data, error } = await getPasswordResetClient().auth.verifyOtp({
      token_hash: tokenHash,
      type: 'recovery',
    });
    if (error) throw error;
    if (!data.session) throw new Error('Không thiết lập được phiên đặt lại mật khẩu.');
    return data.session;
  })();

  passwordResetVerification = { tokenHash, promise };
  try {
    return await promise;
  } catch (error) {
    if (passwordResetVerification?.promise === promise) passwordResetVerification = null;
    throw error;
  }
}

export async function hasActivePasswordResetSession() {
  const { data: { user }, error } = await getPasswordResetClient().auth.getUser();
  return !error && Boolean(user);
}

export async function updateRecoveredPassword(newPassword: string) {
  const client = getPasswordResetClient();
  const { data: { user }, error: sessionError } = await client.auth.getUser();
  if (sessionError || !user) {
    throw new Error('Phiên đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu gửi lại liên kết.');
  }

  const { error } = await client.auth.updateUser({ password: newPassword });
  if (error) {
    if (error.message.toLowerCase().includes('auth session missing')) {
      throw new Error('Phiên đặt lại mật khẩu đã hết hạn. Vui lòng yêu cầu gửi lại liên kết.');
    }
    throw error;
  }

  await client.auth.signOut({ scope: 'global' }).catch(() => undefined);
  window.sessionStorage.removeItem(PASSWORD_RECOVERY_STORAGE_KEY);
  passwordResetClient = null;
  passwordResetVerification = null;
}

// Đổi mật khẩu cho session đăng nhập chính. Luồng email recovery dùng
// updateRecoveredPassword để không trộn recovery session với phiên ứng dụng.
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
