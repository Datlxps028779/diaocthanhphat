import { describe, it, expect } from 'vitest';
import { nextListingPageParam } from './listingPaging';

describe('nextListingPageParam — nối trang cho "Tải thêm"', () => {
  it('còn tin thì trả trang kế tiếp theo trang đang đứng', () => {
    // Đứng ở trang 1, vừa tải 16/40 tin → trang kế là 2.
    expect(nextListingPageParam({ startPage: 1, perPage: 16, total: 40, loaded: 16 })).toBe(2);
    // Đã nối 2 trang (32/40) → trang kế là 3.
    expect(nextListingPageParam({ startPage: 1, perPage: 16, total: 40, loaded: 32 })).toBe(3);
  });

  it('hết tin thì dừng', () => {
    expect(nextListingPageParam({ startPage: 1, perPage: 16, total: 32, loaded: 32 })).toBeUndefined();
    expect(nextListingPageParam({ startPage: 1, perPage: 16, total: 14, loaded: 14 })).toBeUndefined();
    expect(nextListingPageParam({ startPage: 1, perPage: 16, total: 0, loaded: 0 })).toBeUndefined();
  });

  it('deep-link giữa chừng chỉ tính phần còn lại, không tải lại từ đầu', () => {
    // Vào thẳng ?page=3: 32 tin trước đó coi như đã bỏ qua, vừa tải 16 → tổng 48/100.
    expect(nextListingPageParam({ startPage: 3, perPage: 16, total: 100, loaded: 16 })).toBe(4);
    // Trang cuối của deep-link → dừng.
    expect(nextListingPageParam({ startPage: 3, perPage: 16, total: 48, loaded: 16 })).toBeUndefined();
  });

  it('trang cuối lẻ (không đủ perPage) vẫn dừng đúng', () => {
    expect(nextListingPageParam({ startPage: 1, perPage: 16, total: 20, loaded: 20 })).toBeUndefined();
    expect(nextListingPageParam({ startPage: 1, perPage: 16, total: 20, loaded: 16 })).toBe(2);
  });
});
