import { describe, it, expect } from 'vitest';
import { extractErrorMessage } from './errorMessage';

describe('extractErrorMessage — bóc message thật từ mọi kiểu lỗi', () => {
  it('Error instance → lấy .message', () => {
    expect(extractErrorMessage(new Error('Hết hạn phiên'))).toBe('Hết hạn phiên');
  });

  it('PostgrestError (object thường, không phải Error) → lấy .message', () => {
    const pgErr = { message: 'new row violates row-level security policy', code: '42501', details: null, hint: null };
    expect(extractErrorMessage(pgErr)).toBe('new row violates row-level security policy');
  });

  it('object có details/hint → ghép thêm để dễ chẩn đoán', () => {
    const pgErr = { message: 'null value in column "city"', details: 'Failing row contains ...', hint: null, code: '23502' };
    const out = extractErrorMessage(pgErr);
    expect(out).toContain('null value in column "city"');
    expect(out).toContain('Failing row contains');
  });

  it('object không message nhưng có details → dùng details', () => {
    expect(extractErrorMessage({ message: '', details: 'chi tiết lỗi' })).toBe('chi tiết lỗi');
  });

  it('chuỗi → trả nguyên chuỗi', () => {
    expect(extractErrorMessage('lỗi dạng chuỗi')).toBe('lỗi dạng chuỗi');
  });

  it('null/undefined/object rỗng → fallback', () => {
    expect(extractErrorMessage(null)).toBe('Có lỗi xảy ra');
    expect(extractErrorMessage(undefined)).toBe('Có lỗi xảy ra');
    expect(extractErrorMessage({})).toBe('Có lỗi xảy ra');
  });

  it('fallback tùy chỉnh được', () => {
    expect(extractErrorMessage(null, 'Không gửi được tin')).toBe('Không gửi được tin');
  });
});
