import { beforeEach, describe, expect, it, vi } from 'vitest';

const localityNewsState = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/supabase-server', () => ({
  serverGetLocalityNews: localityNewsState.get,
}));

import sitemap, { buildNewsSitemapEntries, buildLocalitySitemapEntries, shouldIncludeAreaListingType, shouldIncludeCompositeAreaListing } from './sitemap';

vi.mock('@/lib/server/localitySnapshot', () => ({
  loadLocalitySnapshot: vi.fn(),
  LOCALITY_SNAPSHOT_UNAVAILABLE: 'Locality snapshot unavailable',
}));

import { loadLocalitySnapshot } from '@/lib/server/localitySnapshot';

beforeEach(() => {
  localityNewsState.get.mockResolvedValue({
    data: [],
    total: 0,
    indexable: false,
    available: true,
    latestUpdatedAt: null,
  });
});

const taxonomy = {
  areas: [{
    id: 'a-bd', slug: 'binh-duong', name: 'Bình Dương',
    description: 'Mô tả khu vực.', admin_note: null, meta_title: null, meta_description: null, focus_keywords: null, image_url: null,
  }],
  districts: [{ id: 'd-di-an', area_id: 'a-bd', slug: 'binh-duong-di-an', name: 'Dĩ An' }],
  wards: [],
  propertyTypes: [{ id: 't-nha-pho', slug: 'nha-pho', name: 'Nhà phố' }, { id: 't-dat-nen', slug: 'dat-nen', name: 'Đất nền' }],
};

function localityRows(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    id: `p-${i}`, title: `Tin số ${i}`, area_id: 'a-bd', district_id: 'd-di-an', ward_id: null,
    property_type_id: i % 2 ? 't-nha-pho' : 't-dat-nen', listing_type: 'mua_ban',
    price: 3, price_unit: 'tỷ', price_per_month: null, area_sqm: 100,
    updated_at: `2026-09-${String((i % 9) + 1).padStart(2, '0')}T00:00:00.000Z`,
  }));
}

