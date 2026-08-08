import { describe, it, expect, afterEach } from 'vitest';
import {
  NEWS_CATEGORIES,
  NEWS_CATEGORY_SLUGS,
  categoryToSlug,
  slugToCategory,
  setNewsCategorySlugMap,
} from './newsCategories';

// Đặt lại cache runtime về rỗng sau mỗi test để không rò rỉ trạng thái giữa các case.
afterEach(() => setNewsCategorySlugMap([]));

describe('newsCategories — map tĩnh (fallback khi chưa nạp DB)', () => {
  it('categoryToSlug trả slug đúng cho 5 nhãn gốc', () => {
    expect(categoryToSlug('Thị trường')).toBe('thi-truong');
    expect(categoryToSlug('Tài chính')).toBe('tai-chinh');
  });

  it('slugToCategory là nghịch đảo của categoryToSlug', () => {
    for (const label of NEWS_CATEGORIES) {
      const slug = categoryToSlug(label)!;
      expect(slugToCategory(slug)).toBe(label);
    }
  });

  it('trả undefined cho nhãn/slug không tồn tại', () => {
    expect(categoryToSlug('Không có')).toBeUndefined();
    expect(slugToCategory('khong-co')).toBeUndefined();
  });

  it('NEWS_CATEGORY_SLUGS khớp số lượng nhãn gốc', () => {
    expect(NEWS_CATEGORY_SLUGS).toHaveLength(NEWS_CATEGORIES.length);
  });
});

describe('newsCategories — cache runtime nạp từ DB', () => {
  it('danh mục do admin thêm mới ra đúng slug qua categoryToSlug', () => {
    expect(categoryToSlug('Pháp lý')).toBeUndefined(); // chưa nạp
    setNewsCategorySlugMap([{ label: 'Pháp lý', slug: 'phap-ly' }]);
    expect(categoryToSlug('Pháp lý')).toBe('phap-ly');
    expect(slugToCategory('phap-ly')).toBe('Pháp lý');
  });

  it('slug đổi tên trong DB được ưu tiên hơn map tĩnh', () => {
    setNewsCategorySlugMap([{ label: 'Thị trường', slug: 'thi-truong-moi' }]);
    expect(categoryToSlug('Thị trường')).toBe('thi-truong-moi');
    expect(slugToCategory('thi-truong-moi')).toBe('Thị trường');
  });

  it('nhãn không có trong cache runtime vẫn rơi về map tĩnh', () => {
    setNewsCategorySlugMap([{ label: 'Pháp lý', slug: 'phap-ly' }]);
    // Cache runtime chỉ có "Pháp lý" nhưng "Tài chính" vẫn phải ra slug tĩnh.
    expect(categoryToSlug('Tài chính')).toBe('tai-chinh');
  });

  it('bỏ qua dòng thiếu label hoặc slug khi nạp', () => {
    setNewsCategorySlugMap([
      { label: '', slug: 'rong-label' },
      { label: 'Hợp lệ', slug: '' },
      { label: 'Đầu tư mới', slug: 'dau-tu-moi' },
    ]);
    expect(slugToCategory('rong-label')).toBeUndefined();
    expect(categoryToSlug('Hợp lệ')).toBeUndefined();
    expect(categoryToSlug('Đầu tư mới')).toBe('dau-tu-moi');
  });
});
