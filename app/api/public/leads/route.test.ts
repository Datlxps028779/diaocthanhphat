import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const createServerClientMock = vi.hoisted(() => vi.fn());
const cookiesMock = vi.hoisted(() => vi.fn());

vi.mock('@supabase/ssr', () => ({ createServerClient: createServerClientMock }));
vi.mock('next/headers', () => ({ cookies: cookiesMock }));

import { POST } from './route';

function request(body: string | Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost/api/public/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'user-agent': 'test-agent' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    full_name: ' Nguyễn Văn A ',
    phone: '+84 901 234 567',
    property_id: '11111111-1111-4111-8111-111111111111',
    property_title: 'Nhà phố Bình Dương',
    message: 'Xin tư vấn',
    budget: '3 tỷ',
    source: 'property_detail_form',
    ...overrides,
  };
}

const db = {
  rpc: vi.fn(),
};

beforeEach(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://supabase.example';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon-key';
  cookiesMock.mockReturnValue({ getAll: () => [], set: vi.fn() });
  db.rpc.mockReset();
  db.rpc.mockResolvedValue({ data: null, error: null });
  createServerClientMock.mockReset();
  createServerClientMock.mockReturnValue(db);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
});

describe('POST /api/public/leads', () => {
  it('ghi lead qua Supabase với user_id và gửi webhook server-side', async () => {
    const response = await POST(request(validPayload()));

    expect(response.status).toBe(201);
    const body = await response.json() as { id: string };
    expect(body.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(db.rpc).toHaveBeenCalledWith('public_submit_lead', expect.objectContaining({
      p_id: body.id,
      p_full_name: 'Nguyễn Văn A',
      p_phone: '0901234567',
      p_property_id: '11111111-1111-4111-8111-111111111111',
      p_source: 'property_detail_form',
    }));
    expect(fetch).toHaveBeenCalledWith(
      'https://supabase.example/functions/v1/crm-webhook',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          full_name: 'Nguyễn Văn A',
          phone: '0901234567',
          property_id: '11111111-1111-4111-8111-111111111111',
          property_title: 'Nhà phố Bình Dương',
          message: 'Xin tư vấn',
          budget: '3 tỷ',
        }),
      }),
    );
  });

  it('từ chối body không hợp lệ trước khi chạm DB', async () => {
    const response = await POST(request({ full_name: 'A', phone: '0123456789', source: 'admin_import' }));

    expect(response.status).toBe(400);
    expect(createServerClientMock).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('không làm request thất bại khi webhook lỗi sau khi lead đã lưu', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('webhook down')));

    const response = await POST(request(validPayload()));

    expect(response.status).toBe(201);
  });

  it('trả conflict khi id caller đã tồn tại', async () => {
    db.rpc.mockResolvedValue({ error: { code: '23505' } });

    const response = await POST(request(validPayload({ id: '11111111-1111-4111-8111-111111111111' })));

    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'Yêu cầu này đã được ghi nhận.' });
    expect(fetch).not.toHaveBeenCalled();
  });
});
