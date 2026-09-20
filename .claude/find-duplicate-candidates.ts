import { buildSearchVisibilityCandidates, type SearchVisibilitySources } from '../src/lib/server/searchVisibility';

// Simulate production data
const properties = Array.from({ length: 6 }, (_, i) => ({
  id: `p-area1-${i}`,
  slug: `dat-a1-${i}`,
  public_code: 100 + i,
  listing_type: 'mua_ban' as const,
  district: 'Thuận An',
  district_id: 'district-1',
  area_id: 'area-1',
  property_type_id: 'type-1',
  title: `Đất ${i}`,
  is_active: true,
  updated_at: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
  areas: { slug: 'binh-duong' },
  neighborhood_slug: null,
}));

const sources: SearchVisibilitySources = {
  properties,
  areas: [
    { id: 'area-1', name: 'Bình Dương', slug: 'binh-duong', description: 'Area 1', created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'area-2', name: 'Đồng Nai', slug: 'dong-nai', description: 'Area 2', created_at: '2026-01-01T00:00:00.000Z' },
  ],
  districts: [
    { id: 'district-1', area_id: 'area-1', name: 'Thuận An', slug: 'thuan-an' },
  ],
  propertyTypes: [
    { id: 'type-1', name: 'Đất nền', slug: 'dat-nen' },
  ],
  neighborhoods: [],
  news: [],
  newsCategories: [
    { id: 'cat-1', slug: 'kien-thuc', updated_at: '2026-01-01T00:00:00.000Z' },
    { id: 'cat-2', slug: 'thi-truong', updated_at: '2026-01-01T00:00:00.000Z' },
  ],
  managedPages: [],
};

const candidates = buildSearchVisibilityCandidates(sources);

// Find duplicates by canonical_url
const urlMap = new Map<string | null, string[]>();
for (const c of candidates) {
  const url = c.canonicalUrl;
  if (!urlMap.has(url)) urlMap.set(url, []);
  urlMap.get(url)!.push(c.sourceKey);
}

console.log('=== Duplicate canonical URLs ===');
for (const [url, sources] of urlMap.entries()) {
  if (sources.length > 1 && url !== null) {
    console.log(`\nURL: ${url}`);
    console.log(`Sources (${sources.length}):`, sources);
  }
}

const eligible = candidates.filter(c => c.eligible);
console.log(`\n✓ Total candidates: ${candidates.length}, eligible: ${eligible.length}`);
console.log('Entity types:', [...new Set(candidates.map(c => c.entityType))].sort());