describe('public sitemap', () => {
  it('always emits the approved canonical origin, never the deployment origin', async () => {
    const entries = await sitemap();

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(entry => entry.url.startsWith('https://chonhaviet.com/'))).toBe(true);
    expect(entries.some(entry => entry.url.includes('vercel.app'))).toBe(false);
  });

  it('does not emit malformed News slugs or UUID fallbacks', () => {
    const entries = buildNewsSitemapEntries([
      { id: 'valid-id', slug: 'bai-viet-hop-le', updated_at: '2026-09-11T00:00:00.000Z' },
      { id: 'bad-id', slug: 'bai-viet-' },
      { id: 'missing-id', slug: null },
    ]);

    expect(entries).toHaveLength(1);
    expect(entries[0].url).toBe('https://chonhaviet.com/tin-tuc/bai-viet-hop-le');
  });
  it('only indexes a grouped property type route with enough distinct titled inventory', () => {
    const area = { name: 'Bình Dương', slug: 'binh-duong', description: 'Mô tả khu vực.' };
    const rows = Array.from({ length: 5 }, (_, index) => ({
      id: `land-${index}`,
      area_id: 'area-1',
      district_id: 'district-1',
      district: 'Dĩ An',
      property_type_id: `type-${index}`,
      listing_type: 'mua_ban' as const,
      title: `Đất nền ${index}`,
      updated_at: `2026-09-0${index + 1}T00:00:00.000Z`,
    }));
    expect(shouldIncludeCompositeAreaListing(area, rows, 'district-1', 'mua_ban', 'dat', new Set(rows.map(row => row.property_type_id)))).toBe(true);
    expect(shouldIncludeCompositeAreaListing(area, rows.slice(0, 4), 'district-1', 'mua_ban', 'dat', new Set(rows.map(row => row.property_type_id)))).toBe(false);
  });
  it('only indexes an area transaction route when that type has enough inventory', () => {
    const area = { name: 'Khu vực thử nghiệm', slug: 'khu-vuc-thu-nghiem', description: 'Mô tả khu vực.' };
    const saleRows = Array.from({ length: 5 }, (_, index) => ({
      id: `sale-${index}`,
      area_id: 'area-1',
      district: index % 2 ? 'Dĩ An' : 'Thuận An',
      property_type_id: index % 2 ? 'house' : 'land',
      listing_type: 'mua_ban' as const,
    }));
    const rentalRows = Array.from({ length: 4 }, (_, index) => ({
      id: `rent-${index}`,
      area_id: 'area-1',
      district: 'Dĩ An',
      property_type_id: 'house',
      listing_type: 'cho_thue' as const,
    }));

    expect(shouldIncludeAreaListingType(area, [...saleRows, ...rentalRows], 'mua_ban')).toBe(true);
    expect(shouldIncludeAreaListingType(area, [...saleRows, ...rentalRows], 'cho_thue')).toBe(false);
  });

  it('họ landing địa phương vào sitemap qua gate snapshot đầy đủ, report đủ ngưỡng cũng vào', async () => {
    vi.mocked(loadLocalitySnapshot).mockResolvedValue({
      computedAt: '2026-09-16T00:00:00.000Z',
      rows: localityRows(600) as never,
      ...taxonomy,
    } as never);

    const entries = await buildLocalitySitemapEntries();
    const paths = entries.map(entry => new URL(entry.url).pathname);

    expect(paths).toContain('/khu-vuc/binh-duong');
    // Report đủ dữ liệu do CHÍNH evaluator cho index → được vào sitemap.
    expect(paths).toContain('/khu-vuc/binh-duong/thong-tin');
    expect(entries.every(entry => entry.url.startsWith('https://chonhaviet.com/'))).toBe(true);
    // 600 row phải được đếm trọn, không cắt còn 500.
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('lấy lastModified từ toàn bộ matched set, không chỉ ba bài hiển thị', async () => {
    vi.mocked(loadLocalitySnapshot).mockResolvedValue({
      computedAt: '2026-09-16T00:00:00.000Z',
      rows: localityRows(600) as never,
      ...taxonomy,
    } as never);
    localityNewsState.get.mockResolvedValue({
      data: [
        { id: 'news-1', slug: 'tin-1', created_at: '2026-09-16T00:00:00.000Z', updated_at: '2026-09-16T00:00:00.000Z' },
        { id: 'news-2', slug: 'tin-2', created_at: '2026-09-15T00:00:00.000Z', updated_at: '2026-09-15T00:00:00.000Z' },
        { id: 'news-3', slug: 'tin-3', created_at: '2026-09-14T00:00:00.000Z', updated_at: '2026-09-14T00:00:00.000Z' },
      ],
      total: 4,
      indexable: true,
      available: true,
      latestUpdatedAt: '2026-09-18T12:00:00.000Z',
    });

    const entries = await buildLocalitySitemapEntries();
    const newsEntry = entries.find(entry => entry.url === 'https://chonhaviet.com/khu-vuc/binh-duong/tin-tuc');
    expect(newsEntry?.lastModified).toEqual(new Date('2026-09-18T12:00:00.000Z'));
    expect(localityNewsState.get).toHaveBeenCalledWith(expect.objectContaining({ areaId: 'a-bd', limit: 3 }));
  });


  it('dữ liệu mỏng: report thiếu ngưỡng KHÔNG vào sitemap dù landing có thể vào', async () => {
    vi.mocked(loadLocalitySnapshot).mockResolvedValue({
      computedAt: '2026-09-16T00:00:00.000Z',
      rows: localityRows(1) as never,
      ...taxonomy,
    } as never);

    const paths = (await buildLocalitySitemapEntries()).map(entry => new URL(entry.url).pathname);
    expect(paths.some(path => path.endsWith('/thong-tin'))).toBe(false);
  });

  it('snapshot lỗi thì KHÔNG công bố entry địa phương nào (fail closed)', async () => {
    vi.mocked(loadLocalitySnapshot).mockRejectedValue(new Error('Locality snapshot unavailable'));
    expect(await buildLocalitySitemapEntries()).toEqual([]);
  });
});
