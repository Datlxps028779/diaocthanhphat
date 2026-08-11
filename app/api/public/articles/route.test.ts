import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const adminClientMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/requireAdmin', () => ({
  adminClient: adminClientMock,
}));

import { POST } from './route';

const VALID_KEY = 'make-secret-at-least-20-chars';
const ORIGINAL_KEY = process.env.MAKE_API_KEY;

type Row = Record<string, unknown>;
type DbResult = { data: Row | null; error: { code?: string; message: string } | null };

type AdminOptions = {
  categories?: string[];
  categoryError?: { code?: string; message: string } | null;
  externalRows?: Array<Row | null>;
  relatedRows?: Row[];
  relatedError?: { code?: string; message: string } | null;
  insertResults?: DbResult[];
};

function words(count: number) {
  return Array.from({ length: count }, (_, index) => `dữ-liệu-${index}`).join(' ');
}

function completeContent() {
  return [
    '<p><strong>Trả lời ngắn:</strong> Bài viết tổng hợp dữ liệu có nguồn, thời điểm và phạm vi rõ ràng để người đọc kiểm tra trước khi đưa ra quyết định.</p>',
    '<h2>Bối cảnh thị trường tại khu vực</h2>',
    `<p>${words(920)}</p>`,
    '<h2>Dữ liệu và phạm vi tổng hợp</h2>',
    '<p>Xem <a href="/du-lieu-gia">dữ liệu giá</a> và phạm vi mẫu.</p>',
    '<h2>Những yếu tố cần kiểm tra</h2>',
    '<ul><li>Pháp lý</li><li>Hiện trạng</li></ul>',
    '<p>Tham khảo <a href="/khu-vuc/di-an">khu vực Dĩ An</a>.</p>',
    '<h2>Kết luận và bước tiếp theo</h2>',
    '<p>Xem <a href="/tin-tuc">bài phân tích liên quan</a> trước khi quyết định.</p>',
  ].join('');
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    external_id: 'make-news:test-1',
    title: 'Giá nhà Dĩ An năm 2026: dữ liệu và lưu ý khi tham khảo',
    content: completeContent(),
    excerpt: 'Dữ liệu giá nhà Dĩ An cần được đọc cùng số lượng mẫu, thời điểm cập nhật và tình trạng pháp lý trước khi dùng để so sánh hoặc ra quyết định.',
    category: 'Thị trường',
    author: 'Ban biên tập',
    image_url: 'https://images.example.com/news/di-an.jpg',
    meta_title: 'Giá nhà Dĩ An 2026: dữ liệu và lưu ý cần biết',
    meta_description: 'Tổng hợp dữ liệu giá nhà Dĩ An năm 2026, phạm vi mẫu, nguồn tham khảo và các lưu ý pháp lý cần kiểm tra trước khi ra quyết định.',
    focus_keywords: ['giá nhà Dĩ An', 'bất động sản Dĩ An', 'kinh nghiệm mua nhà'],
    geo_area: 'Dĩ An, Bình Dương',
    geo_entity: 'thị trường nhà ở Dĩ An',
    geo_notes: 'Bài chỉ dùng dữ liệu có nguồn và nêu rõ giá đăng tin không phải giá giao dịch thực tế.',
    faq: [
      { question: 'Giá trong bài có phải giá giao dịch thực tế không?', answer: 'Không. Bài phân biệt giá đăng tin và giá giao dịch, đồng thời nêu phạm vi dữ liệu để người đọc đối chiếu.' },
      { question: 'Dữ liệu được cập nhật vào thời điểm nào?', answer: 'Thời điểm cập nhật được ghi trong phần nguồn và phạm vi dữ liệu để người đọc tránh hiểu sai bối cảnh.' },
      { question: 'Người mua cần kiểm tra thông tin gì?', answer: 'Người mua cần kiểm tra pháp lý, quy hoạch, hiện trạng và so sánh nhiều nguồn trước khi ra quyết định.' },
      { question: 'Một mức giá có đại diện toàn khu vực không?', answer: 'Không. Mức giá còn phụ thuộc vị trí, loại tài sản, diện tích, pháp lý và thời điểm ghi nhận của mẫu.' },
    ],
    citations: [
      { title: 'Cổng dữ liệu địa phương', url: 'https://example.gov.vn/du-lieu' },
      { title: 'Dữ liệu Chọn Nhà Việt', url: 'https://chonhaviet.com/du-lieu-gia' },
    ],
    ...overrides,
  };
}

