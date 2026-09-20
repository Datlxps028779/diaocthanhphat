import { beforeEach, describe, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ snapshot: vi.fn() }));
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn, unstable_noStore: vi.fn() }));
vi.mock('./server/localityNewsSnapshot', () => ({ getLocalityNewsSnapshot: state.snapshot }));
import { serverGetLocalityNews } from './supabase-server';
import { buildSearchVisibilityCandidates } from './server/searchVisibility';

const article = (id: string, created_at: string, area_id: string | null, geo_area: string | null) => ({
  id, created_at, updated_at: created_at, area_id, geo_area, is_published: true,
  title: `Fixture ${id}`, slug: id, excerpt: null, image_url: null, category: 'Tin', author: null, views: 0, focus_keywords: null,
});
beforeEach(() => { state.snapshot.mockReset(); });
describe('public locality news and visibility share eligibility before display limits', () => {
  it('puts newer normalized narrative articles before older structured articles on all display limits', async () => {
    const rows = [article('old', '2026-08-01T00:00:00Z', 'a', null), article('new', '2026-09-01T00:00:00Z', null, '  Bình   Dương '), article('middle', '2026-08-20T00:00:00Z', 'a', null)];
    state.snapshot.mockResolvedValue([...rows, rows[0]]);
    const teaser = await serverGetLocalityNews({ areaId: 'a', geoAreaAllowlist: new Set(['Bình Dương']), limit: 1 });
    const magazine = await serverGetLocalityNews({ areaId: 'a', geoAreaAllowlist: new Set(['Bình Dương']), limit: 12 });
    expect(teaser).toMatchObject({ total: 3, indexable: true, available: true });
    expect(teaser.data.map(row => row.id)).toEqual(['new']);
    expect(magazine.data.map(row => row.id)).toEqual(['new', 'middle', 'old']);
    expect(magazine.data[0]).not.toHaveProperty('area_id');
    const candidates = buildSearchVisibilityCandidates({
      properties: [], areas: [], neighborhoods: [], news: [], newsCategories: [], managedPages: [], localityNews: rows,
      locality: { computedAt: '2026-09-18T00:00:00Z', rows: [], areas: [{ id: 'a', name: 'Bình Dương', slug: 'binh-duong', description: null, image_url: null, focus_keywords: null, admin_note: null, meta_title: null, meta_description: null }], districts: [], wards: [], propertyTypes: [] },
    });
    expect(candidates.find(row => row.sourceKey === 'locality_news:a')).toMatchObject({ eligible: true, canonicalPath: '/khu-vuc/binh-duong/tin-tuc' });
  });
  it('does not index a duplicate inflated threshold or an unavailable snapshot', async () => {
    const row = article('only', '2026-09-01T00:00:00Z', 'a', null);
    state.snapshot.mockResolvedValue([row, row, row]);
    expect(await serverGetLocalityNews({ areaId: 'a', geoAreaAllowlist: new Set(), limit: 3 })).toMatchObject({ total: 1, indexable: false, available: true });
    state.snapshot.mockRejectedValue(new Error('read incomplete'));
    expect(await serverGetLocalityNews({ areaId: 'a', geoAreaAllowlist: new Set(), limit: 3 })).toEqual({ data: [], total: 0, indexable: false, available: false, latestUpdatedAt: null });
  });
});
