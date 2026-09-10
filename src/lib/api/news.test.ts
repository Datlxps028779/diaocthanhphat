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

import { createNews, updateNews } from './news';

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
