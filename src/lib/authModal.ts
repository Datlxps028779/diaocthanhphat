// Mở modal đăng nhập từ bất kỳ trang con nào. Modal sống ở SiteChrome (shell), trang
// con không nhận onShowAuth qua props — nên dùng global event như compare.ts. Sau khi
// đăng nhập, AuthProvider cập nhật user → trang gọi requestAuth sẽ tự re-render.
export const SHOW_AUTH_EVENT = 'dtp_show_auth';

export function requestAuth(mode: 'login' | 'register' = 'login'): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(SHOW_AUTH_EVENT, { detail: { mode } }));
  }
}
