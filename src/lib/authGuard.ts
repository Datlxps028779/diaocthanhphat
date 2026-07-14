// Chính sách bảo mật: chặn tài khoản quyền cao (admin/staff) khỏi cổng người dùng
// thường. Tài khoản quản trị/nhân viên chỉ được đăng nhập / đặt lại mật khẩu qua
// /quantrihethong, để thu hẹp bề mặt tấn công — không lộ/khai thác qua modal công khai.
// role lưu ở profiles.role ('user' | 'staff' | 'admin'). Trả false cho null/undefined/
// role lạ để KHÔNG chặn nhầm người dùng thường hoặc tài khoản chưa có profile.
export function isElevatedRole(role: string | null | undefined): boolean {
  if (typeof role !== 'string') return false;
  const r = role.toLowerCase();
  return r === 'admin' || r === 'staff';
}
