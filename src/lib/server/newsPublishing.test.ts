import { describe, expect, it } from 'vitest';
import { buildNewsPublicationQualityReport, isPublishQualityAccepted } from './newsPublishing';
import type { NewsArticle } from '@/lib/supabase';

function article(overrides: Partial<NewsArticle> = {}): NewsArticle {
  const paragraph = '<p>Đây là đoạn trả lời trực tiếp đủ dài, dựa trên dữ liệu thật và giúp người đọc hiểu nội dung chính trước khi đọc chi tiết.</p>';
  const section = (index: number) => `<h2>Mục phân tích số ${index}</h2><p>${Array.from({ length: 230 }, (_, word) => `dữ-liệu-${index}-${word}`).join(' ')}</p>`;
  return {
    id: 'news-1',
    title: 'Phân tích thị trường căn hộ Bình Dương dựa trên dữ liệu thật',
    slug: 'phan-tich-thi-truong-can-ho-binh-duong',
    excerpt: 'Bài viết phân tích thị trường căn hộ Bình Dương bằng dữ liệu có nguồn, ngữ cảnh địa phương và các lưu ý thực tế cho người đọc.',
    content: `${paragraph}<a href="/mua-ban">Mua bán</a><a href="/du-lieu-gia">Dữ liệu giá</a>${[1, 2, 3, 4].map(section).join('')}`,
    image_url: 'https://chonhaviet.com/image.jpg',
    category: 'Thị trường',
    author: 'Ban biên tập',
    is_published: false,
    views: 0,
    content_version: 4,
    published_at: null,
    meta_title: 'Phân tích thị trường căn hộ Bình Dương 2026',
    meta_description: 'Phân tích thị trường căn hộ Bình Dương bằng dữ liệu có nguồn, ngữ cảnh địa phương và những lưu ý thực tế dành cho người mua nhà.',
    focus_keywords: 'căn hộ Bình Dương, thị trường căn hộ, dữ liệu giá nhà',
    schema_markup: null,
    related_ids: [],
    geo_area: 'Bình Dương',
    geo_entity: 'Thị trường căn hộ',
    geo_notes: 'Dữ liệu và phạm vi địa phương đã được biên tập viên kiểm tra.',
    faq: [1, 2, 3, 4].map(index => ({ question: `Câu hỏi thị trường số ${index}?`, answer: 'Câu trả lời dựa trên nội dung bài viết và dữ liệu nguồn đã được đối chiếu.' })),
    citations: [
      { title: 'Nguồn chính thức 1', url: 'https://example.com/source-1' },
      { title: 'Nguồn chính thức 2', url: 'https://example.org/source-2' },
    ],
    created_at: '2026-09-09T00:00:00Z',
    updated_at: '2026-09-09T00:00:00Z',
    ...overrides,
  };
}

describe('news publication quality report', () => {
  it('gắn canonical và content version vào quality report', () => {
    const report = buildNewsPublicationQualityReport(article());
    expect(report.content_version).toBe(4);
    expect(report.canonical_url).toBe('https://chonhaviet.com/tin-tuc/phan-tich-thi-truong-can-ho-binh-duong');
    expect(report.content_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(isPublishQualityAccepted(report)).toBe(true);
  });

  it('chặn bài thiếu nội dung, GEO và nguồn', () => {
    const report = buildNewsPublicationQualityReport(article({
      content: '<p>Ngắn.</p>',
      geo_area: null,
      geo_entity: null,
      geo_notes: null,
      citations: null,
      faq: null,
    }));
    expect(report.quality_status).toBe('blocked');
    expect(report.passed).toBe(false);
    expect(isPublishQualityAccepted(report)).toBe(false);
  });
});
