import { describe, it, expect } from 'vitest';
import { isElevatedRole, privateWorkspacePath } from './authGuard';

// Chính sách bảo mật: tài khoản có quyền cao (admin) KHÔNG được phép đăng nhập hay
// đặt lại mật khẩu qua cổng người dùng thường — chỉ được vào qua /quantrihethong.
// Đề phòng tài khoản quản trị bị tấn công qua bề mặt công khai (modal user).
describe('isElevatedRole', () => {
  it('role admin → true (phải chặn ở cổng người dùng)', () => {
    expect(isElevatedRole('admin')).toBe(true);
  });

  it('role staff → true (nhân viên cũng là quyền cao, chặn ở cổng người dùng)', () => {
    expect(isElevatedRole('staff')).toBe(true);
    expect(isElevatedRole('STAFF')).toBe(true);
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

describe('privateWorkspacePath', () => {
  it('đưa nhân viên tới cổng nội bộ thay vì cổng owner-MFA', () => {
    expect(privateWorkspacePath('staff')).toBe('/noi-bo');
    expect(privateWorkspacePath('STAFF')).toBe('/noi-bo');
  });

  it('chỉ đưa admin tới cổng quản trị owner', () => {
    expect(privateWorkspacePath('admin')).toBe('/quantrihethong');
  });

  it('không có cổng riêng cho user, role lạ hoặc chưa có profile', () => {
    expect(privateWorkspacePath('user')).toBeNull();
    expect(privateWorkspacePath('editor')).toBeNull();
    expect(privateWorkspacePath(null)).toBeNull();
    expect(privateWorkspacePath(undefined)).toBeNull();
  });
});
