import { describe, expect, it } from 'vitest';
import { buildSearchVisibilityCandidates, type SearchVisibilitySources } from './searchVisibility';
import { validateSearchVisibilityCandidates } from './searchVisibilityService';
import { buildLocalityCandidatesFromSnapshot } from '../localitySitemapGate';
import type { LocalitySnapshot } from './localitySnapshot';

function snapshot(count = 6): LocalitySnapshot {
  return {
    computedAt: '2026-09-16T00:00:00.000Z',
    areas: [{ id: 'a-bd', slug: 'binh-duong', name: 'Bình Dương', description: 'Mô tả khu vực.', admin_note: null, meta_title: null, meta_description: null, focus_keywords: null, image_url: null }],
    districts: [{ id: 'd-di-an', area_id: 'a-bd', slug: 'binh-duong-di-an', name: 'Dĩ An' }],
    wards: [],
    propertyTypes: [{ id: 't-nha-pho', slug: 'nha-pho', name: 'Nhà phố' }],
    rows: Array.from({ length: count }, (_, i) => ({
      id: `p-${i}`, title: `Tin số ${i}`, area_id: 'a-bd', district_id: 'd-di-an', ward_id: null,
      property_type_id: 't-nha-pho', listing_type: 'mua_ban', price: 3, price_unit: 'tỷ', price_per_month: null, area_sqm: 100,
    })),
  };
}
function sources(locality: LocalitySnapshot): SearchVisibilitySources {
  return {
    properties: [], areas: locality.areas.map(a => ({ ...a, created_at: null })), districts: locality.districts,
    propertyTypes: locality.propertyTypes, neighborhoods: [], news: [], newsCategories: [], managedPages: [], locality,
  };
}
function localityRows(locality: LocalitySnapshot) {
  return buildSearchVisibilityCandidates(sources(locality)).filter(c => c.entityType === 'area' || c.entityType === 'area_listing');
}

describe('locality registry parity', () => {
  it('keeps the admin area source key and has exactly one candidate per canonical', () => {
    const rows = localityRows(snapshot());
    expect(rows.find(c => c.canonicalPath === '/khu-vuc/binh-duong')).toMatchObject({ sourceKey: 'area:a-bd', eligible: true });
    const paths = rows.map(c => c.canonicalPath).filter(Boolean);
    expect(new Set(paths).size).toBe(paths.length);
    expect(new Set(rows.map(c => c.sourceKey)).size).toBe(rows.length);
  });
  it('includes reports, including exact district type reports without indexing their legacy landing', () => {
    const rows = localityRows(snapshot());
    expect(rows.find(c => c.canonicalPath === '/khu-vuc/binh-duong/thong-tin')?.eligible).toBe(true);
    expect(rows.find(c => c.canonicalPath === '/mua-ban/binh-duong/di-an/nha-pho/thong-tin')?.eligible).toBe(true);
    expect(rows.find(c => c.canonicalPath === '/mua-ban/binh-duong/di-an/nha-pho')?.eligible).toBe(false);
    expect(rows.find(c => c.canonicalPath === '/mua-ban/binh-duong')?.eligible).toBe(false);
  });
  it('matches every eligible sitemap path, including reports', () => {
    const data = snapshot();
    expect(localityRows(data).filter(c => c.eligible).map(c => c.canonicalPath).sort())
      .toEqual(buildLocalityCandidatesFromSnapshot(data).map(c => c.path).sort());
  });
  it('retains excluded area/report reasons for thin data instead of making audit unknown', () => {
    const rows = localityRows(snapshot(0));
    expect(rows.find(c => c.sourceKey === 'area:a-bd')).toMatchObject({ eligible: false, reasonCode: 'QUALITY_GATE_FAILED' });
    expect(rows.find(c => c.canonicalPath === '/khu-vuc/binh-duong/thong-tin')?.reasonDetail).toBeTruthy();
    expect(rows.some(c => c.eligible)).toBe(false);
  });
  it('does not let legacy descriptions or samples override the complete public snapshot', () => {
    const data = snapshot();
    data.areas[0].description = null;
    const input = sources(data);
    input.areas[0].description = 'Old cached description';
    const rows = buildSearchVisibilityCandidates(input);
    expect(rows.find(c => c.sourceKey === 'area:a-bd')?.eligible).toBe(false);
    expect(rows.find(c => c.canonicalPath === '/mua-ban/binh-duong/di-an/nha')?.eligible).toBe(false);
  });
  it('uses existing database entity types and valid source keys; no schema migration required', () => {
    const rows = localityRows(snapshot());
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every(c => ['area', 'area_listing'].includes(c.entityType))).toBe(true);
    expect(rows.every(c => !c.sourceKey.includes('/'))).toBe(true);
    expect(() => validateSearchVisibilityCandidates(rows)).not.toThrow();
  });
  it('gates locality news with the same exact-match minimum as the route', () => {
    const data = snapshot();
    const input = sources(data);
    input.news = [
      { id: 'news-1', slug: 'tin-1', area_id: 'a-bd', geo_area: null, is_published: true, updated_at: null },
      { id: 'news-2', slug: 'tin-2', area_id: 'a-bd', geo_area: null, is_published: true, updated_at: null },
      { id: 'news-3', slug: 'tin-3', area_id: null, geo_area: 'Bình Dương', is_published: true, updated_at: null },
    ];
    const rows = buildSearchVisibilityCandidates(input);
    expect(rows.find(row => row.sourceKey === 'locality_news:a-bd')).toMatchObject({
      canonicalPath: '/khu-vuc/binh-duong/tin-tuc',
      eligible: true,
    });
    input.news = input.news.slice(0, 2);
    expect(buildSearchVisibilityCandidates(input).find(row => row.sourceKey === 'locality_news:a-bd')).toMatchObject({ eligible: false, reasonCode: 'QUALITY_GATE_FAILED' });
  });
  it('không fallback sang news chung khi locality-news snapshot unavailable', () => {
    const data = snapshot();
    const input = sources(data);
    input.news = [
      { id: 'news-1', slug: 'tin-1', area_id: 'a-bd', geo_area: null, is_published: true, updated_at: null },
      { id: 'news-2', slug: 'tin-2', area_id: 'a-bd', geo_area: null, is_published: true, updated_at: null },
      { id: 'news-3', slug: 'tin-3', area_id: null, geo_area: 'Bình Dương', is_published: true, updated_at: null },
    ];
    input.localityNewsAvailable = false;
    expect(buildSearchVisibilityCandidates(input).some(row => row.sourceKey === 'locality_news:a-bd')).toBe(false);
  });
});
