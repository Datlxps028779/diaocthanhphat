import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const revalidatePathMock = vi.hoisted(() => vi.fn());
const revalidateTagMock = vi.hoisted(() => vi.fn());
const callerClientMock = vi.hoisted(() => vi.fn());
const adminClientMock = vi.hoisted(() => vi.fn());
const requireOwnerMock = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock, revalidateTag: revalidateTagMock }));
vi.mock('@/lib/server/requireAdmin', () => ({
  adminClient: adminClientMock,
  callerClient: callerClientMock,
  requireOwner: requireOwnerMock,
}));
vi.mock('@/lib/server/newsPublishing', () => ({
  buildNewsPublicationQualityReport: vi.fn(() => ({ accepted: true, issues: [] })),
  isPublishQualityAccepted: vi.fn(() => true),
  newsPublishBoundaryMode: vi.fn(() => 'observe'),
}));

import { POST } from './route';

// Không có content_version => route đi nhánh observe (legacy), không cần server boundary.
const ARTICLE = {
  id: '11111111-1111-4111-8111-111111111111',
  slug: 'bai-viet',
  category: 'Thị trường',
  is_published: false,
  published_at: null,
  area_id: 'area-1' as string | null,
  geo_area: 'Bình Dương' as string | null,
};

// Có content_version => route đi nhánh enforce qua RPC server boundary.
const BOUNDARY_ARTICLE = { ...ARTICLE, content_version: 1 };

const AREA_ROWS = [{ id: 'area-1', slug: 'binh-duong', name: 'Bình Dương' }];

function makeClient(article: Record<string, unknown> = ARTICLE) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'news') {
        return {
          select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: article, error: null })) })) })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn(async () => ({ data: { ...article, is_published: true, published_at: '2026-09-01T00:00:00.000Z' }, error: null })),
              })),
            })),
          })),
        };
      }
      if (table === 'areas') return { select: vi.fn(async () => ({ data: AREA_ROWS, error: null })) };
      if (table === 'news_categories') return { select: vi.fn(async () => ({ data: [{ label: 'Thị trường', slug: 'thi-truong' }], error: null })) };
      if (table === 'districts') return { select: vi.fn(async () => ({ data: [], error: null })) };
      if (table === 'property_types') return { select: vi.fn(async () => ({ data: [], error: null })) };
      if (table === 'seo_freshness_jobs') return { upsert: vi.fn(async () => ({ error: null })) };
      throw new Error(`Unexpected table: ${table}`);
    }),
  };
}

function request(body: unknown = { publish: true, expectedContentVersion: 1 }): NextRequest {
  return new NextRequest(`http://localhost/api/admin/news/${ARTICLE.id}/publish`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer token' },
    body: JSON.stringify(body),
  });
}

function paths() {
  return revalidatePathMock.mock.calls.map(([path]) => path as string);
}

beforeEach(() => {
  revalidatePathMock.mockReset();
  revalidateTagMock.mockReset();
  callerClientMock.mockReset();
  adminClientMock.mockReset();
  requireOwnerMock.mockReset();
  requireOwnerMock.mockResolvedValue({ ok: true, token: 'token', userId: 'owner-1' });
  callerClientMock.mockReturnValue(makeClient());
  adminClientMock.mockReturnValue(null);
});

