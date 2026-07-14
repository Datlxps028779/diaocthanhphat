import { describe, it, expect } from 'vitest';
import { validateAdminUserAction } from './adminUserAction';

// Validator ở ranh giới API route: nhận body JSON tuỳ ý từ client (không tin được),
// trả về action đã chuẩn hoá hoặc null. Route dựa vào đây để từ chối payload rác
// trước khi đụng service_role (bỏ qua RLS → phải chặt chẽ).
describe('validateAdminUserAction', () => {
  it('set_role hợp lệ (user) → chuẩn hoá', () => {
    expect(validateAdminUserAction({ action: 'set_role', userId: 'u1', role: 'user' }))
      .toEqual({ action: 'set_role', userId: 'u1', role: 'user' });
  });

  it('set_role hợp lệ (admin) → chuẩn hoá', () => {
    expect(validateAdminUserAction({ action: 'set_role', userId: 'u1', role: 'admin' }))
      .toEqual({ action: 'set_role', userId: 'u1', role: 'admin' });
  });

  it('set_role hợp lệ (staff) → chuẩn hoá', () => {
    expect(validateAdminUserAction({ action: 'set_role', userId: 'u1', role: 'staff' }))
      .toEqual({ action: 'set_role', userId: 'u1', role: 'staff' });
  });

  it('set_role role lạ → null (chỉ nhận user|staff|admin)', () => {
    expect(validateAdminUserAction({ action: 'set_role', userId: 'u1', role: 'superuser' })).toBeNull();
  });

  it('ban hợp lệ → chuẩn hoá', () => {
    expect(validateAdminUserAction({ action: 'ban', userId: 'u1' }))
      .toEqual({ action: 'ban', userId: 'u1' });
  });

  it('unban hợp lệ → chuẩn hoá', () => {
    expect(validateAdminUserAction({ action: 'unban', userId: 'u1' }))
      .toEqual({ action: 'unban', userId: 'u1' });
  });

  it('thiếu userId → null', () => {
    expect(validateAdminUserAction({ action: 'ban' })).toBeNull();
    expect(validateAdminUserAction({ action: 'set_role', role: 'user' })).toBeNull();
  });

  it('userId rỗng / không phải string → null', () => {
    expect(validateAdminUserAction({ action: 'ban', userId: '' })).toBeNull();
    expect(validateAdminUserAction({ action: 'ban', userId: 123 })).toBeNull();
  });

  it('action lạ → null', () => {
    expect(validateAdminUserAction({ action: 'delete_everything', userId: 'u1' })).toBeNull();
  });

  it('body không phải object → null', () => {
    expect(validateAdminUserAction(null)).toBeNull();
    expect(validateAdminUserAction(undefined)).toBeNull();
    expect(validateAdminUserAction('ban')).toBeNull();
    expect(validateAdminUserAction(42)).toBeNull();
  });

  describe('create_staff (tạo tài khoản nhân viên mới)', () => {
    it('hợp lệ (staff) → chuẩn hoá, chuẩn hoá email về lowercase + trim, không có userId', () => {
      expect(validateAdminUserAction({ action: 'create_staff', email: '  NV@Shop.VN ', password: 'matkhau123', role: 'staff', display_name: '  An  ' }))
        .toEqual({ action: 'create_staff', email: 'nv@shop.vn', password: 'matkhau123', role: 'staff', display_name: 'An' });
    });

    it('hợp lệ (admin)', () => {
      expect(validateAdminUserAction({ action: 'create_staff', email: 'a@b.co', password: 'abcdef', role: 'admin' }))
        .toEqual({ action: 'create_staff', email: 'a@b.co', password: 'abcdef', role: 'admin', display_name: null });
    });

    it('role user → null (tab NV chỉ tạo staff/admin)', () => {
      expect(validateAdminUserAction({ action: 'create_staff', email: 'a@b.co', password: 'abcdef', role: 'user' })).toBeNull();
    });

    it('email sai định dạng → null', () => {
      expect(validateAdminUserAction({ action: 'create_staff', email: 'khong-phai-email', password: 'abcdef', role: 'staff' })).toBeNull();
    });

    it('mật khẩu dưới 6 ký tự → null', () => {
      expect(validateAdminUserAction({ action: 'create_staff', email: 'a@b.co', password: '123', role: 'staff' })).toBeNull();
    });

    it('thiếu email/password → null', () => {
      expect(validateAdminUserAction({ action: 'create_staff', password: 'abcdef', role: 'staff' })).toBeNull();
      expect(validateAdminUserAction({ action: 'create_staff', email: 'a@b.co', role: 'staff' })).toBeNull();
    });
  });
});
