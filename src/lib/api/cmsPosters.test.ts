import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeaturedSection } from '../supabase';
const state = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn() }));
vi.mock('../supabase', () => ({ supabase: state }));
vi.mock('./contentRevalidation', () => ({}));
import { getPropertiesForSection } from './cms';
const id = '00000000-0000-4000-8000-000000000001';
const property = { id, title: 'Tin kiểm thử', is_active: true };
function query(data: unknown) {
  const q: Record<string, unknown> = { then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data, error: null }).then(resolve) };
  for (const key of ['select','eq','order','limit','in']) q[key] = vi.fn(() => q);
  return q;
}
beforeEach(() => {
  vi.clearAllMocks();
  state.rpc.mockResolvedValue({ data: [{ property_id: id, display_name: 'Người đăng kiểm thử', attribution_kind: 'published-profile' }], error: null });
  state.from.mockImplementation(table => query(table === 'featured_section_items' ? [{ property_id: id }, { property_id: id }] : [property]));
});
describe('public homepage section posters', () => {
  it.each(['auto','manual'])('enriches %s sections using public property reads', async mode => {
    const result = await getPropertiesForSection({ id: 'section', mode, display_count: 8 } as FeaturedSection);
    expect(result.map(p => p.id)).toEqual([id]);
    expect(result[0].cardPoster?.displayName).toBe('Người đăng kiểm thử');
    expect(state.from.mock.calls.map(c => c[0])).not.toContain('properties');
    expect(state.from).toHaveBeenCalledWith('public_properties');
    expect(state.rpc).toHaveBeenCalledTimes(1);
  });
});
