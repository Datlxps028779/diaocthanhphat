import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Property } from '../supabase';
const mock = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), revalidate: vi.fn() }));
vi.mock('../supabase', () => ({ supabase: { rpc: mock.rpc, from: mock.from } }));
vi.mock('./media', () => ({ propertyPanoramaUrl: vi.fn(), deletePanoramaObject: vi.fn(), uploadPanoramaObject: vi.fn() }));
vi.mock('./contentRevalidation', () => ({ revalidatePropertyContent: mock.revalidate, propertyRevalidationSnapshot: (p: unknown) => p }));
import { createProperty, getAllProperties, getAllPropertiesForMap, getPublicPropertiesByIds, getAdvisorMatches, getAdvisorCatalogueMatches, updateProperty, type PropertyWrite } from './properties';

const id = '00000000-0000-4000-8000-000000000001';
const property = { id, title: 'Tin kiểm thử', listing_type: 'mua_ban' };
const posterRow = { property_id: id, display_name: 'Tên kiểm thử', profile_slug: 'kiem-thu', attribution_kind: 'published-profile' };
let query: Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => {
  vi.resetAllMocks();
  query = {};
  for (const method of ['select', 'eq', 'not', 'in', 'order', 'range', 'limit', 'insert', 'update', 'single', 'maybeSingle']) query[method] = vi.fn(() => query);
  query.then = vi.fn(resolve => Promise.resolve({ data: [property], count: 1, error: null }).then(resolve));
  mock.from.mockReturnValue(query);
  mock.rpc.mockImplementation(async (name: string) => ({ data: name === 'public_get_property_card_posters' ? [posterRow] : [{ id, total_count: 1, score: 9 }], error: null }));
});

describe('public loader poster wiring', () => {
  it.each(['list', 'map', 'ids', 'advisor', 'catalogue'])('enriches %s once, without changing its membership', async route => {
    const result = route === 'list' ? (await getAllProperties()).data
      : route === 'map' ? await getAllPropertiesForMap()
      : route === 'ids' ? await getPublicPropertiesByIds([id])
      : route === 'advisor' ? (await getAdvisorMatches({})).data
      : (await getAdvisorCatalogueMatches({ keyword: 'Tin' })).data;
    expect(result.map(p => p.id)).toEqual([id]);
    expect(result[0].cardPoster).toMatchObject({ propertyId: id, displayName: 'Tên kiểm thử' });
    expect(mock.rpc.mock.calls.filter(call => call[0] === 'public_get_property_card_posters')).toHaveLength(1);
    expect(mock.from.mock.calls.every(call => call[0] === 'public_properties')).toBe(true);
  });
  it.each(['create', 'update'])('never sends a read-only poster decoration through %s', async action => {
    query.then = vi.fn(resolve => Promise.resolve({ data: property, error: null }).then(resolve));
    const decorated = { title: 'Tin kiểm thử', city: '', cardPoster: { displayName: 'Không được ghi DB' } };
    if (action === 'create') await createProperty(decorated as unknown as PropertyWrite);
    else await updateProperty(id, decorated as Partial<Property>);
    const payload = (action === 'create' ? query.insert : query.update).mock.calls[0][0];
    expect(payload).not.toHaveProperty('cardPoster');
  });
});
