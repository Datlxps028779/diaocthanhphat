import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireOwnerMock = vi.hoisted(() => vi.fn());
const callerClientMock = vi.hoisted(() => vi.fn());
const adminClientMock = vi.hoisted(() => vi.fn());
const qualityMock = vi.hoisted(() => vi.fn());
const acceptedMock = vi.hoisted(() => vi.fn());
const modeMock = vi.hoisted(() => vi.fn());
const revalidatePathMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/requireAdmin', () => ({
  requireOwner: requireOwnerMock,
  callerClient: callerClientMock,
  adminClient: adminClientMock,
}));
vi.mock('@/lib/server/newsPublishing', () => ({
  buildNewsPublicationQualityReport: qualityMock,
  isPublishQualityAccepted: acceptedMock,
  newsPublishBoundaryMode: modeMock,
}));
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { POST } from './route';

const ARTICLE_ID = '11111111-1111-4111-8111-111111111111';

function request(body: unknown, token = 'owner-token') {
  return new NextRequest(`http://localhost/api/admin/news/${ARTICLE_ID}/publish`, {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}`, 'content-type': 'application/json' } : { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function article(overrides: Record<string, unknown> = {}) {
  return {
    id: ARTICLE_ID,
    title: 'Bài viết đạt chuẩn SEO GEO AIO cho thị trường Bình Dương',
    slug: 'bai-viet-dat-chuan',
    excerpt: 'Một đoạn tóm tắt đủ dài để mô tả nội dung bài viết và giá trị mà người đọc nhận được từ dữ liệu thật.',
    content: '<p>Đoạn trả lời trực tiếp đủ dài cho người đọc.</p><h2>Mục một</h2>',
    image_url: 'https://chonhaviet.com/image.jpg',
    category: 'Thị trường',
    author: 'Ban biên tập',
    is_published: false,
    views: 0,
    content_version: 3,
    published_at: null,
    meta_title: 'Bài viết thị trường Bình Dương có dữ liệu thật',
    meta_description: 'Mô tả bài viết dựa trên dữ liệu thật, nguồn tham khảo rõ ràng và ngữ cảnh địa phương phù hợp cho người đọc.',
    focus_keywords: 'Bình Dương, thị trường, căn hộ',
    related_ids: [],
    geo_area: 'Bình Dương',
    geo_entity: 'Thị trường căn hộ',
    geo_notes: 'Dữ liệu địa phương',
    faq: [],
    citations: [{ title: 'Nguồn 1', url: 'https://example.com/1' }, { title: 'Nguồn 2', url: 'https://example.org/2' }],
    created_at: '2026-09-09T00:00:00Z',
    updated_at: '2026-09-09T00:00:00Z',
    ...overrides,
  };
}

function readClient(
  row = article(),
  rpcResult: unknown = null,
  rpcError: unknown = null,
  updatedRow: Record<string, unknown> | null = null,
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'news') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: row, error: null })) })) })),
        update: vi.fn(() => ({
          eq: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn(async () => ({
                data: updatedRow ?? {
                  id: row.id,
                  slug: row.slug,
                  category: row.category,
                  is_published: true,
                  published_at: row.published_at ?? '2026-09-10T00:00:00Z',
                },
                error: null,
              })),
            })),
          })),
        })),
      };
      if (table === 'news_categories') return {
        select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: { slug: 'thi-truong' }, error: null })) })) })),
      };
      throw new Error(`unexpected table ${table}`);
    }),
    rpc: vi.fn(async () => ({ data: rpcResult, error: rpcError })),
  };
}

beforeEach(() => {
  requireOwnerMock.mockReset();
  callerClientMock.mockReset();
  adminClientMock.mockReset();
  qualityMock.mockReset();
  acceptedMock.mockReset();
  modeMock.mockReset();
  revalidatePathMock.mockReset();
  qualityMock.mockReturnValue({ passed: true, warnings: [], content_version: 3 });
  acceptedMock.mockReturnValue(true);
  modeMock.mockReturnValue('enforce');
});

describe('POST /api/admin/news/[id]/publish', () => {
  it('từ chối người không phải owner MFA', async () => {
    requireOwnerMock.mockResolvedValue({ ok: false, status: 403, msg: 'Không có quyền.' });
    const response = await POST(request({ publish: true, expectedContentVersion: 3 }), { params: { id: ARTICLE_ID } });
    expect(response.status).toBe(403);
    expect(callerClientMock).not.toHaveBeenCalled();
  });

  it('chặn publish khi quality gate không đạt và không gọi RPC', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    const client = readClient();
    callerClientMock.mockReturnValue(client);
    acceptedMock.mockReturnValue(false);
    qualityMock.mockReturnValue({ passed: false, issues: [{ code: 'CONTENT_TOO_SHORT' }], content_version: 3 });

    const response = await POST(request({ publish: true, expectedContentVersion: 3 }), { params: { id: ARTICLE_ID } });
    expect(response.status).toBe(422);
    expect(client.rpc).not.toHaveBeenCalled();
  });

  it('không bật enforce nếu production chưa có content_version', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    callerClientMock.mockReturnValue(readClient(article({ content_version: undefined })));

    const response = await POST(request({ publish: true, expectedContentVersion: 1 }), { params: { id: ARTICLE_ID } });
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('MIGRATION_REQUIRED');
  });

  it('observe: vẫn publish được khi chưa có migration và không gọi RPC', async () => {
    modeMock.mockReturnValue('observe');
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    const client = readClient(article({ content_version: undefined, is_published: false }));
    callerClientMock.mockReturnValue(client);

    const response = await POST(request({ publish: true, expectedContentVersion: 1 }), { params: { id: ARTICLE_ID } });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(client.rpc).not.toHaveBeenCalled();
    expect(json.mode).toBe('observe');
    expect(json.result.changed).toBe(true);
    expect(json.result.is_published).toBe(true);
    expect(revalidatePathMock).toHaveBeenCalledWith('/tin-tuc/bai-viet-dat-chuan');
  });

  it('gọi RPC optimistic và revalidate cả image sitemap khi transition thành công', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    const result = [{ id: ARTICLE_ID, slug: 'bai-viet-dat-chuan', category: 'Thị trường', is_published: true, published_at: '2026-09-09T00:00:00Z', content_version: 3, event_id: 'event-1', changed: true }];
    const client = readClient(article());
    const boundaryClient = readClient(article(), result);
    const boundaryFrom = boundaryClient.from;
    boundaryClient.from = vi.fn((table: string) => table === 'seo_freshness_jobs'
      ? { upsert: vi.fn(async () => ({ error: null })) }
      : boundaryFrom(table));
    callerClientMock.mockReturnValue(client);
    adminClientMock.mockReturnValue(boundaryClient);

    const response = await POST(request({ publish: true, expectedContentVersion: 3 }), { params: { id: ARTICLE_ID } });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(boundaryClient.rpc).toHaveBeenCalledWith('publish_news_article_server', expect.objectContaining({
      p_news_id: ARTICLE_ID,
      p_expected_content_version: 3,
      p_publish: true,
      p_actor_id: 'owner-1',
    }));
    expect(json.paths).toContain('/sitemap-images.xml');
    expect(revalidatePathMock).toHaveBeenCalledWith('/tin-tuc/bai-viet-dat-chuan');
  });

  it('trả 503 nếu server publication boundary chưa cấu hình service role', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    callerClientMock.mockReturnValue(readClient(article()));
    adminClientMock.mockReturnValue(null);

    const response = await POST(request({ publish: true, expectedContentVersion: 3 }), { params: { id: ARTICLE_ID } });
    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('SERVER_BOUNDARY_UNAVAILABLE');
  });

  it('trả 409 khi optimistic version đã cũ', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    callerClientMock.mockReturnValue(readClient(article()));
    adminClientMock.mockReturnValue(readClient(article(), null, { code: '40001', message: 'stale' }));

    const response = await POST(request({ publish: true, expectedContentVersion: 2 }), { params: { id: ARTICLE_ID } });
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe('STALE_VERSION');
  });
});
