import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  check: vi.fn(),
  from: vi.fn(),
  snapshot: vi.fn(),
}));
vi.mock('@/lib/localityRequest', () => ({ checkLocalityRequest: mocks.check }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));
vi.mock('@supabase/ssr', () => ({ createServerClient: vi.fn() }));
vi.mock('@/lib/server/localityNewsSnapshotTransport', () => ({ loadLocalityNewsSnapshot: mocks.snapshot }));

afterEach(() => vi.unstubAllEnvs());

function areaQuery(result: unknown) {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'eq']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(async () => result);
  return builder;
}

const article = (id: string, extra: Record<string, unknown> = {}) => ({
  id, title: id, slug: `bai-${id}`, excerpt: null, image_url: null, category: 'Tin', author: 'Toà soạn',
  views: 0, focus_keywords: null, geo_area: null, area_id: 'a-bd', district_id: null, ward_id: null,
  is_published: true, created_at: '2026-09-01T00:00:00.000Z', updated_at: '2026-09-01T00:00:00.000Z', ...extra,
});

async function requestPath(pathname = '/khu-vuc/binh-duong/tin-tuc') {
  const { middleware } = await import('./middleware');
  return middleware(new NextRequest(`https://example.test${pathname}`));
}

async function request() {
  return requestPath();
}

describe('public news middleware status', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon');
    mocks.from.mockReset();
  });

  it.each([
    '/tin-tuc/bai-viet-',
    '/tin-tuc/bai%20viet',
    '/tin-tuc/%20bai-viet',
    '/tin-tuc/bai-viet%20',
    '/tin-tuc/bai%2Fviet',
    '/tin-tuc/%E0%A4%A',
  ])('returns a hard 404 for malformed article path %s before reading data', async pathname => {
    const response = await requestPath(pathname);
    expect(response.status).toBe(404);
    expect(response.headers.get('x-middleware-rewrite')).toContain('/_news-not-found');
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('rejects malformed news paths even without Supabase configuration', async () => {
    for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) {
      vi.stubEnv(key, '');
    }
    expect((await requestPath('/tin-tuc/bai-viet-')).status).toBe(404);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('includes news paths in the actual middleware matcher', async () => {
    const { config } = await import('./middleware');
    expect(config.matcher).toContain('/tin-tuc/:path*');
  });

  it.each([
    '/tin-tuc',
    '/tin-tuc/bai-viet-hop-le',
    '/tin-tuc/a8a2b8d1-a5a6-482b-9cd6-5c539f0140b4',
    '/tin-tuc/danh-muc/thi-truong',
  ])('passes through a supported public news path %s', async pathname => {
    const response = await requestPath(pathname);
    expect(response.headers.get('x-middleware-next')).toBe('1');
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe('locality news middleware status', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'test-anon');
    mocks.from.mockReset();
    mocks.snapshot.mockReset();
    mocks.check.mockReset().mockResolvedValue({ status: 'valid', path: '/khu-vuc/binh-duong' });
  });

  function source(rows: unknown[], area: unknown = { id: 'a-bd', name: 'Bình Dương', slug: 'binh-duong' }, error: unknown = null) {
    mocks.from.mockReturnValueOnce(areaQuery({ data: area, error: null }));
    mocks.snapshot.mockResolvedValue(rows);
    if (error) mocks.snapshot.mockRejectedValue(error);
  }

  it('passes through three unique exact matches', async () => {
    source([article('1'), article('2'), article('3')]);
    const response = await request();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('normalizes narrative whitespace and filters invalid slugs before threshold', async () => {
    source([
      article('1'),
      article('2'),
      article('3', { area_id: null, geo_area: '  Bình   Dương ' }),
      article('invalid', { area_id: null, geo_area: 'Bình Dương', slug: 'not a slug' }),
    ]);
    expect((await request()).headers.get('x-middleware-next')).toBe('1');
  });

  it('merges the complete snapshot before applying the minimum', async () => {
    source([
      article('structured-1'),
      article('structured-2'),
      article('narrative-3', { area_id: null, geo_area: 'Bình Dương' }),
    ]);
    expect((await request()).headers.get('x-middleware-next')).toBe('1');
  });

  it('does not count narrative substrings', async () => {
    source([article('1'), article('2'), article('3', { area_id: null, geo_area: 'Bình Dương và Đồng Nai' })]);
    expect((await request()).status).toBe(404);
  });

  it('returns 503 and noindex when the news source fails', async () => {
    source([], undefined, { message: 'unavailable' });
    const response = await request();
    expect(response.status).toBe(503);
    expect(response.headers.get('x-robots-tag')).toBe('noindex');
  });

  it('rejects an unknown locality before reading news', async () => {
    mocks.check.mockResolvedValue({ status: 'not-found' });
    expect((await request()).status).toBe(404);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
