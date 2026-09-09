import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const requireOwnerMock = vi.hoisted(() => vi.fn());
const adminClientMock = vi.hoisted(() => vi.fn());
const observabilityMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/server/requireAdmin', () => ({ requireOwner: requireOwnerMock, adminClient: adminClientMock }));
vi.mock('@/lib/server/seoFreshnessObservability', () => ({
  getFreshnessQueueObservability: observabilityMock,
  sanitizeFreshnessError: (value: unknown) => value instanceof Error ? value.message : String(value),
}));

import { GET } from './route';

function request(token = 'owner-token'): NextRequest {
  return new NextRequest('http://localhost/api/admin/seo-freshness', {
    method: 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

beforeEach(() => {
  requireOwnerMock.mockReset();
  adminClientMock.mockReset();
  observabilityMock.mockReset();
});

describe('GET /api/admin/seo-freshness', () => {
  it('từ chối người chưa có quyền owner MFA', async () => {
    requireOwnerMock.mockResolvedValue({ ok: false, status: 403, msg: 'Tài khoản không có quyền truy cập.' });

    const response = await GET(request());

    expect(response.status).toBe(403);
    expect(adminClientMock).not.toHaveBeenCalled();
  });

  it('trả 503 khi server thiếu service-role client', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    adminClientMock.mockReturnValue(null);

    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json.code).toBe('SERVER_CONFIG');
    expect(observabilityMock).not.toHaveBeenCalled();
  });

  it('đọc queue qua server client và chỉ trả DTO observability', async () => {
    const result = {
      summary: {
        counts: { pending: 0, processing: 0, succeeded: 24, failed: 0, dead_letter: 0 },
        total: 24,
        oldestPending: null,
        nextRetry: null,
        latestSucceededAt: '2026-09-09T09:10:02.164Z',
      },
      alerts: [],
      generatedAt: '2026-09-09T09:30:00.000Z',
    };
    const client = { from: vi.fn() };
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    adminClientMock.mockReturnValue(client);
    observabilityMock.mockResolvedValue(result);

    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(observabilityMock).toHaveBeenCalledWith(client);
    expect(json).toEqual(result);
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('ẩn chi tiết lỗi database bằng lỗi 503 bounded', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'owner-1' });
    adminClientMock.mockReturnValue({ from: vi.fn() });
    observabilityMock.mockRejectedValue(new Error('postgres password=top-secret relation internals'));

    const response = await GET(request());
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({ error: 'Không tải được trạng thái freshness queue.', code: 'QUEUE_READ' });
    expect(JSON.stringify(json)).not.toContain('top-secret');
  });
});
