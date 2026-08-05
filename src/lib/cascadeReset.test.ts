import { describe, it, expect } from 'vitest';
import { shouldResetChild } from './cascadeReset';

// Khi mở link khu vực (/mua-ban/binh-duong/thuan-an), areaId được seed rồi ổn định.
// Cơ chế "bỏ qua lần chạy đầu" không đủ: effect còn chạy lại lúc taxonomy tải xong,
// lần đó xoá mất district đã seed và URL rụt về /binh-duong.
describe('shouldResetChild — chỉ reset khi cha ĐỔI giá trị', () => {
  it('không reset ở lần chạy đầu (seed từ URL)', () => {
    expect(shouldResetChild(undefined, 'a1')).toBe(false);
  });

  it('không reset khi cha giữ nguyên giá trị (effect chạy lại)', () => {
    expect(shouldResetChild('a1', 'a1')).toBe(false);
  });

  it('reset khi user đổi sang khu vực khác', () => {
    expect(shouldResetChild('a1', 'a2')).toBe(true);
  });

  it('reset khi user xoá lựa chọn khu vực', () => {
    expect(shouldResetChild('a1', '')).toBe(true);
  });

  it('không reset khi từ rỗng lên có giá trị lần đầu sau mount', () => {
    // '' → 'a1' xảy ra khi taxonomy về muộn; district seed phải được giữ.
    expect(shouldResetChild('', 'a1')).toBe(false);
  });

  it('vẫn reset khi user chủ động đổi tiếp sau đó', () => {
    expect(shouldResetChild('a1', 'a3')).toBe(true);
  });
});
