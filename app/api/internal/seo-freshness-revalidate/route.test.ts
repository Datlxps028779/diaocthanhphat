import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const revalidatePathMock = vi.hoisted(() => vi.fn());
vi.mock('next/cache', () => ({ revalidatePath: revalidatePathMock }));

import { POST } from './route';

function request(body: unknown, secret?: string): NextRequest {
  return new NextRequest('http://localhost/api/internal/seo-freshness-revalidate', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(secret ? { 'x-seo-freshness-secret': secret } : {}),
    },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  revalidatePathMock.mockReset();
  vi.stubEnv('SEO_FRESHNESS_INTERNAL_SECRET', 'test-secret');
});

describe('POST /api/internal/seo-freshness-revalidate', () => {
  it('rejects missing or incorrect worker secret', async () => {
    expect((await POST(request({ paths: ['/sitemap.xml'] }))).status).toBe(401);
    expect((await POST(request({ paths: ['/sitemap.xml'] }, 'wrong'))).status).toBe(401);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('rejects arbitrary paths and query strings', async () => {
    expect((await POST(request({ paths: ['/admin'] }, 'test-secret'))).status).toBe(400);
    expect((await POST(request({ paths: ['/mua-ban?area=x'] }, 'test-secret'))).status).toBe(400);
    expect(revalidatePathMock).not.toHaveBeenCalled();
  });

  it('deduplicates and revalidates only allowlisted public paths', async () => {
    const response = await POST(request({ paths: ['/sitemap.xml', '/sitemap.xml', '/mua-ban/binh-duong/thuan-an/dat'] }, 'test-secret'));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, count: 2 });
    expect(revalidatePathMock.mock.calls.map(([path]) => path)).toEqual([
      '/sitemap.xml',
      '/mua-ban/binh-duong/thuan-an/dat',
    ]);
  });
});
