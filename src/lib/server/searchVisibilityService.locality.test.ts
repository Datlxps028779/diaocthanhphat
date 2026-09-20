import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ admin: vi.fn(), locality: vi.fn(), news: vi.fn() }));
vi.mock('./requireAdmin', () => ({ adminClient: state.admin }));
vi.mock('./localitySnapshot', () => ({ loadLocalitySnapshot: state.locality }));
vi.mock('./localityNewsSnapshot', () => ({ loadLocalityNewsSnapshot: state.news }));
import { syncSearchVisibilityAudit } from './searchVisibilityService';

function fakeClient(options: { rpcError?: { code: string; message: string }; registry?: Record<string, unknown>[]; registryCount?: number } = {}) {
  const writes: unknown[] = [];
  const rpc = vi.fn(async (_name: string, args: any) => ({ error: options.rpcError ?? null, data: { runId: 'run-1', status: 'succeeded', candidateCount: args.p_candidates.length } }));
  const client = {
    writes, rpc,
    from(table: string) {
      let action = 'read', limit = 500;
      const q: any = {
        then(resolve: (v: unknown) => unknown) {
          const data = table === 'search_visibility_urls' ? (options.registry ?? []) : [];
          return Promise.resolve({ data: data.slice(0, limit), count: table === 'search_visibility_urls' ? (options.registryCount ?? data.length) : 0, error: null }).then(resolve);
        },
        insert: () => { action = 'insert'; return q; },
        update: (value: unknown) => { writes.push({ table, value }); return q; },
        upsert: (value: unknown) => { writes.push({ table, value }); return q; },
        single: async () => ({ data: action === 'insert' ? { id: 'run-1' } : null, error: null }),
        limit: (value: number) => { limit = value; return q; },
      };
      for (const method of ['select', 'range', 'order', 'abortSignal', 'eq', 'not', 'gt']) q[method] = () => q;
      return q;
    },
  };
  return client;
}
const snapshot = { computedAt: '2026-09-16T00:00:00.000Z', rows: [], areas: [], districts: [], wards: [], propertyTypes: [] };
beforeEach(() => {
  state.admin.mockReset(); state.locality.mockReset(); state.news.mockReset();
  state.locality.mockResolvedValue(snapshot); state.news.mockResolvedValue([]);
});

describe('atomic eligibility snapshot integration', () => {
  it('calls reconcile only after complete sources and registry, never direct URL upsert', async () => {
    const registry = [{ source_key: 'area:old', canonical_url: null, source_version: 'opaque-persisted-version', eligible: false }];
    const client = fakeClient({ registry }); state.admin.mockReturnValue(client);
    expect((await syncSearchVisibilityAudit('owner-1')).runId).toBe('run-1');
    expect(state.locality).toHaveBeenCalledTimes(1); expect(state.news).toHaveBeenCalledTimes(1);
    expect(client.rpc).toHaveBeenCalledTimes(1);
    const [name, args] = client.rpc.mock.calls[0];
    expect(name).toBe('reconcile_search_visibility_snapshot');
    expect(args.p_registry).toEqual(registry);
    expect(args.p_snapshot_fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(Object.keys(args.p_candidates[0]).sort()).toEqual(['source_key', 'entity_type', 'entity_id', 'canonical_url', 'canonical_path', 'eligible', 'reason_code', 'reason_detail', 'content_updated_at'].sort());
    expect(client.writes).toEqual([]);
  });
  it.each(['locality', 'news'] as const)('%s snapshot failure cannot call reconcile or mutate URLs', async which => {
    state[which].mockRejectedValue(new Error('snapshot unavailable'));
    const client = fakeClient(); state.admin.mockReturnValue(client);
    await expect(syncSearchVisibilityAudit(null)).rejects.toMatchObject({ code: 'SOURCE_READ' });
    expect(client.rpc).not.toHaveBeenCalled();
    expect(client.writes.every((write: any) => write.table === 'search_visibility_runs')).toBe(true);
  });
  it('rejects clipped registry even when the response is successful', async () => {
    const client = fakeClient({ registryCount: 1 }); state.admin.mockReturnValue(client);
    await expect(syncSearchVisibilityAudit(null)).rejects.toMatchObject({ code: 'SOURCE_READ' });
    expect(client.rpc).not.toHaveBeenCalled();
  });
  it.each([
    ['PGRST202', 'missing function', 'RECONCILE_REQUIRED'],
    ['54000', 'SV_RECONCILE_STALE_REGISTRY', 'STALE_SNAPSHOT'],
    ['P0002', 'SV_RECONCILE_SUPERSEDED', 'SUPERSEDED'],
    ['23505', 'SV_RECONCILE_CANONICAL_CONFLICT', 'CANONICAL_POLICY'],
  ])('maps %s and never falls back to direct registry writes', async (code, message, expected) => {
    const client = fakeClient({ rpcError: { code, message } }); state.admin.mockReturnValue(client);
    await expect(syncSearchVisibilityAudit(null)).rejects.toMatchObject({ code: expected });
    expect(client.rpc).toHaveBeenCalledTimes(1);
    expect(client.writes.every((write: any) => write.table === 'search_visibility_runs')).toBe(true);
  });
});
