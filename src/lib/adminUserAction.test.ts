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

  it('set_role role lạ → null (chỉ nhận user|admin)', () => {
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
});
