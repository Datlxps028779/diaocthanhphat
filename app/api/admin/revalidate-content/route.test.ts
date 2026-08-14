import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const revalidatePathMock = vi.hoisted(() => vi.fn());
const callerClientMock = vi.hoisted(() => vi.fn());
const requireOwnerMock = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('@/lib/server/requireAdmin', () => ({
  callerClient: callerClientMock,
  requireOwner: requireOwnerMock,
}));

import { POST } from './route';

function request(body: unknown, token = 'editor-token'): NextRequest {
  return new NextRequest('http://localhost/api/admin/revalidate-content', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function makeClient(options: {
  areas?: Array<{ id: string; slug: string }>;
  categories?: Array<{ label: string; slug: string }>;
  areasError?: { message: string } | null;
  categoriesError?: { message: string } | null;
} = {}) {
  return {
    from: vi.fn((table: string) => ({
      select: vi.fn(async () => {
        if (table === 'areas') {
          return { data: options.areas ?? [{ id: 'area-1', slug: 'binh-duong' }], error: options.areasError ?? null };
        }
        if (table === 'news_categories') {
          return { data: options.categories ?? [{ label: 'Thị trường', slug: 'thi-truong' }], error: options.categoriesError ?? null };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    })),
  };
}

beforeEach(() => {
  revalidatePathMock.mockReset();
  callerClientMock.mockReset();
  requireOwnerMock.mockReset();
});

describe('POST /api/admin/revalidate-content', () => {
  it('trả 401 khi chưa có bearer token hợp lệ', async () => {
    requireOwnerMock.mockResolvedValue({ ok: false, status: 401, msg: 'Chưa đăng nhập.' });

    const response = await POST(request({ entity: 'news', action: 'publish', targets: [] }, ''));

    expect(response.status).toBe(401);
    expect(callerClientMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('trả 403 cho tài khoản không phải owner MFA', async () => {
    requireOwnerMock.mockResolvedValue({ ok: false, status: 403, msg: 'Tài khoản không có quyền truy cập.' });

    const response = await POST(request({ entity: 'news', action: 'publish', targets: [] }));

    expect(response.status).toBe(403);
    expect(callerClientMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('trả 400 cho payload sai trước khi truy vấn lookup', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'editor-token', userId: 'u1' });

    const response = await POST(request({
      entity: 'news',
      action: 'publish',
      path: '/khong-duoc-purge-tuy-y',
      targets: [{ current: { id: 'n1', slug: 'bai-moi', category: 'Thị trường' } }],
    }));

    expect(response.status).toBe(400);
    expect(callerClientMock).not.toHaveBeenCalled();
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('chỉ revalidate các route allowlist tạo từ snapshot Tin tức', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'editor-token', userId: 'u1' });
    callerClientMock.mockReturnValue(makeClient());

    const response = await POST(request({
      entity: 'news',
      action: 'update',
      path: '/khong-duoc-purge-tuy-y',
      targets: [{
        previous: { id: 'n1', slug: 'bai-cu', category: 'Thị trường', is_published: true },
        current: { id: 'n1', slug: 'bai-moi', category: 'Thị trường', is_published: true },
      }],
    }));

    expect(response.status).toBe(200);
    expect(revalidatePathMock.mock.calls.map(([path]) => path)).toEqual([
      '/',
      '/tin-tuc',
      '/tin-tuc/bai-cu',
      '/tin-tuc/bai-moi',
      '/tin-tuc/danh-muc/thi-truong',
    ]);
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/khong-duoc-purge-tuy-y');
  });

  it('trả 503 khi không tải được lookup URL public', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'editor-token', userId: 'u1' });
    callerClientMock.mockReturnValue(makeClient({ areasError: { message: 'RLS denied' } }));

    const response = await POST(request({
      entity: 'property',
      action: 'publish',
      targets: [{ current: {
        id: 'p1', slug: 'nha-dep', public_code: 101, listing_type: 'mua_ban',
        district: 'Thuận An', area_id: 'area-1', is_active: true,
      } }],
    }));

    expect(response.status).toBe(503);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });
});
