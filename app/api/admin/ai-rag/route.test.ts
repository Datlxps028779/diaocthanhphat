import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const adminClientMock = vi.hoisted(() => vi.fn());
const requireOwnerMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/requireAdmin', () => ({ adminClient: adminClientMock, requireOwner: requireOwnerMock }));

import { POST } from './route';

function request(body: unknown = {}, token = 'owner-token'): NextRequest {
  return new NextRequest('http://localhost/api/admin/ai-rag', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  adminClientMock.mockReset();
  requireOwnerMock.mockReset();
});

describe('/api/admin/ai-rag', () => {
  it('yêu cầu owner MFA trước khi chạm service role client', async () => {
    requireOwnerMock.mockResolvedValue({ ok: false, status: 403, msg: 'Tài khoản không có quyền truy cập.' });

    const response = await POST(request({ target: 'news' }));

    expect(response.status).toBe(403);
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it('từ chối target ngoài allowlist trước khi gọi RPC', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });

    const response = await POST(request({ target: 'admin_docs' }));
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json).toEqual({ error: 'Nguồn RAG không hợp lệ.', code: 'INVALID_TARGET' });
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it('gọi refresh qua service role server với target hợp lệ', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    const rpc = vi.fn().mockResolvedValue({ data: 79, error: null });
    adminClientMock.mockReturnValue({ rpc });

    const response = await POST(request({ target: 'news' }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('refresh_rag_index', { target: 'news' });
    expect(json).toEqual({ ok: true, target: 'news', chunkCount: 79 });
  });

  it.each([null, [], 'news', 42, true].map(value => [value]))('từ chối body không phải object: %j', async body => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });

    const response = await POST(request(body));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_BODY');
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it.each(['', '{', '{"target":'])('từ chối JSON lỗi hoặc rỗng: %j', async body => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    const req = new NextRequest('http://localhost/api/admin/ai-rag', {
      method: 'POST',
      headers: { authorization: 'Bearer owner-token', 'content-type': 'application/json' },
      body,
    });

    const response = await POST(req);

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_BODY');
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it.each([null, 42, false, [], {}, '', ' news ', 'admin_docs'].map(value => [value]))('từ chối target không hợp lệ: %j', async target => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });

    const response = await POST(request({ target }));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_TARGET');
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it('không coi field viết sai là yêu cầu refresh toàn bộ', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });

    const response = await POST(request({ targte: 'news' }));

    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe('INVALID_BODY');
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it.each(['properties', 'news', 'property_types', 'news_categories', 'neighborhoods', 'areas', 'price_stats', 'managed_pages', 'ai_chat_knowledge'])('giữ target %s khi gọi RPC server', async target => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    const rpc = vi.fn().mockResolvedValue({ data: 1, error: null });
    adminClientMock.mockReturnValue({ rpc });

    const response = await POST(request({ target }));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('refresh_rag_index', { target });
  });

  it('giữ yêu cầu refresh toàn bộ chỉ với object rỗng hợp lệ', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    const rpc = vi.fn().mockResolvedValue({ data: 171, error: null });
    adminClientMock.mockReturnValue({ rpc });

    const response = await POST(request({}));

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('refresh_rag_index', {});
    expect(await response.json()).toEqual({ ok: true, target: null, chunkCount: 171 });
  });

  it('trả lỗi server config khi chưa có service role client', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    adminClientMock.mockReturnValue(null);

    const response = await POST(request({ target: 'news' }));

    expect(response.status).toBe(503);
    expect((await response.json()).code).toBe('SERVER_CONFIG');
  });
});
