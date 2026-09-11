import { describe, expect, it } from 'vitest';
import {
  collectNewsAdminSaveIssues,
  collectNewsRepublishReadiness,
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

describe('collectNewsRepublishReadiness', () => {
  it('bài thiếu H2/link/FAQ chưa sẵn sàng đăng lại dù đang published', () => {
    const result = collectNewsRepublishReadiness({
      article: article({
        id: 'live-1',
        title: 'Tiêu đề bài viết đã đăng đủ dài cho SEO',
        slug: 'bai-live',
        is_published: true,
        content: '<p>Đoạn mở đầu này đủ dài để mô tả trực tiếp vấn đề nhưng toàn bài vẫn còn quá ngắn.</p>',
      }),
      existingArticles: [],
      currentId: 'live-1',
    });
    expect(result.ready).toBe(false);
    const joined = result.blocking.join('\n');
    expect(joined).toContain('Nội dung phải có ít nhất 4 H2');
    expect(joined).toContain('Nội dung phải có ít nhất 2 liên kết nội bộ');
    expect(joined).toContain('Cần 4–6 cặp FAQ');
    expect(result.blocking.length).toBeGreaterThan(3);
  });

  it('bài đủ cổng thì ready=true', () => {
    const words = Array.from({ length: 940 }, (_, index) => `nội-dung-${index}`).join(' ');
    const content = [
      '<p><strong>Trả lời ngắn:</strong> Dữ liệu trong bài được tổng hợp từ nguồn đã kiểm chứng để người đọc hiểu rõ bối cảnh và giới hạn trước khi đưa ra quyết định.</p>',
      '<h2>Bối cảnh thị trường tại khu vực</h2>',
      `<p>${words}</p>`,
      '<h2>Dữ liệu và phạm vi tổng hợp</h2>',
      '<p>Xem thêm <a href="/du-lieu-gia">dữ liệu giá bất động sản</a> và cách hệ thống tổng hợp mẫu.</p>',
      '<h2>Những yếu tố người mua cần kiểm tra</h2>',
      '<ul><li>Kiểm tra pháp lý và hiện trạng.</li><li>Đối chiếu thông tin quy hoạch.</li></ul>',
      '<p>Tham khảo <a href="/khu-vuc/di-an">thông tin khu vực Dĩ An</a> trước khi khảo sát thực tế.</p>',
      '<h2>Kết luận và bước tiếp theo</h2>',
      '<p>Người đọc có thể xem <a href="/tin-tuc">các bài phân tích liên quan</a> và xác minh lại nguồn trước khi quyết định.</p>',
    ].join('');
    const result = collectNewsRepublishReadiness({
      article: article({
        id: 'live-ok',
        title: 'Giá nhà Dĩ An năm 2026: dữ liệu và lưu ý khi tham khảo',
        slug: 'gia-nha-di-an-2026',
        excerpt: 'Dữ liệu giá nhà Dĩ An cần được đọc cùng số lượng mẫu, thời điểm cập nhật và tình trạng pháp lý trước khi dùng để so sánh hoặc ra quyết định.',
        content,
        image_url: 'https://images.example.com/news/di-an.jpg',
        author: 'Ban biên tập',
        meta_title: 'Giá nhà Dĩ An 2026: dữ liệu và lưu ý cần biết',
        meta_description: 'Tổng hợp dữ liệu giá nhà Dĩ An năm 2026, phạm vi mẫu, nguồn tham khảo và các lưu ý pháp lý cần kiểm tra trước khi ra quyết định.',
        focus_keywords: 'giá nhà Dĩ An, bất động sản Dĩ An, kinh nghiệm mua nhà',
        geo_area: 'Dĩ An, Bình Dương',
        geo_entity: 'thị trường nhà ở Dĩ An',
        geo_notes: 'Bài chỉ sử dụng dữ liệu nguồn có ngày cập nhật và nêu rõ giá đăng tin không phải giá giao dịch thực tế.',
        faq: [
          { question: 'Giá trong bài có phải giá giao dịch thực tế không?', answer: 'Không. Bài viết phân biệt rõ giá đăng tin và giá giao dịch, đồng thời nêu phạm vi dữ liệu để người đọc đối chiếu.' },
          { question: 'Dữ liệu được cập nhật vào thời điểm nào?', answer: 'Thời điểm cập nhật được ghi rõ trong phần nguồn và phạm vi dữ liệu của bài viết để tránh hiểu sai bối cảnh.' },
          { question: 'Người mua cần kiểm tra thông tin gì trước tiên?', answer: 'Người mua nên kiểm tra pháp lý, quy hoạch, hiện trạng tài sản và so sánh nhiều nguồn trước khi đưa ra quyết định.' },
          { question: 'Có nên dùng một mức giá để đại diện toàn khu vực không?', answer: 'Không nên. Mức giá còn phụ thuộc vị trí, loại tài sản, diện tích, pháp lý và thời điểm ghi nhận của từng mẫu.' },
        ],
        citations: [
          { title: 'Cổng thông tin dữ liệu địa phương', url: 'https://example.gov.vn/du-lieu' },
          { title: 'Dữ liệu tin đăng Chọn Nhà Việt', url: 'https://chonhaviet.com/du-lieu-gia' },
        ],
        is_published: true,
      }),
      existingArticles: [],
      currentId: 'live-ok',
    });
    expect(result.ready).toBe(true);
    expect(result.blocking).toEqual([]);
  });
});