function relatedArticle(index: number): Row {
  return {
    id: `related-${index}`,
    title: `Bài liên quan ${index}`,
    slug: `bai-lien-quan-${index}`,
    excerpt: 'Tóm tắt',
    content: '<p>Nội dung</p>',
    image_url: 'https://example.com/image.jpg',
    category: 'Thị trường',
    author: 'Ban biên tập',
    is_published: true,
    views: 0,
    meta_title: null,
    meta_description: null,
    focus_keywords: 'giá nhà Dĩ An',
    schema_markup: null,
    related_ids: null,
    geo_area: 'Dĩ An',
    geo_entity: null,
    geo_notes: null,
    faq: null,
    citations: null,
    created_at: `2026-08-0${index + 1}T00:00:00.000Z`,
    updated_at: `2026-08-0${index + 1}T00:00:00.000Z`,
  };
}

function makeAdmin(options: AdminOptions = {}) {
  const inserts: Row[] = [];
  let externalLookup = 0;
  let insertCall = 0;
  const externalRows = options.externalRows ?? [null];
  const insertResults = options.insertResults ?? [
    { data: { id: 'news-1', slug: 'bai-moi', is_published: false }, error: null },
  ];

  const admin = {
    from: vi.fn((table: string) => {
      if (table === 'news_categories') {
        return {
          select: vi.fn(() => ({
            order: vi.fn(async () => ({
              data: (options.categories ?? ['Thị trường', 'Đầu tư', 'Hướng dẫn']).map(label => ({ label })),
              error: options.categoryError ?? null,
            })),
          })),
        };
      }

      if (table !== 'news') throw new Error(`Unexpected table: ${table}`);
      return {
        select: vi.fn((columns: string) => {
          if (columns === 'id, slug, is_published') {
            return {
              eq: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  const row = externalRows[Math.min(externalLookup, externalRows.length - 1)] ?? null;
                  externalLookup += 1;
                  return { data: row, error: null };
                }),
              })),
            };
          }
          if (columns === '*') {
            return {
              eq: vi.fn(() => ({
                order: vi.fn(() => ({
                  limit: vi.fn(async () => ({
                    data: options.relatedRows ?? Array.from({ length: 5 }, (_, index) => relatedArticle(index)),
                    error: options.relatedError ?? null,
                  })),
                })),
              })),
            };
          }
          throw new Error(`Unexpected select: ${columns}`);
        }),
        insert: vi.fn((row: Row) => {
          inserts.push(row);
          return {
            select: vi.fn(() => ({
              single: vi.fn(async () => {
                const result = insertResults[Math.min(insertCall, insertResults.length - 1)];
                insertCall += 1;
                return result;
              }),
            })),
          };
        }),
      };
    }),
  };

  return { admin, inserts };
}

