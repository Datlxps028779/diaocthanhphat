import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadHomeLocationStats, type HomeLocationStatsLoaderOptions } from './homeLocationStats';

const row = (id: string, extra = {}) => ({ id, area_id: 'bd', district_id: 'd1', listing_type: 'mua_ban', price: 1, price_unit: 'tỷ', price_per_month: null, area_sqm: 100, ...extra });
const page = (rows: unknown[], count: number | string) => new Response(JSON.stringify(rows), {
  headers: { 'content-range': `${rows.length ? `0-${rows.length - 1}` : '*'}/${count}`, 'content-type': 'application/json' },
});
const options = (fetcher: typeof fetch, overrides: Partial<HomeLocationStatsLoaderOptions> = {}): HomeLocationStatsLoaderOptions => ({
  fetcher, url: 'https://public.example', anonKey: 'public-anon-key', pageSize: 2, ...overrides,
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('loadHomeLocationStats', () => {
  it('reads every keyset page, checks the remaining exact count and verifies final total with anonymous GET only', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page([row('a'), row('b')], 3))
      .mockResolvedValueOnce(page([row('c')], 1))
      .mockResolvedValueOnce(page([row('a')], 3));
    const result = await loadHomeLocationStats(options(fetcher));
    expect(result.totalCount).toBe(3);
    expect(result.areas.bd.avgSalePriceVnd).toBe(1e9);
    expect(fetcher).toHaveBeenCalledTimes(3);
    const requests = fetcher.mock.calls.map(([url, init]) => ({ url: new URL(String(url)), init }));
    for (const { url, init } of requests) {
      expect(url.pathname).toBe('/rest/v1/public_properties');
      expect(url.searchParams.get('is_active')).toBe('eq.true');
      expect(url.searchParams.has('status')).toBe(false);
      expect(url.searchParams.get('order')).toBe('id.asc');
      expect(url.searchParams.get('select')).toBe('id,area_id,district_id,listing_type,price,price_unit,price_per_month,area_sqm');
      expect(init).toMatchObject({ method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error' });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      expect(init?.headers).toEqual({ apikey: 'public-anon-key', Authorization: 'Bearer public-anon-key', Prefer: 'count=exact' });
    }
    expect(requests[0].url.searchParams.has('id')).toBe(false);
    expect(requests[1].url.searchParams.get('id')).toBe('gt.b');
    expect(requests[2].url.searchParams.has('id')).toBe(false);
    expect(requests[2].url.searchParams.get('limit')).toBe('1');
    expect(JSON.stringify(result)).not.toContain('property_id');
    expect(Object.keys(result.areas.bd)).not.toContain('id');
  });

  it('allows a server page smaller than requested only when all counted rows are subsequently fetched', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(page([row('a')], 2))
      .mockResolvedValueOnce(page([row('b')], 1)).mockResolvedValueOnce(page([row('a')], 2));
    expect((await loadHomeLocationStats(options(fetcher))).totalCount).toBe(2);
  });

  it('returns zero only after a successful complete empty query and final verification', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => page([], 0));
    expect(await loadHomeLocationStats(options(fetcher))).toMatchObject({ totalCount: 0, areas: {} });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['missing exact count', () => new Response('[]')],
    ['estimated/wildcard count', () => page([], '*')],
    ['excess rows', () => page([row('a'), row('b')], 1)],
    ['duplicate IDs', () => page([row('a'), row('a')], 2)],
    ['unsorted IDs', () => page([row('b'), row('a')], 2)],
    ['malformed ID', () => page([row('a,or(id.gt.x)')], 1)],
    ['missing projection fields', () => page([{ id: 'a' }], 1)],
    ['malformed body', () => new Response('{')],
    ['non-array body', () => new Response('{}', { headers: { 'content-range': '*/0' } })],
    ['HTTP denial', () => new Response('secret DB message', { status: 403 })],
    ['over 5000 cap', () => page([row('a')], 5001)],
    ['incomplete first page', () => page([], 1)],
  ])('fails closed for %s', async (_label, response) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response());
    await expect(loadHomeLocationStats(options(fetcher))).rejects.toThrow('Location statistics unavailable');
  });

  it.each([
    ['changed remaining count', [page([row('a'), row('b')], 3), page([row('c')], 2)]],
    ['incomplete later page', [page([row('a'), row('b')], 3), page([], 1)]],
    ['repeated cursor', [page([row('a'), row('b')], 3), page([row('b')], 1)]],
    ['decreasing cursor', [page([row('a'), row('b')], 3), page([row('a')], 1)]],
    ['final count changed', [page([row('a')], 1), page([row('a')], 2)]],
    ['final empty truncated', [page([row('a')], 1), page([], 1)]],
    ['final first ID changed', [page([row('a')], 1), page([row('b')], 1)]],
  ])('does not return partial aggregates on %s', async (_label, responses) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => responses.shift()!);
    await expect(loadHomeLocationStats(options(fetcher))).rejects.toThrow('Location statistics unavailable');
  });

  it('fails on a network error between pages without leaking error detail', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(page([row('a'), row('b')], 3))
      .mockRejectedValueOnce(new Error('credentials and private network detail'));
    await expect(loadHomeLocationStats(options(fetcher))).rejects.toThrow(/^Location statistics unavailable$/);
  });

  it('enforces a maximum page budget and never requests an extra page', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(page([row('a'), row('b')], 3));
    await expect(loadHomeLocationStats(options(fetcher, { maxPages: 1 }))).rejects.toThrow('Location statistics unavailable');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('supports exactly the row cap and refuses counts exceeding an injected smaller cap', async () => {
    const good = vi.fn<typeof fetch>().mockResolvedValueOnce(page([row('a'), row('b')], 2))
      .mockResolvedValueOnce(page([row('a')], 2));
    expect((await loadHomeLocationStats(options(good, { maxRows: 2 }))).totalCount).toBe(2);
    const bad = vi.fn<typeof fetch>().mockResolvedValueOnce(page([row('a'), row('b')], 3));
    await expect(loadHomeLocationStats(options(bad, { maxRows: 2 }))).rejects.toThrow('Location statistics unavailable');
  });

  it('aborts a hanging request and bounds the entire loader, not just each page', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      signal = init?.signal as AbortSignal;
      return new Promise<Response>(() => {});
    });
    const pending = loadHomeLocationStats(options(fetcher, { timeoutMs: 25 }));
    const assertion = expect(pending).rejects.toThrow('Location statistics unavailable');
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    expect(signal?.aborted).toBe(true);
  });

  it('bounds cumulative page time and drops any unexpected upstream private fields', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>()
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(page([row('a'), row('b')], 3)), 15)))
      .mockImplementationOnce(() => new Promise(resolve => setTimeout(() => resolve(page([row('c')], 1)), 15)));
    const pending = loadHomeLocationStats(options(fetcher, { timeoutMs: 25 }));
    const assertion = expect(pending).rejects.toThrow('Location statistics unavailable');
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
    await vi.advanceTimersByTimeAsync(5);
    expect(fetcher).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
    const data = row('private-property-id', { owner_id: 'owner-secret', contact_phone: 'phone-secret' });
    const publicFetch = vi.fn<typeof fetch>().mockImplementation(async () => page([data], 1));
    const result = JSON.stringify(await loadHomeLocationStats(options(publicFetch)));
    for (const privateValue of ['private-property-id', 'owner-secret', 'phone-secret', 'contact_phone', 'owner_id']) {
      expect(result).not.toContain(privateValue);
    }
  });

  it('applies the timeout while consuming the response body too', async () => {
    vi.useFakeTimers();
    const response = page([], 0);
    vi.spyOn(response, 'json').mockImplementation(() => new Promise(() => {}));
    const pending = loadHomeLocationStats(options(vi.fn<typeof fetch>().mockResolvedValue(response), { timeoutMs: 25 }));
    const assertion = expect(pending).rejects.toThrow('Location statistics unavailable');
    await vi.advanceTimersByTimeAsync(25);
    await assertion;
  });

  it('reads public environment fallbacks without a browser/session client', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', ''); vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://fallback.example'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'fallback-anon');
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => page([], 0));
    await loadHomeLocationStats({ fetcher });
    expect(String(fetcher.mock.calls[0][0])).toContain('https://fallback.example/rest/v1/public_properties');
    expect(fetcher.mock.calls[0][1]?.headers).toMatchObject({ apikey: 'fallback-anon' });
  });

  it('fails before fetch when public env is missing or a bounded option is invalid', async () => {
    for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY']) vi.stubEnv(key, '');
    const fetcher = vi.fn<typeof fetch>();
    await expect(loadHomeLocationStats({ fetcher })).rejects.toThrow('Location statistics unavailable');
    for (const invalid of [{ maxRows: 5001 }, { timeoutMs: 15001 }, { maxPages: 0 }, { pageSize: 0 }]) {
      await expect(loadHomeLocationStats(options(fetcher, invalid))).rejects.toThrow('Location statistics unavailable');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
