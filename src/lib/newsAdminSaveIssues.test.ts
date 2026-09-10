import { describe, expect, it } from 'vitest';
import {
  collectNewsAdminSaveIssues,
  findNewsSlugConflict,
  formatNewsIssueList,
} from './newsAdminSaveIssues';
import type { NewsArticle } from './supabase';

function article(overrides: Partial<NewsArticle> = {}): NewsArticle {
  return {
    id: 'draft',
    title: 'Bài mới',
    slug: 'bai-moi',
    excerpt: '',
    content: '<p>Ngắn.</p>',
    image_url: '',
    category: 'Thị trường',
    author: '',
    author_type: 'Organization',
    author_role: null,
    published_at: null,
    as_of_date: null,
    reviewer_name: null,
    reviewer_role: null,
    source_note: null,
    is_published: true,
    views: 0,
    meta_title: '',
    meta_description: '',
    focus_keywords: '',
    schema_markup: null,
    related_ids: null,
    geo_area: '',
    geo_entity: '',
    geo_notes: '',
    area_id: null,
    district_id: null,
    ward_id: null,
    neighborhood_id: null,
    faq: [],
    citations: [],
    created_at: '2026-09-10T00:00:00.000Z',
    updated_at: '2026-09-10T00:00:00.000Z',
    ...overrides,
  };
}

describe('findNewsSlugConflict', () => {
  const existing = [
    { id: 'a1', slug: 'doanh-nghiep-bat-dong-san-xoay-dong-tien-khi-suc-mua-suy-yeu', title: 'Bài đã có' },
  ];

  it('tìm bài khác đang giữ cùng slug', () => {
    const conflict = findNewsSlugConflict(
      'Doanh-Nghiep-Bat-Dong-San-Xoay-Dong-Tien-Khi-Suc-Mua-Suy-Yeu',
      existing,
      'draft',
    );
    expect(conflict?.id).toBe('a1');
  });

  it('bỏ qua chính bài đang sửa', () => {
    expect(findNewsSlugConflict(existing[0].slug, existing, 'a1')).toBeNull();
  });
});

describe('collectNewsAdminSaveIssues', () => {
  const existing = [
    { id: 'a1', slug: 'bai-moi', title: 'Bài đã có cùng slug' },
  ];

  it('nháp chỉ chặn tiêu đề/slug, không chặn cổng chất lượng', () => {
    const result = collectNewsAdminSaveIssues({
      article: article({ title: '', slug: '' }),
      existingArticles: existing,
      currentId: null,
      publish: false,
    });
    expect(result.blocking).toEqual([
      'Vui lòng nhập tiêu đề bài viết.',
      'Slug URL đang trống. Nhập slug hoặc để hệ thống sinh từ tiêu đề.',
    ]);
  });

  it('sửa bài đã đăng không bị cổng chất lượng chặn khi publish=false', () => {
    const result = collectNewsAdminSaveIssues({
      article: article({
        id: 'published-1',
        title: 'Tiêu đề bài viết đã đăng đủ dài cho SEO',
        slug: 'bai-da-dang',
        content: '<p>Nội dung ngắn.</p>',
      }),
      existingArticles: existing,
      currentId: 'published-1',
      publish: false,
    });
    expect(result.blocking).toEqual([]);
  });

  it('gom slug trùng và toàn bộ lỗi cổng chất lượng trong một lần', () => {
    const result = collectNewsAdminSaveIssues({
      article: article({
        title: 'Ngắn',
        slug: 'bai-moi',
        content: '<p>Ngắn.</p><h2>Một</h2>',
        focus_keywords: 'một, hai, ba, bốn, năm, sáu, bảy',
      }),
      existingArticles: existing,
      currentId: 'draft-new',
      publish: true,
    });

    const text = result.blocking.join('\n');
    expect(text).toContain('news_slug_key');
    expect(text).toContain('Bài đã có cùng slug');
    expect(text).toContain('Tiêu đề phải dài 20–180 ký tự');
    expect(text).toContain('Nội dung phải có ít nhất 900 từ');
    expect(text).toContain('Nội dung phải có ít nhất 4 H2');
    expect(text).toContain('Bắt buộc có khu vực thật');
    expect(text).toContain('Nội dung phải có ít nhất 2 liên kết nội bộ');
    expect(text).toContain('Cần 4–6 cặp FAQ');
    expect(text).toContain('Cần 2–6 nguồn tham khảo');
    expect(result.blocking.length).toBeGreaterThan(8);
  });
});

describe('formatNewsIssueList', () => {
  it('đánh số toàn bộ lỗi và liệt kê thiếu sót không chặn', () => {
    const formatted = formatNewsIssueList(
      'Bài viết chưa đủ điều kiện để lưu/đăng.',
      ['Thiếu slug', 'Thiếu H2'],
      { warnings: ['Bài hơi dài'] },
    );
    expect(formatted).toContain('1. Thiếu slug');
    expect(formatted).toContain('2. Thiếu H2');
    expect(formatted).toContain('Thiếu sót nên sửa');
    expect(formatted).toContain('- Bài hơi dài');
  });
});
