import { describe, expect, it } from 'vitest';
import sitemap, { shouldIncludeAreaListingType } from './sitemap';

describe('public sitemap', () => {
  it('always emits the approved canonical origin, never the deployment origin', async () => {
    const entries = await sitemap();

    expect(entries.length).toBeGreaterThan(0);
    expect(entries.every(entry => entry.url.startsWith('https://chonhaviet.com/'))).toBe(true);
    expect(entries.some(entry => entry.url.includes('vercel.app'))).toBe(false);
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
});
