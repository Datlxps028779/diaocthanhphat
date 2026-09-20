import { describe, expect, it, vi } from 'vitest';
import { readCompleteAuditRows } from './searchVisibilityRegistry';

function clientFor(pages: Array<{ data: unknown; count: number | null; error?: unknown }>) {
  const calls: Array<[string, unknown[]]> = [];
  return {
    calls,
    from: (table: string) => {
      calls.push(['from', [table]]);
      const query: Record<string, unknown> = { then: (resolve: (v: unknown) => unknown) => Promise.resolve(pages.shift()).then(resolve) };
      for (const name of ['select', 'order', 'limit', 'gt', 'abortSignal']) query[name] = (...args: unknown[]) => { calls.push([name, args]); return query; };
      return query;
    },
  };
}

describe('complete audit registry read', () => {
  it('uses exact remainder counts/keyset and retains null canonical rows and opaque versions', async () => {
    const a = { source_key: 'area:a', canonical_url: null, source_version: 'old-db-format', eligible: false };
    const b = { source_key: 'news:b', canonical_url: 'https://chonhaviet.com/tin-tuc/b', source_version: 'v2', eligible: true };
    const client = clientFor([{ data: [a], count: 2 }, { data: [b], count: 1 }, { data: [a], count: 2 }]);
    expect(await readCompleteAuditRows(client, 'search_visibility_urls', '*', 'source_key', { pageSize: 1 })).toEqual([a, b]);
    expect(client.calls).toContainEqual(['gt', ['source_key', 'area:a']]);
    expect(client.calls.filter(([name]) => name === 'select').every(([, args]) => (args[1] as { count: string }).count === 'exact')).toBe(true);
  });
  it.each([
    [{ data: [], count: 1 }],
    [{ data: [], count: null }],
    [{ data: [], count: 20001 }],
    [{ data: [{ id: 'a' }], count: 1 }, { data: [{ id: 'a' }], count: 2 }],
    [{ data: [{ id: 'b' }, { id: 'a' }], count: 2 }],
    [{ data: [{ id: 'a' }, { id: 'a' }], count: 2 }],
    [{ data: null, count: 0, error: { message: 'private error' } }],
  ])('fails closed on clipping/count drift/malformed reads (%j)', async (...pages) => {
    await expect(readCompleteAuditRows(clientFor(pages), 'news', 'id')).rejects.toThrow('Không đọc được snapshot audit đầy đủ.');
  });
  it('honors database source-key collation but rejects repeated keys across pages', async () => {
    const a = { source_key: 'area_listing:a' }, b = { source_key: 'area:z' };
    expect(a.source_key > b.source_key).toBe(true);
    const pages = [{ data: [a], count: 2 }, { data: [b], count: 1 }, { data: [a], count: 2 }];
    expect(await readCompleteAuditRows(clientFor(pages), 'search_visibility_urls', 'source_key', 'source_key', { pageSize: 1 })).toEqual([a, b]);
    await expect(readCompleteAuditRows(clientFor([{ data: [a], count: 2 }, { data: [a], count: 1 }]), 'search_visibility_urls', 'source_key', 'source_key', { pageSize: 1 })).rejects.toThrow();
  });
  it('enforces a deadline even when the query never resolves', async () => {
    vi.useFakeTimers();
    const client = clientFor([]);
    client.from = () => {
      const q: any = { then: () => new Promise(() => {}) };
      for (const method of ['select', 'order', 'limit', 'abortSignal']) q[method] = () => q;
      return q;
    };
    const assertion = expect(readCompleteAuditRows(client, 'news', 'id', 'id', { timeoutMs: 10 })).rejects.toThrow();
    await vi.advanceTimersByTimeAsync(11);
    await assertion;
    vi.useRealTimers();
  });
});
