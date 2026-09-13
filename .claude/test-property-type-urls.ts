import { buildSearchVisibilityCandidates, type SearchVisibilitySources } from '../src/lib/server/searchVisibility';

// Create 5+ properties across 2+ areas to pass quality gate
const properties = [
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `p-area1-${i}`,
    slug: `dat-a1-${i}`,
    public_code: 100 + i,
    listing_type: 'mua_ban' as const,
    district: 'Thuận An',
    district_id: 'district-1',
    area_id: 'area-1',
    property_type_id: 'type-1',
    title: `Đất Bình Dương ${i}`,
    is_active: true,
    updated_at: `2026-09-${String(i + 1).padStart(2, '0')}T00:00:00.000Z`,
    areas: { slug: 'binh-duong' },
    neighborhood_slug: null,
  })),
  ...Array.from({ length: 3 }, (_, i) => ({
    id: `p-area2-${i}`,
    slug: `dat-a2-${i}`,
    public_code: 200 + i,
    listing_type: 'mua_ban' as const,
    district: 'Dĩ An',
    district_id: 'district-2',
    area_id: 'area-2',
    property_type_id: 'type-1',
    title: `Đất Đồng Nai ${i}`,
    is_active: true,
    updated_at: `2026-09-${String(i + 10).padStart(2, '0')}T00:00:00.000Z`,
    areas: { slug: 'dong-nai' },
    neighborhood_slug: null,
  })),
];

const sources: SearchVisibilitySources = {
  properties,
  areas: [
    { id: 'area-1', name: 'Bình Dương', slug: 'binh-duong', description: 'Area 1', created_at: '2026-01-01T00:00:00.000Z' },
    { id: 'area-2', name: 'Đồng Nai', slug: 'dong-nai', description: 'Area 2', created_at: '2026-01-01T00:00:00.000Z' },
  ],
  districts: [
    { id: 'district-1', area_id: 'area-1', name: 'Thuận An', slug: 'thuan-an' },
    { id: 'district-2', area_id: 'area-2', name: 'Dĩ An', slug: 'di-an' },
  ],
  propertyTypes: [
    { id: 'type-1', name: 'Đất nền', slug: 'dat-nen' },
  ],
  neighborhoods: [],
  news: [],
  newsCategories: [],
  managedPages: [],
};

const candidates = buildSearchVisibilityCandidates(sources);
const propertyTypeCandidates = candidates.filter(c => c.entityType === 'property_type');

console.log('Property type candidates (6 listings, 2 areas, 2 districts):');
propertyTypeCandidates.forEach(c => {
  console.log(JSON.stringify({
    sourceKey: c.sourceKey,
    entityType: c.entityType,
    entityId: c.entityId,
    canonicalPath: c.canonicalPath,
    canonicalUrl: c.canonicalUrl,
    eligible: c.eligible,
    reasonCode: c.reasonCode
  }, null, 2));
});

if (propertyTypeCandidates.length > 0 && propertyTypeCandidates[0].canonicalUrl) {
  const url = propertyTypeCandidates[0].canonicalUrl;
  if (url.startsWith('https://chonhaviet.com/loai-nha-dat/')) {
    console.log('\n✓ URL generation is CORRECT - absolute URL with domain');
  } else {
    console.log('\n✗ URL generation is WRONG - expected https://chonhaviet.com/loai-nha-dat/{slug}');
    console.log(`  Got: ${url}`);
  }
}
