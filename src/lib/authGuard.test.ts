import { describe, it, expect } from 'vitest';
import { isElevatedRole } from './authGuard';

// Chính sách bảo mật: tài khoản có quyền cao (admin) KHÔNG được phép đăng nhập hay
// đặt lại mật khẩu qua cổng người dùng thường — chỉ được vào qua /quantrihethong.
// Đề phòng tài khoản quản trị bị tấn công qua bề mặt công khai (modal user).
describe('isElevatedRole', () => {
  it('role admin → true (phải chặn ở cổng người dùng)', () => {
    expect(isElevatedRole('admin')).toBe(true);
  });

  it('role user → false (cho phép)', () => {
    expect(isElevatedRole('user')).toBe(false);
  });

  it('null/undefined (chưa có profile) → false, không chặn nhầm người dùng mới', () => {
    expect(isElevatedRole(null)).toBe(false);
    expect(isElevatedRole(undefined)).toBe(false);
  });

  it('chuỗi rỗng hoặc role lạ → false (chỉ chặn đúng quyền cao đã biết)', () => {
    expect(isElevatedRole('')).toBe(false);
    expect(isElevatedRole('editor')).toBe(false);
  });

  it('không phân biệt hoa thường (ADMIN vẫn bị chặn)', () => {
    expect(isElevatedRole('ADMIN')).toBe(true);
    expect(isElevatedRole('Admin')).toBe(true);
  });
});
