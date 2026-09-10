import { describe, expect, it, vi, beforeEach } from 'vitest';

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  auth: { getSession: vi.fn(async () => ({ data: { session: null }, error: null })) },
}));

const revalidateMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/api/contentRevalidation', () => ({
  revalidateNewsContent: revalidateMock,
  newsRevalidationSnapshot: vi.fn((article: unknown) => article),
}));

import { createNews, formatNewsPublicationError, updateNews } from './news';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createNews publication boundary', () => {
  it('không cho phép tạo bài viết ở trạng thái published ngay', async () => {
    const payload = {
      title: 'Bài viết test',
      slug: 'bai-viet-test',
      excerpt: 'Tóm tắt',
      content: '<p>Nội dung</p>',
      image_url: null,
      category: 'Test',
      author: 'Admin',
      is_published: true,
      meta_title: null,
      meta_description: null,
      focus_keywords: null,
      related_ids: null,
      geo_area: null,
      geo_entity: null,
      geo_notes: null,
      faq: null,
      citations: null,
    };

    const insertedDraft = { ...payload, id: 'news-1', is_published: false, views: 0, content_version: 1, created_at: '2026-09-09T00:00:00Z', updated_at: '2026-09-09T00:00:00Z' };

    supabaseMock.from.mockReturnValue({
      insert: vi.fn(() => ({
        select: vi.fn(() => ({
          single: vi.fn(async () => ({ data: insertedDraft, error: null })),
        })),
      })),
    });

    const result = await createNews(payload);
    expect(result.is_published).toBe(false);
  });
});

describe('updateNews publication boundary', () => {
  it('không cho phép thay đổi is_published qua updateNews', async () => {
    const previous = { id: 'news-1', slug: 'test', category: 'Test', is_published: false, published_at: null };
    const patch = { title: 'Tiêu đề mới', is_published: true };
    const saved = { ...previous, title: 'Tiêu đề mới', is_published: false, updated_at: '2026-09-09T01:00:00Z', views: 0 };

    supabaseMock.from.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: previous, error: null })),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          select: vi.fn(() => ({
            single: vi.fn(async () => ({ data: saved, error: null })),
          })),
        })),
      })),
    });

    const result = await updateNews('news-1', patch);
    expect(result.is_published).toBe(false);
  });
});

describe('formatNewsPublicationError', () => {
  it('ghép các lỗi cổng chất lượng để admin thấy đúng chỗ thiếu', () => {
    const error = Object.assign(new Error('Bài viết chưa đạt cổng chất lượng SEO–GEO–AIO.'), {
      code: 'QUALITY_GATE',
      quality_gate: {
        passed: false,
        issues: [
          { code: 'CONTENT_TOO_SHORT', field: 'content', message: 'Nội dung phải có ít nhất 900 từ; hiện có 120.' },
          { code: 'H2_COUNT', field: 'content', message: 'Nội dung phải có ít nhất 4 H2 có chữ; hiện có 1.' },
          { code: 'GEO_AREA_REQUIRED', field: 'geo_area', message: 'Bắt buộc có khu vực thật của bài viết.' },
        ],
      },
    });

    const formatted = formatNewsPublicationError(error);
    expect(formatted).toContain('Bài viết chưa đạt cổng chất lượng SEO–GEO–AIO.');
    expect(formatted).toContain('1. Nội dung phải có ít nhất 900 từ; hiện có 120.');
    expect(formatted).toContain('2. Nội dung phải có ít nhất 4 H2 có chữ; hiện có 1.');
    expect(formatted).toContain('3. Bắt buộc có khu vực thật của bài viết.');
  });

  it('cắt tối đa 8 lỗi và báo số còn lại', () => {
    const issues = Array.from({ length: 10 }, (_, index) => ({
      code: `ISSUE_${index}`,
      field: 'x',
      message: `Lỗi ${index + 1}`,
    }));
    const error = Object.assign(new Error('Bài viết chưa đạt cổng chất lượng SEO–GEO–AIO.'), {
      quality_gate: { issues },
    });
    const formatted = formatNewsPublicationError(error);
    expect(formatted).toContain('8. Lỗi 8');
    expect(formatted).not.toContain('9. Lỗi 9');
    expect(formatted).toContain('… và 2 mục nữa.');
  });

  it('giữ message gốc khi không có quality_gate', () => {
    expect(formatNewsPublicationError(new Error('Bài viết đã thay đổi, vui lòng tải lại.')))
      .toBe('Bài viết đã thay đổi, vui lòng tải lại.');
  });

  it('dùng fallback khi error rỗng', () => {
    expect(formatNewsPublicationError(null)).toBe('Không thể cập nhật trạng thái xuất bản.');
  });
});
