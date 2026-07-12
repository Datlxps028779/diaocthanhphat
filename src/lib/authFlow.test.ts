import { describe, it, expect } from 'vitest';
import { interpretSignUpResult } from './authFlow';

describe('interpretSignUpResult', () => {
  it('có session → đã đăng nhập luôn (Confirm email TẮT)', () => {
    const r = interpretSignUpResult({ user: { id: 'u1', identities: [{ id: 'i1' }] }, session: { access_token: 'x' } });
    expect(r).toBe('logged_in');
  });

  it('user có identities, session null → cần xác nhận email (đăng ký mới, Confirm email BẬT)', () => {
    const r = interpretSignUpResult({ user: { id: 'u1', identities: [{ id: 'i1' }] }, session: null });
    expect(r).toBe('needs_confirm');
  });

  it('identities rỗng → email đã đăng ký (Supabase chống dò email, KHÔNG gửi mail)', () => {
    const r = interpretSignUpResult({ user: { id: 'u1', identities: [] }, session: null });
    expect(r).toBe('already_registered');
  });

  it('user null → coi như cần xác nhận (không suy ra được trùng, không chặn nhầm)', () => {
    const r = interpretSignUpResult({ user: null, session: null });
    expect(r).toBe('needs_confirm');
  });

  it('identities undefined (schema lạ) → không kết luận trùng, cho qua nhánh xác nhận', () => {
    const r = interpretSignUpResult({ user: { id: 'u1' }, session: null });
    expect(r).toBe('needs_confirm');
  });
});
