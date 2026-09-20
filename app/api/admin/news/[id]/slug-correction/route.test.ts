import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireOwnerMock = vi.hoisted(() => vi.fn());
const adminClientMock = vi.hoisted(() => vi.fn());
const callerClientMock = vi.hoisted(() => vi.fn());
const propagateMock = vi.hoisted(() => vi.fn());
const collectPathsMock = vi.hoisted(() => vi.fn(() => ['/khu-vuc/binh-duong', '/khu-vuc/binh-duong/tin-tuc']));

vi.mock('@/lib/server/requireAdmin', () => ({
  requireOwner: requireOwnerMock,
  adminClient: adminClientMock,
  callerClient: callerClientMock,
}));
vi.mock('@/lib/server/contentRevalidation', () => ({ collectContentRevalidationPaths: collectPathsMock }));
vi.mock('@/lib/server/publicIndexing', () => ({ propagatePublicIndexing: propagateMock }));

import { POST } from './route';

const ARTICLE_ID = 'f551d52c-3927-4d02-83a0-8cdb5996d365';
const OLD_SLUG = 'luat-kinh-doanh-bat-dong-san-moi-nhat-nam-2026-nhung-thay-doi-quan-trong-va-tac-dong-den-thi-truong-';
const NEW_SLUG = 'luat-kinh-doanh-bat-dong-san-moi-nhat-nam-2026-nhung-thay-doi-quan-trong-va-tac-dong-den-thi-truong';

function request(body: unknown, token = 'owner-token') {
  return new NextRequest(`http://localhost/api/admin/news/${ARTICLE_ID}/slug-correction`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function mockCaller() {
  const beforeQuery: Record<string, unknown> = {};
  beforeQuery.select = vi.fn(() => beforeQuery);
  beforeQuery.eq = vi.fn(() => beforeQuery);
  beforeQuery.maybeSingle = vi.fn().mockResolvedValue({ data: { id: ARTICLE_ID, slug: OLD_SLUG, category: 'Thị trường', is_published: true, area_id: 'area-1', geo_area: 'Bình Dương' }, error: null });
  callerClientMock.mockReturnValue({
    from: vi.fn((table: string) => table === 'news'
      ? beforeQuery
      : { select: vi.fn(async () => ({ data: table === 'areas' ? [{ id: 'area-1', slug: 'binh-duong', name: 'Bình Dương' }] : [{ label: 'Thị trường', slug: 'thi-truong' }], error: null })) }),
  });
}
beforeEach(() => {
  requireOwnerMock.mockReset();
  adminClientMock.mockReset();
  callerClientMock.mockReset();
  propagateMock.mockReset().mockResolvedValue({
    paths: ['/tin-tuc/old', '/tin-tuc/new'],
    freshness: { status: 'succeeded', queuedCount: 4, error: null },
    searchVisibility: { status: 'succeeded', runId: 'run-1', summary: null, error: null },
  });
  collectPathsMock.mockReset().mockReturnValue([
    '/khu-vuc/binh-duong',
    '/khu-vuc/binh-duong/tin-tuc',
    '/tin-tuc/danh-muc/thi-truong',
  ]);
});

describe('POST /api/admin/news/[id]/slug-correction', () => {
  it('từ chối request không phải owner MFA', async () => {
    requireOwnerMock.mockResolvedValue({ ok: false, status: 403, msg: 'Không có quyền.' });

    const response = await POST(request({ expectedOldSlug: OLD_SLUG, newSlug: NEW_SLUG }), { params: { id: ARTICLE_ID } });

    expect(response.status).toBe(403);
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it('từ chối slug mới không hợp lệ trước khi gọi database', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, userId: 'owner-1', token: 'owner-token' });

    const response = await POST(request({ expectedOldSlug: OLD_SLUG, newSlug: `${NEW_SLUG}-` }), { params: { id: ARTICLE_ID } });

    expect(response.status).toBe(400);
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it('gọi RPC server boundary và chỉ revalidate public paths, không gọi AI/RAG', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, userId: 'owner-1', token: 'owner-token' });
    mockCaller();
    const rpc = vi.fn().mockResolvedValue({
      data: [{
        id: ARTICLE_ID,
        title: 'Bài viết',
        old_slug: OLD_SLUG,
        slug: NEW_SLUG,
        category: 'Thị trường',
        is_published: true,
        published_at: null,
        content_version: 2,
        updated_at: '2026-09-13T00:00:00Z',
      }],
      error: null,
    });
    adminClientMock.mockReturnValue({ rpc });

    const response = await POST(request({ expectedOldSlug: OLD_SLUG, newSlug: NEW_SLUG }), { params: { id: ARTICLE_ID } });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('correct_news_slug_server', {
      p_news_id: ARTICLE_ID,
      p_expected_old_slug: OLD_SLUG,
      p_new_slug: NEW_SLUG,
      p_actor_id: 'owner-1',
    });
    expect(propagateMock).toHaveBeenCalledWith(expect.objectContaining({
      actorId: 'owner-1',
      paths: expect.arrayContaining([
        `/tin-tuc/${OLD_SLUG}`,
        `/tin-tuc/${NEW_SLUG}`,
        '/tin-tuc',
        '/tin-tuc/danh-muc/thi-truong',
        '/khu-vuc/binh-duong',
        '/khu-vuc/binh-duong/tin-tuc',
      ]),
      content: expect.objectContaining({
        entity: 'news',
        action: 'update',
        targets: [expect.objectContaining({
          current: expect.objectContaining({
            area_id: 'area-1',
            geo_area: 'Bình Dương',
            slug: NEW_SLUG,
          }),
        })],
      }),
    }));
    expect(json.propagation).toMatchObject({
      freshness: { status: 'succeeded' },
      searchVisibility: { status: 'succeeded' },
    });
  });

  it('trả conflict rõ ràng khi RPC báo slug trùng', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, userId: 'owner-1', token: 'owner-token' });
    mockCaller();
    adminClientMock.mockReturnValue({ rpc: vi.fn().mockResolvedValue({ data: null, error: { code: '23505', message: 'duplicate' } }) });

    const response = await POST(request({ expectedOldSlug: OLD_SLUG, newSlug: NEW_SLUG }), { params: { id: ARTICLE_ID } });

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Slug mới đã được bài viết khác sử dụng.', code: 'SLUG_CONFLICT' });
    expect(propagateMock).not.toHaveBeenCalled();
  });
});
