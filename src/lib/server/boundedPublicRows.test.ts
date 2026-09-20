import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BOUNDED_ROW_MAX_PAGES, BOUNDED_ROW_MAX_ROWS, BOUNDED_ROW_PAGE_SIZE, BOUNDED_ROW_TIMEOUT_MS,
  readBoundedPublicRows, type BoundedRowValidators,
} from './boundedPublicRows';

type Row = Record<string, unknown>;
const row = (id: string, extra: Row = {}): Row => ({ id, label: `Row ${id}`, ...extra });

function page(rows: Row[], count: number) {
  // `count` is the keyset remainder returned by PostgREST, so the leading index is
  // always 0 and the trailing number is the remaining row count.
  const range = rows.length ? `0-${rows.length - 1}/${count}` : `*/${count}`;
  return new Response(JSON.stringify(rows), {
    headers: { 'content-range': range, 'content-type': 'application/json' },
  });
}

// A validator shaped exactly like the property/news allowlists in production.
const validators: BoundedRowValidators = {
  stringFields: ['label'],
  numberFields: [],
  booleanFields: [],
  requiredFields: [],
};

const base = (fetcher: typeof fetch, extra: Row = {}) => ({
  fetcher, url: 'https://public.example', anonKey: 'anon-key', table: 'public_news',
  select: 'id,label', filters: { tag: 'eq.true' }, validators, ...extra,
});

afterEach(() => { vi.useRealTimers(); });

describe('readBoundedPublicRows transport', () => {
  it('reads every row of a complete anonymous keyset walk and applies caller filters', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page([row('a'), row('b')], 3))
      .mockResolvedValueOnce(page([row('c')], 1))
      .mockResolvedValueOnce(page([row('a')], 3));
    const rows = await readBoundedPublicRows(base(fetcher, { pageSize: 2 }));
    expect(rows.map(entry => entry.id)).toEqual(['a', 'b', 'c']);
    for (const [input, init] of fetcher.mock.calls) {
      const url = new URL(String(input));
      expect(url.pathname).toBe('/rest/v1/public_news');
      expect(url.searchParams.get('select')).toBe('id,label');
      expect(url.searchParams.get('tag')).toBe('eq.true');
      expect(url.searchParams.get('order')).toBe('id.asc');
      expect((init?.headers as Record<string, string>).cookie).toBeUndefined();
      expect(init).toMatchObject({ credentials: 'omit', cache: 'no-store' });
    }
  });

  it('fails closed when the upstream total exceeds the row ceiling instead of returning a prefix', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(page([row('a')], 9));
    await expect(readBoundedPublicRows(base(fetcher, { maxRows: 5, pageSize: 1 })))
      .rejects.toThrow(/^Public rows unavailable$/);
  });

  it('fails closed when pagination needs more pages than allowed', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page([row('a')], 3))
      .mockResolvedValueOnce(page([row('b')], 2));
    await expect(readBoundedPublicRows(base(fetcher, { pageSize: 1, maxPages: 2 })))
      .rejects.toThrow(/^Public rows unavailable$/);
  });

  it('fails closed on a malformed page, a non-ok response and a shifted count', async () => {
    const malformed = vi.fn<typeof fetch>().mockResolvedValue(new Response('nope', { status: 500 }));
    await expect(readBoundedPublicRows(base(malformed))).rejects.toThrow(/^Public rows unavailable$/);

    const noRange = vi.fn<typeof fetch>().mockResolvedValue(new Response('[]', { headers: { 'content-type': 'application/json' } }));
    await expect(readBoundedPublicRows(base(noRange))).rejects.toThrow(/^Public rows unavailable$/);

    const shifted = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page([row('a'), row('b')], 2))
      .mockResolvedValueOnce(page([row('a')], 1));
    await expect(readBoundedPublicRows(base(shifted, { pageSize: 2 })))
      .rejects.toThrow(/^Public rows unavailable$/);
  });

  it('fails closed when the final probe detects rows inserted after the cursor walk', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page([row('a')], 1))
      .mockResolvedValueOnce(page([row('a')], 2));
    await expect(readBoundedPublicRows(base(fetcher, { pageSize: 1 })))
      .rejects.toThrow(/^Public rows unavailable$/);
  });

  it('fails closed on deadline expiry rather than resolving a partial snapshot', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise<Response>(() => {}));
    const pending = readBoundedPublicRows(base(fetcher, { timeoutMs: 1000 }));
    const assertion = expect(pending).rejects.toThrow(/^Public rows unavailable$/);
    await vi.advanceTimersByTimeAsync(1200);
    await assertion;
  });

  it('fails closed when a row fails the caller validator instead of leaking it through', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(page([row('a', { label: 42 })], 1));
    await expect(readBoundedPublicRows(base(fetcher))).rejects.toThrow(/^Public rows unavailable$/);
  });

  it('rejects unsafe table names and non-http endpoints before any request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    await expect(readBoundedPublicRows(base(fetcher, { table: 'news;drop' }))).rejects.toThrow(/^Public rows unavailable$/);
    await expect(readBoundedPublicRows(base(fetcher, { url: 'ftp://public.example' }))).rejects.toThrow(/^Public rows unavailable$/);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('keeps the unavailable ceiling constants exported for callers that bound real pages', () => {
    expect(BOUNDED_ROW_MAX_ROWS).toBe(5000);
    expect(BOUNDED_ROW_MAX_PAGES).toBe(50);
    expect(BOUNDED_ROW_PAGE_SIZE).toBe(500);
    expect(BOUNDED_ROW_TIMEOUT_MS).toBe(15000);
  });
});
