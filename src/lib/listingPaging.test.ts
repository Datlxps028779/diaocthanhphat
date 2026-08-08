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

describe('feed tin tức — nối trang NEWS_PER_PAGE=12 không lặp ID', () => {
  const PER_PAGE = 12;

  it('nối tới hết rồi dừng đúng số bài', () => {
    // 30 bài, mỗi trang 12 → trang 1 (12), 2 (24), 3 (30) rồi dừng.
    expect(nextListingPageParam({ startPage: 1, perPage: PER_PAGE, total: 30, loaded: 12 })).toBe(2);
    expect(nextListingPageParam({ startPage: 1, perPage: PER_PAGE, total: 30, loaded: 24 })).toBe(3);
    expect(nextListingPageParam({ startPage: 1, perPage: PER_PAGE, total: 30, loaded: 30 })).toBeUndefined();
  });

  it('flatten các trang liên tiếp không lặp ID (sort ổn định created_at,id DESC)', () => {
    // Mô phỏng .range() phía server với thứ tự ổn định: page N trả id giảm dần liên
    // tục. Nối các trang bằng flatMap phải cho tập ID duy nhất, đúng tổng.
    const total = 30;
    const pageOf = (page: number) =>
      Array.from({ length: Math.min(PER_PAGE, total - (page - 1) * PER_PAGE) }, (_, i) => ({
        id: `n-${total - ((page - 1) * PER_PAGE + i)}`,
      }));
    const pages: { id: string }[][] = [];
    let page = 1;
    // Nạp trang đầu, rồi hỏi helper trang kế cho tới khi dừng.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      pages.push(pageOf(page));
      const loaded = pages.reduce((s, p) => s + p.length, 0);
      const next = nextListingPageParam({ startPage: 1, perPage: PER_PAGE, total, loaded });
      if (next === undefined) break;
      page = next;
    }
    const flat = pages.flat();
    const ids = flat.map(a => a.id);
    expect(flat.length).toBe(total);
    expect(new Set(ids).size).toBe(total); // không lặp ID
  });

  it('danh mục rỗng thì không có trang kế', () => {
    expect(nextListingPageParam({ startPage: 1, perPage: PER_PAGE, total: 0, loaded: 0 })).toBeUndefined();
  });
});
