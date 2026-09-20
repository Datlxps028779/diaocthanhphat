import { beforeEach, describe, expect, it, vi } from 'vitest';
const { calls, result, client } = vi.hoisted(() => {
  const calls: unknown[][] = [];
  const result = { data: [] as unknown[], error: null as unknown };
  const q: any = {};
  for (const method of ['from', 'select', 'eq', 'in', 'or', 'order', 'limit']) q[method] = (...args: unknown[]) => { calls.push([method, ...args]); return q; };
  q.then = (resolve: any) => Promise.resolve(result).then(resolve);
  return { calls, result, client: q };
});
vi.mock('@supabase/supabase-js', () => ({ createClient: () => client }));
vi.mock('../env', () => ({ SUPABASE_URL: 'https://public.example', SUPABASE_ANON_KEY: 'anon-test' }));
import { loadLocalityListings } from './localityListings';

describe('locality SSR listings', () => {
  beforeEach(() => { calls.length = 0; result.data = []; result.error = null; });
  it('reads only public active inventory with ID-authoritative filters', async () => {
    await loadLocalityListings({ areaId: 'a', districtId: 'd', wardId: 'w', typeIds: ['t'], listingType: 'mua_ban' });
    expect(calls).toContainEqual(['from', 'public_properties']);
    expect(calls).toContainEqual(['eq', 'is_active', true]);
    expect(calls).toContainEqual(['eq', 'district_id', 'd']);
    expect(calls).toContainEqual(['eq', 'ward_id', 'w']);
    expect(calls).toContainEqual(['in', 'property_type_id', ['t']]);
    expect(calls).toContainEqual(['limit', 12]);
  });
  it('returns no rows for a present empty type group without issuing a broad query', async () => {
    await expect(loadLocalityListings({ areaId: 'a', typeIds: [] })).resolves.toEqual([]);
    expect(calls).toEqual([]);
  });
  it('uses the caller page size so SSR does not skip rows when loading the next page', async () => {
    await loadLocalityListings({ areaId: 'a' }, 16);
    expect(calls).toContainEqual(['limit', 16]);
  });
  it('fails explicitly rather than fabricate an empty listing set', async () => {
    result.error = { message: 'private upstream body' };
    await expect(loadLocalityListings({ areaId: 'a' })).rejects.toThrow('Không tải được tin đăng địa phương');
  });
  it('rejects unknown bands and rent/band contradictions without widening the query', async () => {
    await expect(loadLocalityListings({ areaId: 'a', salePriceBand: 'invalid' as never })).rejects.toThrow('Phạm vi giá không hợp lệ');
    await expect(loadLocalityListings({ areaId: 'a', listingType: 'cho_thue', salePriceBand: 'tu-5-ty' })).rejects.toThrow('Phạm vi giá không hợp lệ');
    expect(calls.some(call => call[0] === 'or')).toBe(false);
  });
  it('uses both supported sale units and an exclusive upper band boundary', async () => {
    await loadLocalityListings({ areaId: 'a', listingType: 'mua_ban', salePriceBand: 'tu-1-den-duoi-2-ty' });
    const filter = calls.find(call => call[0] === 'or')?.[1];
    expect(filter).toContain('price_unit.eq.tỷ');
    expect(filter).toContain('price_unit.eq.triệu');
    expect(filter).toContain('price.lt.2');
    expect(filter).toContain('price.lt.2000');
  });
});
