import { describe, expect, it } from 'vitest';
import type { ArticleRow } from './apiIngest';
import { evaluateArticleIngestQuality } from './articleIngestQuality';

function words(count: number, prefix = 'nội-dung') {
  return Array.from({ length: count }, (_, index) => `${prefix}-${index}`).join(' ');
}

function completeContent(wordCount = 940) {
  const body = words(wordCount);
  return [
    '<p><strong>Trả lời ngắn:</strong> Dữ liệu trong bài được tổng hợp từ nguồn đã kiểm chứng để người đọc hiểu rõ bối cảnh và giới hạn trước khi đưa ra quyết định.</p>',
    '<h2>Bối cảnh thị trường tại khu vực</h2>',
    `<p>${body}</p>`,
    '<h2>Dữ liệu và phạm vi tổng hợp</h2>',
    '<p>Xem thêm <a href="/du-lieu-gia">dữ liệu giá bất động sản</a> và cách hệ thống tổng hợp mẫu.</p>',
    '<h2>Những yếu tố người mua cần kiểm tra</h2>',
    '<ul><li>Kiểm tra pháp lý và hiện trạng.</li><li>Đối chiếu thông tin quy hoạch.</li></ul>',
    '<p>Tham khảo <a href="/khu-vuc/di-an">thông tin khu vực Dĩ An</a> trước khi khảo sát thực tế.</p>',
    '<h2>Kết luận và bước tiếp theo</h2>',
    '<p>Người đọc có thể xem <a href="/tin-tuc">các bài phân tích liên quan</a> và xác minh lại nguồn trước khi quyết định.</p>',
  ].join('');
}

function validRow(overrides: Partial<ArticleRow> = {}): ArticleRow {
  return {
    title: 'Giá nhà Dĩ An năm 2026: dữ liệu và lưu ý khi tham khảo',
    content: completeContent(),
    excerpt: 'Dữ liệu giá nhà Dĩ An cần được đọc cùng số lượng mẫu, thời điểm cập nhật và tình trạng pháp lý trước khi dùng để so sánh hoặc ra quyết định.',
    category: 'Thị trường',
    author: 'Ban biên tập',
    image_url: 'https://images.example.com/news/di-an.jpg',
    meta_title: 'Giá nhà Dĩ An 2026: dữ liệu và lưu ý cần biết',
    meta_description: 'Tổng hợp dữ liệu giá nhà Dĩ An năm 2026, phạm vi mẫu, nguồn tham khảo và các lưu ý pháp lý cần kiểm tra trước khi ra quyết định.',
    focus_keywords: 'giá nhà Dĩ An, bất động sản Dĩ An, kinh nghiệm mua nhà',
    external_id: 'make-news:test-quality-1',
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
    is_published: false,
    ...overrides,
  };
}

describe('evaluateArticleIngestQuality', () => {
  it('passes a complete SEO/GEO/AIO article', () => {
    const result = evaluateArticleIngestQuality(validRow());

    expect(result.passed).toBe(true);
    expect(result.issues).toHaveLength(0);
    expect(result.score).toBe(100);
    expect(result.metrics).toMatchObject({
      h2_count: 4,
      internal_link_count: 3,
      faq_count: 4,
      citation_count: 2,
      images_without_alt: 0,
    });
    expect(result.metrics.word_count).toBeGreaterThanOrEqual(900);
  });

  it('rejects content below 900 words and incomplete heading/link structure', () => {
    const content = '<p>Đoạn mở đầu này đủ dài để mô tả trực tiếp vấn đề nhưng toàn bài vẫn còn quá ngắn.</p><h2>Một mục duy nhất</h2><p>Nội dung ngắn.</p>';
    const result = evaluateArticleIngestQuality(validRow({ content }));

    expect(result.passed).toBe(false);
    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'CONTENT_TOO_SHORT',
      'H2_COUNT',
      'INTERNAL_LINK_COUNT',
    ]));
  });

  it('rejects an H1 from raw input even when sanitized content no longer contains it', () => {
    const row = validRow();
    const result = evaluateArticleIngestQuality(row, { rawContent: `<h1>H1 không được phép</h1>${row.content}` });

    expect(result.issues.map(issue => issue.code)).toContain('BODY_H1_FORBIDDEN');
  });

  it('requires complete SEO, GEO, author and image fields', () => {
    const result = evaluateArticleIngestQuality(validRow({
      author: '',
      image_url: null,
      meta_title: null,
      meta_description: null,
      focus_keywords: null,
      geo_area: '',
      geo_entity: '',
      geo_notes: '',
    }));

    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'AUTHOR_REQUIRED',
      'FEATURED_IMAGE_REQUIRED',
      'META_TITLE_LENGTH',
      'META_DESCRIPTION_LENGTH',
      'KEYWORD_COUNT',
      'GEO_AREA_REQUIRED',
      'GEO_ENTITY_REQUIRED',
      'GEO_NOTES_REQUIRED',
    ]));
  });

  it('requires four valid FAQ pairs and two citations', () => {
    const result = evaluateArticleIngestQuality(validRow({
      faq: [{ question: 'Câu hỏi thiếu dấu hỏi', answer: 'ngắn' }],
      citations: [{ title: 'Một nguồn', url: 'https://example.com/source' }],
    }));

    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'FAQ_COUNT',
      'FAQ_QUESTION_FORMAT',
      'FAQ_ANSWER_LENGTH',
      'CITATION_COUNT',
    ]));
  });

  it('rejects duplicated H2 and FAQ duplicated inside content', () => {
    const row = validRow();
    const content = `${row.content}<h2>Bối cảnh thị trường tại khu vực</h2><p>${words(20)}</p><h2>Câu hỏi thường gặp</h2>`;
    const result = evaluateArticleIngestQuality(validRow({ content }));

    expect(result.issues.map(issue => issue.code)).toEqual(expect.arrayContaining([
      'H2_DUPLICATE',
      'FAQ_IN_CONTENT',
    ]));
  });

  it('reports warnings for excessive links and citations from one domain', () => {
    const links = Array.from({ length: 5 }, (_, index) => `<a href="/tin-tuc/bai-${index}">Bài ${index}</a>`).join(' ');
    const content = completeContent().replace('</p>', ` ${links}</p>`);
    const result = evaluateArticleIngestQuality(validRow({
      content,
      citations: [
        { title: 'Nguồn A', url: 'https://example.com/a' },
        { title: 'Nguồn B', url: 'https://example.com/b' },
      ],
    }));

    expect(result.passed).toBe(true);
    expect(result.warnings.map(warning => warning.code)).toEqual(expect.arrayContaining([
      'TOO_MANY_INTERNAL_LINKS',
      'CITATION_DOMAIN_DIVERSITY',
    ]));
  });
});
