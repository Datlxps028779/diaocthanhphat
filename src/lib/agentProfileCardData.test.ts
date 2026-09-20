import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), select: vi.fn(), rows: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({
  rpc: mocks.rpc,
  from: () => ({ select: mocks.select }),
}) }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, unstable_noStore: vi.fn() }));
vi.mock('./env', () => ({ SUPABASE_URL: 'https://test.invalid', SUPABASE_ANON_KEY: 'fixture' }));
import { serverGetPublicAgentProfileListings } from './supabase-server';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('profile listing card enrichment', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue({ eq: () => ({ in: mocks.rows }) });
  });
  it('enriches in a single public batch, joining by ID without changing order or count', async () => {
    mocks.rpc.mockResolvedValue({ data: [{ id: id(1), title: 'One', area_slug: 'binh-duong' }, { id: id(2), title: 'Two' }], error: null });
    mocks.rows.mockResolvedValue({ data: [{ id: id(2), bedrooms: 2 }, { id: id(1), bedrooms: 3, ward: 'An Phú' }], error: null });
    const result = await serverGetPublicAgentProfileListings('public-profile');
    expect(result).toEqual([
      { id: id(1), title: 'One', area_slug: 'binh-duong', bedrooms: 3, ward: 'An Phú' },
      { id: id(2), title: 'Two', bedrooms: 2 },
    ]);
    expect(mocks.rows).toHaveBeenCalledTimes(1);
    expect(mocks.rows).toHaveBeenCalledWith('id', [id(1), id(2)]);
    expect(mocks.select.mock.calls[0][0]).not.toMatch(/contact_name|contact_phone|contact_zalo|owner_id/);
  });
  it('uses the canonical poster batch rather than assuming the page owner authored every card', async () => {
    mocks.rpc.mockImplementation(async (name: string) => name === 'public_get_agent_profile_listings'
      ? { data: [{ id: id(1), title: 'One' }, { id: id(2), title: 'Two' }], error: null }
      : { data: [{ property_id: id(2), display_name: 'Tên công khai kiểm thử', profile_slug: 'kiem-thu', attribution_kind: 'published-profile' }], error: null });
    mocks.rows.mockResolvedValue({ data: [], error: null });
    const result = await serverGetPublicAgentProfileListings('profile');
    expect(result[0]).not.toHaveProperty('cardPoster');
    expect(result[1].cardPoster).toMatchObject({ propertyId: id(2), displayName: 'Tên công khai kiểm thử', source: 'published-profile' });
    expect(mocks.rpc).toHaveBeenCalledWith('public_get_property_card_posters', { p_property_ids: [id(1), id(2)] });
  });
  it('preserves the approved profile listing when enrichment is unavailable', async () => {
    const rows = [{ id: id(1), title: 'One' }];
    mocks.rpc.mockResolvedValue({ data: rows, error: null });
    mocks.rows.mockResolvedValue({ data: null, error: { message: 'Unavailable' } });
    expect(await serverGetPublicAgentProfileListings('profile')).toEqual(rows);
  });
  it('does not query properties for an empty or denied profile', async () => {
    mocks.rpc.mockResolvedValue({ data: [], error: null });
    expect(await serverGetPublicAgentProfileListings('profile')).toEqual([]);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it('bounds batches to 100 IDs rather than fetching per card', async () => {
    mocks.rpc.mockResolvedValue({ data: Array.from({ length: 101 }, (_, i) => ({ id: id(i) })), error: null });
    mocks.rows.mockResolvedValue({ data: [], error: null });
    expect(await serverGetPublicAgentProfileListings('profile')).toHaveLength(101);
    expect(mocks.rows).toHaveBeenCalledTimes(2);
    expect(mocks.rows.mock.calls.map(call => call[1].length)).toEqual([100, 1]);
  });
});