function request(body: string | Record<string, unknown>, key = VALID_KEY): NextRequest {
  return new NextRequest('http://localhost/api/public/articles', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

async function json(response: Response): Promise<Record<string, unknown>> {
  return response.json() as Promise<Record<string, unknown>>;
}

beforeEach(() => {
  process.env.MAKE_API_KEY = VALID_KEY;
  adminClientMock.mockReset();
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.MAKE_API_KEY;
  else process.env.MAKE_API_KEY = ORIGINAL_KEY;
});

describe('POST /api/public/articles', () => {
  it('từ chối khóa API sai trước khi truy cập DB', async () => {
    const response = await POST(request({ title: 'Bài', content: 'Nội dung' }, 'wrong-key'));
    expect(response.status).toBe(401);
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it('trả 400 cho JSON lỗi', async () => {
    const response = await POST(request('{not-json'));
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error: 'Body không phải JSON hợp lệ.' });
  });

  it('đo giới hạn 512KB theo byte UTF-8, không theo số ký tự JavaScript', async () => {
    const response = await POST(request({ title: 'á'.repeat(270_000), content: 'Nội dung' }));
    expect(response.status).toBe(413);
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it('trả 400 khi payload thiếu field hợp đồng bắt buộc', async () => {
    const response = await POST(request({ title: 'Thiếu nội dung' }));
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({ error: 'Dữ liệu không hợp lệ.' });
  });

  it('trả 503 khi thiếu Supabase service-role client', async () => {
    adminClientMock.mockReturnValue(null);
    const response = await POST(request(validPayload()));
    expect(response.status).toBe(503);
  });

  it('trả bài cũ trước quality gate khi external_id đã tồn tại', async () => {
    const { admin, inserts } = makeAdmin({
      externalRows: [{ id: 'old-1', slug: 'bai-cu', is_published: false }],
    });
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request(validPayload({ content: '<p>Nội dung cũ quá ngắn</p>' })));
    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ id: 'old-1', duplicate: true, is_published: false });
    expect(inserts).toHaveLength(0);
  });

  it('trả 422 và không insert khi bài chưa đạt quality gate', async () => {
    const { admin, inserts } = makeAdmin();
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request(validPayload({ content: '<p>Nội dung quá ngắn để lưu.</p>' })));
    expect(response.status).toBe(422);
    expect(await json(response)).toMatchObject({
      error: 'ARTICLE_QUALITY_GATE_FAILED',
      quality_gate: { passed: false, version: 'article-ingest-v1' },
    });
    expect(inserts).toHaveLength(0);
  });

  it('trả 503 khi không đọc được danh mục động', async () => {
    const { admin } = makeAdmin({ categoryError: { message: 'database unavailable' } });
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request(validPayload()));
    expect(response.status).toBe(503);
    expect(await json(response)).toMatchObject({ error: 'Không kiểm tra được danh mục tin tức.' });
  });

  it('từ chối danh mục không tồn tại và trả danh sách được phép', async () => {
    const { admin, inserts } = makeAdmin({ categories: ['Thị trường', 'Đầu tư', 'Hướng dẫn'] });
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request(validPayload({ category: 'Pháp lý' })));
    expect(response.status).toBe(400);
    expect(await json(response)).toMatchObject({
      error: 'Danh mục tin tức không tồn tại.',
      allowed_categories: ['Thị trường', 'Đầu tư', 'Hướng dẫn'],
    });
    expect(inserts).toHaveLength(0);
  });

  it('lưu đủ field Admin, related IDs và schema do server tự sinh', async () => {
    const { admin, inserts } = makeAdmin();
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request(validPayload({
      category: 'Đầu tư',
      external_id: 'make-2',
      is_published: true,
      slug: 'slug-tu-caller',
      views: 99_999,
    })));
    const body = await json(response);

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      is_published: false,
      duplicate: false,
      quality_gate: {
        passed: true,
        version: 'article-ingest-v1',
        metrics: { related_count: 5 },
      },
    });
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      category: 'Đầu tư',
      external_id: 'make-2',
      is_published: false,
      related_ids: ['related-4', 'related-3', 'related-2', 'related-1', 'related-0'],
      geo_area: 'Dĩ An, Bình Dương',
      faq: expect.any(Array),
      citations: expect.any(Array),
      schema_markup: {
        '@type': 'NewsArticle',
        headline: validPayload().title,
      },
    });
    expect(inserts[0]).not.toHaveProperty('views');
    expect(inserts[0].slug).not.toBe('slug-tu-caller');
  });

  it('lưu related_ids rỗng kèm warning khi pool public rỗng', async () => {
    const { admin, inserts } = makeAdmin({ relatedRows: [] });
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request(validPayload()));
    const body = await json(response);

    expect(response.status).toBe(201);
    expect(inserts[0].related_ids).toEqual([]);
    expect(body).toMatchObject({
      quality_gate: {
        warnings: expect.arrayContaining([expect.objectContaining({ code: 'RELATED_POOL_EMPTY' })]),
        metrics: { related_count: 0 },
      },
    });
  });

  it('trả 503 khi không đọc được pool bài liên quan', async () => {
    const { admin, inserts } = makeAdmin({ relatedError: { message: 'pool unavailable' } });
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request(validPayload()));
    expect(response.status).toBe(503);
    expect(inserts).toHaveLength(0);
  });

  it('khép race external_id: unique conflict được đọc lại thành duplicate 200', async () => {
    const { admin } = makeAdmin({
      externalRows: [null, { id: 'race-1', slug: 'bai-race', is_published: false }],
      insertResults: [{ data: null, error: { code: '23505', message: 'duplicate key' } }],
    });
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request(validPayload({ external_id: 'make-race' })));

    expect(response.status).toBe(200);
    expect(await json(response)).toMatchObject({ id: 'race-1', duplicate: true });
  });

  it('thử slug kế tiếp khi một request khác vừa chiếm slug', async () => {
    const { admin, inserts } = makeAdmin({
      insertResults: [
        { data: null, error: { code: '23505', message: 'duplicate slug' } },
        { data: { id: 'news-2', slug: 'slug-moi-2', is_published: false }, error: null },
      ],
    });
    adminClientMock.mockReturnValue(admin);

    const response = await POST(request(validPayload({ title: 'Bài trùng đủ độ dài để vượt qua cổng kiểm tra' })));
    expect(response.status).toBe(201);
    expect(inserts.map(row => row.slug)).toEqual([
      'bai-trung-du-do-dai-de-vuot-qua-cong-kiem-tra',
      'bai-trung-du-do-dai-de-vuot-qua-cong-kiem-tra-2',
    ]);
  });
});
