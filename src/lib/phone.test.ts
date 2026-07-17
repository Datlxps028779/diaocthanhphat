import { describe, expect, it } from 'vitest';
import { isValidVnPhone, normalizeVnPhone } from './phone';

describe('normalizeVnPhone', () => {
  it('bỏ ký tự thừa và giữ 10 số', () => {
    expect(normalizeVnPhone('090 123 4567')).toBe('0901234567');
    expect(normalizeVnPhone('098-765-4321')).toBe('0987654321');
  });

  it('quy +84 / 84 về đầu 0', () => {
    expect(normalizeVnPhone('+84 90 123 4567')).toBe('0901234567');
    expect(normalizeVnPhone('84901234567')).toBe('0901234567');
  });
});

describe('isValidVnPhone', () => {
  it('nhận số di động VN hợp lệ (03/05/07/08/09)', () => {
    for (const p of ['0901234567', '0387654321', '0521234567', '0791234567', '0812345678']) {
      expect(isValidVnPhone(p)).toBe(true);
    }
  });

  it('nhận số nhập kèm khoảng trắng và +84', () => {
    expect(isValidVnPhone('090 123 4567')).toBe(true);
    expect(isValidVnPhone('+84 987 654 321')).toBe(true);
  });

  it('từ chối số sai độ dài, sai đầu số, hoặc rác', () => {
    expect(isValidVnPhone('')).toBe(false);
    expect(isValidVnPhone('123')).toBe(false);
    expect(isValidVnPhone('0123456789')).toBe(false);   // đầu 01 không hợp lệ
    expect(isValidVnPhone('0901234')).toBe(false);        // thiếu số
    expect(isValidVnPhone('09012345678')).toBe(false);    // thừa số
    expect(isValidVnPhone('abcdefghij')).toBe(false);
  });
});
