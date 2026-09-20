import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PropertyFilters, PropertySort } from './properties';

const state = vi.hoisted(() => ({
  calls: [] as { method: string; args: unknown[] }[],
  rpcCalls: [] as { name: string; args: Record<string, unknown> }[],
}));
vi.mock('../supabase', () => ({ supabase: {
  from: () => {
    const query: Record<string, unknown> = {
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: [], count: 23, error: null }).then(resolve),
    };
    for (const method of ['select', 'eq', 'in', 'or', 'gte', 'lte', 'order', 'range']) {
      query[method] = (...args: unknown[]) => { state.calls.push({ method, args }); return query; };
    }
    return query;
  },
  rpc: (name: string, args: Record<string, unknown>) => {
    state.rpcCalls.push({ name, args });
    return Promise.resolve({ data: [], error: null });
  },
} }));
vi.mock('../publicCardPosters', () => ({ enrichPublicCardPosters: async (_client: unknown, rows: unknown[]) => rows }));
import { getAllProperties } from './properties';

beforeEach(() => { state.calls = []; state.rpcCalls = []; });
describe('locality keyword query ordering before pagination', () => {
  const scopes: PropertyFilters[] = [
    { districtId: 'district' },
    { wardId: 'ward' },
    { typeIds: ['house'] },
    { typeIds: [] },
    { salePriceBand: 'duoi-1-ty' },
  ];
  for (const scope of scopes) {
    it.each(['newest', 'price_asc', 'price_desc', 'views', 'relevance'] as PropertySort[])('%s preserves scope and pagination for ' + JSON.stringify(scope), async sort => {
      const result = await getAllProperties({ ...scope, keyword: 'vuon', sort, page: 2, limit: 10 });
      const call = state.rpcCalls.at(-1);
      expect(call?.name).toBe('search_property_matches');
      expect(call?.args).toMatchObject({
        kw: 'vuon',
        f_sort: sort,
        f_limit: 10,
        f_offset: 10,
      });
      if (scope.districtId) expect(call?.args.f_district_id).toBe('district');
      if (scope.wardId) expect(call?.args.f_ward_id).toBe('ward');
      if (scope.typeIds) expect(call?.args.f_type_ids).toEqual(scope.typeIds);
      if (scope.salePriceBand) {
        expect(call?.args.f_sale_min_vnd).toBe(0);
        expect(call?.args.f_sale_max_vnd).toBe(1_000_000_000);
      }
      expect(result).toEqual({ data: [], total: 0 });
    });
  }

  it('passes locality scope to the ranking RPC instead of applying newest fallback', async () => {
    await getAllProperties({ districtId: 'district', keyword: 'vuon', sort: 'relevance', page: 1, limit: 10 });
    expect(state.calls.filter(call => call.method === 'order')).toEqual([]);
    expect(state.rpcCalls.at(-1)?.args.f_district_id).toBe('district');
  });
});