describe('POST /api/admin/news/[id]/publish — purge cụm khu vực', () => {
  it('purge cụm khu vực khi bài có area_id cấu trúc', async () => {
    const response = await POST(request(), { params: { id: ARTICLE.id } });

    expect(response.status).toBe(200);
    expect(paths()).toContain('/khu-vuc/binh-duong');
    expect(paths()).toContain('/khu-vuc/binh-duong/thong-tin');
    expect(paths()).toContain('/khu-vuc/binh-duong/tin-tuc');
  });

  it('purge cụm khu vực cho bài narrative chỉ có geo_area, area_id null', async () => {
    callerClientMock.mockReturnValue(makeClient({ ...ARTICLE, area_id: null, geo_area: '  Bình   Dương ' }));

    const response = await POST(request(), { params: { id: ARTICLE.id } });

    expect(response.status).toBe(200);
    expect(paths()).toContain('/khu-vuc/binh-duong/tin-tuc');
    expect(paths()).toContain('/khu-vuc/binh-duong/thong-tin');
  });

  it('giữ nguyên route bài viết, danh mục và sitemap đã có', async () => {
    await POST(request(), { params: { id: ARTICLE.id } });

    expect(paths()).toEqual(expect.arrayContaining([
      '/', '/tin-tuc', '/kien-thuc', '/sitemap.xml', '/sitemap-images.xml',
      '/tin-tuc/bai-viet', '/tin-tuc/danh-muc/thi-truong',
    ]));
  });

  it('purge snapshot tin tức khu vực khi xuất bản bài công khai', async () => {
    await POST(request(), { params: { id: ARTICLE.id } });

    expect(revalidateTagMock).toHaveBeenCalledWith('public-locality-news-snapshot');
  });

  it('purge route khu vực cũ của snapshot trước khi ẩn bài', async () => {
    callerClientMock.mockReturnValue(makeClient({ ...ARTICLE, is_published: true }));

    const response = await POST(request({ publish: false, expectedContentVersion: 1 }), { params: { id: ARTICLE.id } });

    expect(response.status).toBe(200);
    expect(paths()).toContain('/khu-vuc/binh-duong/tin-tuc');
  });

  it('không purge gì khi bài đã ở đúng trạng thái xuất bản', async () => {
    callerClientMock.mockReturnValue(makeClient({ ...ARTICLE, is_published: true }));

    const response = await POST(request(), { params: { id: ARTICLE.id } });

    expect(response.status).toBe(200);
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('không purge gì khi ID bài viết không hợp lệ', async () => {
    const response = await POST(request(), { params: { id: 'khong-phai-uuid' } });

    expect(response.status).toBe(400);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('trả 503 và không purge khi không tải được lookup URL công khai', async () => {
    callerClientMock.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === 'news') {
          return {
            select: vi.fn(() => ({ eq: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: ARTICLE, error: null })) })) })),
          };
        }
        return { select: vi.fn(async () => ({ data: null, error: { message: 'RLS denied' } })) };
      }),
    });

    const response = await POST(request(), { params: { id: ARTICLE.id } });

    expect(response.status).toBe(503);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/news/[id]/publish — boundary enforce', () => {
  it('gửi affected paths đã gồm cụm khu vực và purge sau khi boundary đổi trạng thái', async () => {
    const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
      data: [{
        id: ARTICLE.id, slug: ARTICLE.slug, category: ARTICLE.category,
        is_published: true, published_at: '2026-09-01T00:00:00.000Z',
        content_version: 2, event_id: 'evt-1', changed: true,
      }],
      error: null,
    }));
    adminClientMock.mockReturnValue({ rpc });
    callerClientMock.mockReturnValue(makeClient(BOUNDARY_ARTICLE));

    const response = await POST(request(), { params: { id: ARTICLE.id } });

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    const sentPaths = rpc.mock.calls[0]![1].p_affected_paths as string[];
    expect(sentPaths).toContain('/khu-vuc/binh-duong');
    expect(sentPaths).toContain('/khu-vuc/binh-duong/thong-tin');
    expect(sentPaths).toContain('/khu-vuc/binh-duong/tin-tuc');
    expect(paths()).toContain('/khu-vuc/binh-duong/tin-tuc');
    expect(revalidateTagMock).toHaveBeenCalledWith('public-locality-news-snapshot');
  });

  it('không purge khi boundary báo bài chưa đổi', async () => {
    const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({
      data: [{
        id: ARTICLE.id, slug: ARTICLE.slug, category: ARTICLE.category,
        is_published: true, published_at: null, content_version: 2, event_id: null, changed: false,
      }],
      error: null,
    }));
    adminClientMock.mockReturnValue({ rpc });
    callerClientMock.mockReturnValue(makeClient(BOUNDARY_ARTICLE));

    const response = await POST(request(), { params: { id: ARTICLE.id } });

    expect(response.status).toBe(200);
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });

  it('không purge khi boundary trả lỗi version cũ', async () => {
    const rpc = vi.fn(async (_fn: string, _args: Record<string, unknown>) => ({ data: null, error: { code: '40001', message: 'stale' } }));
    adminClientMock.mockReturnValue({ rpc });
    callerClientMock.mockReturnValue(makeClient(BOUNDARY_ARTICLE));

    const response = await POST(request(), { params: { id: ARTICLE.id } });

    expect(response.status).toBe(409);
    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});
