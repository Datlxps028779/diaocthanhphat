import { afterEach, describe, expect, it, vi } from 'vitest';
import { getHomeLocationStats } from './homeLocationStats';

const complete = { computedAt: '2026-09-16T04:00:00.000Z', totalCount: 0, areas: {} };

afterEach(() => vi.unstubAllGlobals());

describe('getHomeLocationStats', () => {
  it('fetches one public aggregate with an abort signal', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(complete)));
    vi.stubGlobal('fetch', fetcher);
    const signal = new AbortController().signal;
    expect(await getHomeLocationStats(signal)).toEqual(complete);
    expect(fetcher).toHaveBeenCalledWith('/api/public/location-stats', { signal, credentials: 'omit' });
  });

  it('does not turn a failed request into zero counts', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 503 })));
    await expect(getHomeLocationStats()).rejects.toThrow('Không tải được số liệu khu vực');
  });

  it.each([
    {},
    { ...complete, areas: null },
    { ...complete, totalCount: -1 },
    { ...complete, computedAt: 'invalid' },
    { ...complete, areas: { a: { count: 0 } } },
  ])('rejects incomplete aggregate responses: %j', async data => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
    await expect(getHomeLocationStats()).rejects.toThrow('Số liệu khu vực không hợp lệ');
  });

  it('preserves zero counts and nullable prices in a completed response', async () => {
    const data = { ...complete, areas: { a: {
      count: 0, saleCount: 0, pricedSaleCount: 0, sqmSampleCount: 0,
      minSalePriceVnd: null, avgSalePriceVnd: null, avgSalePricePerSqmVnd: null,
      districtCounts: {},
    } } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(data))));
    expect(await getHomeLocationStats()).toEqual(data);
  });
});
