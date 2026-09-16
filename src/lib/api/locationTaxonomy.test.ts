import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ result: { data: [] as unknown[], error: null as Error | null } }));
const from = vi.hoisted(() => vi.fn());
vi.mock('../supabase', () => ({ supabase: { from } }));
vi.mock('./contentRevalidation', () => ({ revalidateAreaContent: vi.fn(), revalidateNeighborhoodContent: vi.fn(), areaRevalidationSnapshot: vi.fn(), neighborhoodRevalidationSnapshot: vi.fn() }));
import { getAreas, getDistricts } from './taxonomy';
const query = { select: vi.fn(), order: vi.fn(), eq: vi.fn(), then: (resolve: (value: typeof state.result) => unknown) => Promise.resolve(resolve(state.result)) };
beforeEach(() => {
  vi.clearAllMocks(); state.result = { data: [], error: null };
  from.mockReturnValue(query); query.select.mockReturnValue(query); query.order.mockReturnValue(query); query.eq.mockReturnValue(query);
});
describe('location taxonomy reads', () => {
  it('does not disguise read errors as empty lists', async () => {
    state.result.error = new Error('offline');
    await expect(getAreas()).rejects.toThrow('offline');
    await expect(getDistricts('area-a')).rejects.toThrow('offline');
  });
  it('filters districts by parent identity', async () => {
    await getDistricts('area-a');
    expect(from).toHaveBeenCalledWith('districts');
    expect(query.eq).toHaveBeenCalledWith('area_id', 'area-a');
  });
  it('distinguishes valid empty responses', async () => {
    await expect(getAreas()).resolves.toEqual([]);
    await expect(getDistricts('area-a')).resolves.toEqual([]);
  });
});
