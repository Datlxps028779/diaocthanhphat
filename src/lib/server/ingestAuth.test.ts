import { afterEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { requireIngestAuth } from './ingestAuth';

const VALID_KEY = 'make-secret-at-least-20-chars';
const ORIGINAL_KEY = process.env.MAKE_API_KEY;

function request(key?: string): NextRequest {
  return new NextRequest('http://localhost/api/public/articles', {
    method: 'POST',
    headers: key ? { 'x-api-key': key } : undefined,
  });
}

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.MAKE_API_KEY;
  else process.env.MAKE_API_KEY = ORIGINAL_KEY;
});

describe('requireIngestAuth', () => {
  it('trả 503 khi server chưa cấu hình MAKE_API_KEY', () => {
    delete process.env.MAKE_API_KEY;
    expect(requireIngestAuth(request())).toEqual({
      ok: false,
      status: 503,
      msg: 'Chưa cấu hình MAKE_API_KEY trên server.',
    });
  });

  it('trả 503 khi khóa cấu hình ngắn hơn 20 ký tự', () => {
    process.env.MAKE_API_KEY = 'too-short';
    const result = requireIngestAuth(request('too-short'));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(503);
    expect(result.msg).toMatch(/tối thiểu 20 ký tự/);
  });

  it('trả 401 khi thiếu hoặc sai x-api-key', () => {
    process.env.MAKE_API_KEY = VALID_KEY;
    expect(requireIngestAuth(request())).toMatchObject({ ok: false, status: 401 });
    expect(requireIngestAuth(request('wrong-key'))).toMatchObject({ ok: false, status: 401 });
  });

  it('cho qua khi x-api-key khớp chính xác', () => {
    process.env.MAKE_API_KEY = VALID_KEY;
    expect(requireIngestAuth(request(VALID_KEY))).toEqual({ ok: true });
  });
});
