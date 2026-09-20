import { describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { enrichPublicCardPosters, loadPublicCardPosters } from './publicCardPosters';
import { buildPropertyCardModel } from './propertyCardModel';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const row = (n: number) => ({ property_id: id(n), display_name: `Người đăng kiểm thử ${n}`, avatar_url: null, profile_slug: `kiem-thu-${n}`, attribution_kind: 'published-profile' });
const client = (rpc: ReturnType<typeof vi.fn>) => ({ rpc }) as unknown as SupabaseClient;

describe('public card poster batch enrichment', () => {
  it('joins by ID, preserving rows, ordering and metadata with an allowlisted DTO', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [{ ...row(2), owner_id: 'private', public_phone: 'private' }, row(1)], error: null });
    const source = [{ id: id(1), title: 'Một', matchScore: 9 }, { id: id(2), title: 'Hai', matchScore: 7 }];
    const result = await enrichPublicCardPosters(client(rpc), source);
    expect(result.map(p => p.id)).toEqual(source.map(p => p.id));
    expect(result.map(p => p.matchScore)).toEqual([9, 7]);
    expect(result[0].cardPoster).toEqual({ propertyId: id(1), displayName: row(1).display_name, avatarUrl: null, profileSlug: 'kiem-thu-1', source: 'published-profile' });
    expect(buildPropertyCardModel(result[0]).poster.name).toBe(row(1).display_name);
    expect(JSON.stringify(result)).not.toContain('private');
    expect(source[0]).not.toHaveProperty('cardPoster');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('deduplicates and chunks IDs at 100 without per-card requests', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    await loadPublicCardPosters(client(rpc), [...Array.from({ length: 101 }, (_, n) => id(n)), id(0), '', 'not-a-uuid']);
    expect(rpc.mock.calls.map(call => call[1].p_property_ids.length)).toEqual([100, 1]);
    expect(rpc.mock.calls[0][0]).toBe('public_get_property_card_posters');
  });
  it('does not request empty or invalid IDs', async () => {
    const rpc = vi.fn();
    expect((await loadPublicCardPosters(client(rpc), [])).posters.size).toBe(0);
    await loadPublicCardPosters(client(rpc), ['bad']);
    expect(rpc).not.toHaveBeenCalled();
  });
  it('rejects out-of-batch, ambiguous, blank and unrecognized provenance', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [row(1), row(1), { ...row(2), display_name: ' ' }, { ...row(3), attribution_kind: 'advisor' }, row(5), null], error: null });
    expect((await loadPublicCardPosters(client(rpc), [id(1), id(2), id(3)])).posters.size).toBe(0);
  });
  it.each(['missing', 'throw', 'malformed'])('fails soft without reusing stale identity: %s', async mode => {
    const rpc = mode === 'throw' ? vi.fn().mockRejectedValue(new Error('offline')) : vi.fn().mockResolvedValue(mode === 'missing' ? { error: { code: 'PGRST202' }, data: null } : { error: null, data: {} });
    const source = [{ id: id(1), title: 'Tin', cardPoster: { propertyId: id(1), displayName: 'Old', source: 'published-profile' as const } }];
    const result = await enrichPublicCardPosters(client(rpc), source);
    expect(result).toEqual([{ id: id(1), title: 'Tin' }]);
    expect(source[0].cardPoster.displayName).toBe('Old');
    expect((await loadPublicCardPosters(client(rpc), [id(1)])).unavailableBatches).toBe(1);
  });
  it('stops remaining batches when the RPC has not been deployed', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { code: 'PGRST202' } });
    const result = await loadPublicCardPosters(client(rpc), Array.from({ length: 201 }, (_, n) => id(n)));
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(result.unavailableBatches).toBe(3);
  });
  it('keeps successful chunks when another chunk fails', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [row(0)], error: null }).mockRejectedValueOnce(new Error('offline'));
    const result = await loadPublicCardPosters(client(rpc), Array.from({ length: 101 }, (_, n) => id(n)));
    expect([...result.posters.keys()]).toEqual([id(0)]);
    expect(result.unavailableBatches).toBe(1);
  });
  it('refreshes identity on every enrichment instead of retaining a module cache', async () => {
    const rpc = vi.fn().mockResolvedValueOnce({ data: [row(1)], error: null }).mockResolvedValueOnce({ data: [], error: null });
    const first = await enrichPublicCardPosters(client(rpc), [{ id: id(1), title: 'Tin' }]);
    const next = await enrichPublicCardPosters(client(rpc), first);
    expect(first[0].cardPoster).toBeDefined();
    expect(next[0].cardPoster).toBeUndefined();
  });
});
