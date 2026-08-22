import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const callerClientMock = vi.hoisted(() => vi.fn());
const requireOwnerMock = vi.hoisted(() => vi.fn());
const syncMock = vi.hoisted(() => vi.fn());

const searchVisibilityErrorMock = vi.hoisted(() => class SearchVisibilitySyncError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
});

vi.mock('@/lib/server/requireAdmin', () => ({ callerClient: callerClientMock, requireOwner: requireOwnerMock }));
vi.mock('@/lib/server/searchVisibilityService', () => ({ syncSearchVisibilityAudit: syncMock, SearchVisibilitySyncError: searchVisibilityErrorMock }));

import { GET, POST } from './route';

function request(method: 'GET' | 'POST', token = 'owner-token'): NextRequest {
  return new NextRequest('http://localhost/api/admin/search-visibility', {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function query(data: unknown, error: { message: string } | null = null) {
  const state = { data, error };
  return {
    select: vi.fn(() => ({
      order: vi.fn(() => ({
        order: vi.fn(() => ({ limit: vi.fn(async () => state) })),
        limit: vi.fn(async () => state),
      })),
    })),
  };
}

beforeEach(() => {
  callerClientMock.mockReset();
  requireOwnerMock.mockReset();
  syncMock.mockReset();
});

describe('/api/admin/search-visibility', () => {
  it('từ chối GET khi không phải owner MFA', async () => {
    requireOwnerMock.mockResolvedValue({ ok: false, status: 403, msg: 'Tài khoản không có quyền truy cập.' });

    const response = await GET(request('GET'));

    expect(response.status).toBe(403);
    expect(callerClientMock).not.toHaveBeenCalled();
  });

  it('chỉ trả audit evidence nội bộ, không gán nhãn index cho URL không có evidence', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'u1' });
    callerClientMock.mockReturnValue({
      from: vi.fn((table: string) => table === 'search_visibility_urls'
        ? query([{ source_key: 'news:n1', entity_type: 'news', canonical_url: 'https://chonhaviet.com/tin-tuc/bai', eligible: true, reason_code: 'ELIGIBLE', reason_detail: null, evaluated_at: '2026-08-20T00:00:00Z', sitemap_status: 'not_needed', inspection_status: 'not_requested', google_verdict: null, google_coverage_state: null, google_canonical: null, user_canonical: null, google_robots_state: null, evidence_observed_at: null }])
        : query([])),
    });

    const response = await GET(request('GET'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.summary).toMatchObject({ total: 1, eligible: 1, excluded: 0, googleEvidenceCount: 0 });
    expect(JSON.stringify(json)).not.toContain('indexed');
  });


  it('POST chỉ chạy local eligibility sync và yêu cầu owner MFA', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'u1' });
    syncMock.mockResolvedValue({ runId: 'run-1', summary: { total: 4, eligible: 3, excluded: 1, byReason: {}, byEntity: {} } });

    const response = await POST(request('POST'));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(syncMock).toHaveBeenCalledWith('u1');
    expect(json).toMatchObject({ ok: true, runId: 'run-1' });
  });

  it('trả mã lỗi canonical policy rõ ràng khi audit bị chặn trước khi lưu', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'u1' });
    syncMock.mockRejectedValue(new searchVisibilityErrorMock('CANONICAL_POLICY', 'URL canonical không khớp domain https://chonhaviet.com.'));

    const response = await POST(request('POST'));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({ error: 'URL canonical không khớp domain https://chonhaviet.com.', code: 'CANONICAL_POLICY' });
  });

  it('trả mã lỗi canonical constraint để hướng dẫn chạy migration sửa production', async () => {
    requireOwnerMock.mockResolvedValue({ ok: true, token: 'owner-token', userId: 'u1' });
    syncMock.mockRejectedValue(new searchVisibilityErrorMock('CANONICAL_CONSTRAINT', 'Constraint canonical trong production chưa khớp chính sách.'));

    const response = await POST(request('POST'));
    const json = await response.json();

    expect(response.status).toBe(503);
    expect(json).toEqual({ error: 'Constraint canonical trong production chưa khớp chính sách.', code: 'CANONICAL_CONSTRAINT' });
  });
});
