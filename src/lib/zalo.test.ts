import { describe, expect, it } from 'vitest';
import { buildZaloHref } from './zalo';

describe('buildZaloHref', () => {
  it('dựng link từ số điện thoại', () => {
    expect(buildZaloHref('0901234567')).toBe('https://zalo.me/0901234567');
    expect(buildZaloHref('090 123 4567')).toBe('https://zalo.me/0901234567');
  });

  it('giữ nguyên URL đầy đủ, không nối tiền tố', () => {
    expect(buildZaloHref('https://zalo.me/g/abc123')).toBe('https://zalo.me/g/abc123');
    expect(buildZaloHref('http://zalo.me/0901234567')).toBe('http://zalo.me/0901234567');
  });

  it('bổ sung https khi thiếu scheme', () => {
    expect(buildZaloHref('zalo.me/0901234567')).toBe('https://zalo.me/0901234567');
  });

  it('dùng fallback khi contact rỗng/null', () => {
    expect(buildZaloHref(null, 'https://zalo.me/site')).toBe('https://zalo.me/site');
    expect(buildZaloHref('', '0909999999')).toBe('https://zalo.me/0909999999');
  });

  it('trả null khi không có nguồn nào', () => {
    expect(buildZaloHref(null, null)).toBeNull();
    expect(buildZaloHref('', '')).toBeNull();
  });
});
