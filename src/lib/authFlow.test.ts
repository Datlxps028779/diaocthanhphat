import { describe, it, expect } from 'vitest';
import { friendlyIdentityConflictError, interpretSignUpResult, isEmailNotConfirmedError } from './authFlow';

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

describe('isEmailNotConfirmedError', () => {
  it('nhận diện lỗi Supabase "Email not confirmed" (không phân biệt hoa thường)', () => {
    expect(isEmailNotConfirmedError('Email not confirmed')).toBe(true);
    expect(isEmailNotConfirmedError('AuthApiError: email not confirmed')).toBe(true);
  });

  it('lỗi đăng nhập khác hoặc rỗng → false', () => {
    expect(isEmailNotConfirmedError('Invalid login credentials')).toBe(false);
    expect(isEmailNotConfirmedError(null)).toBe(false);
    expect(isEmailNotConfirmedError('')).toBe(false);
  });
});

describe('friendlyIdentityConflictError', () => {
  it('dịch unique phone từ PostgREST thành thông báo rõ ràng', () => {
    expect(friendlyIdentityConflictError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "profiles_normalized_phone_unique"',
    })).toBe('Số điện thoại này đã được sử dụng cho một tài khoản khác.');
  });

  it('dịch lỗi email đã đăng ký', () => {
    expect(friendlyIdentityConflictError(new Error('User already registered')))
      .toBe('Email này đã được đăng ký. Vui lòng đăng nhập.');
  });

  it('không khẳng định dữ liệu nào trùng khi GoTrue che lỗi trigger', () => {
    expect(friendlyIdentityConflictError(new Error('Database error saving new user')))
      .toBe('Không thể tạo tài khoản. Email hoặc số điện thoại có thể đã được sử dụng.');
  });

  it('không nuốt lỗi không liên quan', () => {
    expect(friendlyIdentityConflictError({ code: '42501', message: 'permission denied' })).toBeNull();
    expect(friendlyIdentityConflictError(null)).toBeNull();
  });
});
