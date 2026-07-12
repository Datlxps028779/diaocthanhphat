// Chính sách bảo mật: chặn tài khoản quyền cao (admin) khỏi cổng người dùng thường.
// Tài khoản quản trị chỉ được đăng nhập / đặt lại mật khẩu qua /quantrihethong, để
// thu hẹp bề mặt tấn công — không cho lộ/khai thác qua modal đăng nhập công khai.
// role lưu ở profiles.role ('user' | 'admin'). Trả false cho null/undefined/role lạ
// để KHÔNG chặn nhầm người dùng thường hoặc tài khoản chưa có profile.
export function isElevatedRole(role: string | null | undefined): boolean {
  return typeof role === 'string' && role.toLowerCase() === 'admin';
}
