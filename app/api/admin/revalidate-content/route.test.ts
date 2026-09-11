import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const revalidatePathMock = vi.hoisted(() => vi.fn());
const callerClientMock = vi.hoisted(() => vi.fn());
const adminClientMock = vi.hoisted(() => vi.fn());
const requireOwnerMock = vi.hoisted(() => vi.fn());

vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));
vi.mock('@/lib/server/requireAdmin', () => ({
  adminClient: adminClientMock,
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
  districts?: Array<{ id: string; area_id: string; slug: string }>;
  propertyTypes?: Array<{ id: string; slug: string }>;
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
        if (table === 'districts') {
          return { data: options.districts ?? [], error: null };
        }
        if (table === 'property_types') {
          return { data: options.propertyTypes ?? [], error: null };
        }
        throw new Error(`Unexpected table: ${table}`);
      }),
    })),
  };
}

beforeEach(() => {
  revalidatePathMock.mockReset();
  callerClientMock.mockReset();
  adminClientMock.mockReset();
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
      '/kien-thuc',
      '/sitemap-images.xml',
      '/sitemap.xml',
      '/tin-tuc',
      '/tin-tuc/bai-cu',
      '/tin-tuc/bai-moi',
      '/tin-tuc/danh-muc/thi-truong',
    ]);
    expect(revalidatePathMock).not.toHaveBeenCalledWith('/khong-duoc-purge-tuy-y');
  });

  it('queues allowlisted paths after a successful mutation snapshot', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'editor-token', userId: 'u1' });
    callerClientMock.mockReturnValue(makeClient());
    const upsert = vi.fn(async () => ({ error: null }));
    const from = vi.fn(() => ({ upsert }));
    adminClientMock.mockReturnValue({ from });

    const response = await POST(request({
      entity: 'property',
      action: 'publish',
      targets: [{ current: {
        id: 'p1', slug: 'nha-dep', public_code: 101, listing_type: 'mua_ban',
        district: 'Thuận An', area_id: 'area-1', is_active: true,
      } }],
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.queuedCount).toBeGreaterThan(0);
    expect(from).toHaveBeenCalledWith('seo_freshness_jobs');
    expect(upsert).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({ event_kind: 'property', event_action: 'publish', path: '/sitemap.xml' }),
    ]), { onConflict: 'dedupe_key', ignoreDuplicates: true });
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
