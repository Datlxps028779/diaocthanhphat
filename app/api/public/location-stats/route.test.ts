import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const { loadMock, cacheMock, cacheEntries, cachedCall } = vi.hoisted(() => {
  const cacheEntries = new Map<string, unknown>();
  const cachedCall = vi.fn();
  return { loadMock: vi.fn(), cacheEntries, cachedCall,
    cacheMock: vi.fn((fn: (...args: unknown[]) => Promise<unknown>) => async (...args: unknown[]) => {
      cachedCall(...args);
      const key = JSON.stringify(args);
      if (cacheEntries.has(key)) return cacheEntries.get(key);
      const result = await fn(...args);
      cacheEntries.set(key, result);
      return result;
    }),
  };
});
vi.mock('@/lib/server/homeLocationStats', () => ({ loadHomeLocationStats: loadMock }));
vi.mock('next/cache', () => ({ unstable_cache: cacheMock }));
import { GET, dynamic } from './route';

beforeEach(() => { loadMock.mockReset(); cacheEntries.clear(); cachedCall.mockClear(); });
afterEach(() => { vi.useRealTimers(); });

describe('GET /api/public/location-stats', () => {
  it('returns only the aggregate contract and uses explicit short server caching, not automatic route caching', async () => {
    const aggregate = { computedAt: '2026-09-16T00:00:00.000Z', totalCount: 0, areas: {} };
    loadMock.mockResolvedValue(aggregate);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(aggregate);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(dynamic).toBe('force-dynamic');
    expect(cacheMock).toHaveBeenCalledWith(expect.any(Function), ['public-location-stats-v1'], { revalidate: 60 });
    expect(loadMock).toHaveBeenCalledWith();
  });

  it('uses a bounded minute key so stale-while-revalidate cannot conceal failure using an old bucket', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-16T00:00:01.000Z'));
    loadMock.mockResolvedValue({ computedAt: new Date().toISOString(), totalCount: 0, areas: {} });
    await GET();
    await GET();
    expect(loadMock).toHaveBeenCalledTimes(1);
    expect(cachedCall).toHaveBeenLastCalledWith(Math.floor(Date.now() / 60_000));
    vi.setSystemTime(new Date('2026-09-16T00:01:01.000Z'));
    loadMock.mockRejectedValue(new Error('db detail / property IDs / contact'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'Chưa tải được số liệu khu vực.' });
  });

  it('fails with generic 503 and no-store, never a zero/partial aggregate or raw backend error', async () => {
    loadMock.mockRejectedValue(new Error('secret property-id owner-contact'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(response.headers.get('retry-after')).toBe('60');
    expect(await response.json()).toEqual({ error: 'Chưa tải được số liệu khu vực.' });
  });

  it('does not convert a rejection into cacheable empty data, and a subsequent attempt can succeed', async () => {
    loadMock.mockRejectedValueOnce(new Error('fail')).mockResolvedValueOnce({ computedAt: 'now', totalCount: 4, areas: {} });
    expect((await GET()).status).toBe(503);
    const next = await GET();
    expect(next.status).toBe(200);
    expect((await next.json()).totalCount).toBe(4);
  });
});
