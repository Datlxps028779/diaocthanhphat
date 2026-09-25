// Tài khoản quyền cao (admin/staff) sau đăng nhập thường được đưa về workspace riêng.
// Luồng đặt lại mật khẩu dùng recovery session cô lập, không tạo phiên đăng nhập công khai.
// role lưu ở profiles.role ('user' | 'staff' | 'admin'). Trả false cho null/undefined/
// role lạ để KHÔNG chặn nhầm người dùng thường hoặc tài khoản chưa có profile.
export function isElevatedRole(role: string | null | undefined): boolean {
  return privateWorkspacePath(role) !== null;
}

// Đích cổng riêng theo đúng vai trò. Không dùng isElevatedRole() làm đích vì staff
// không qua được cổng owner-MFA /quantrihethong.
export function privateWorkspacePath(role: string | null | undefined): '/noi-bo' | '/quantrihethong' | null {
  if (typeof role !== 'string') return null;
  switch (role.toLowerCase()) {
    case 'staff': return '/noi-bo';
    case 'admin': return '/quantrihethong';
    default: return null;
  }
}
