import { describe, it, expect } from 'vitest';
import { evaluateNeighborhoodSeo, neighborhoodSummary, MIN_NEIGHBORHOOD_LISTINGS_FOR_INDEX } from './neighborhoodSeo';

const enoughListings = Array.from({ length: MIN_NEIGHBORHOOD_LISTINGS_FOR_INDEX }, (_, i) => ({ id: String(i) }));

describe('evaluateNeighborhoodSeo', () => {
  it('indexable khi đủ slug/tên/mô tả + đủ tin đăng', () => {
    const e = evaluateNeighborhoodSeo({
      neighborhood: { name: 'Phú Hồng Thịnh 8', slug: 'phu-hong-thinh-8' },
      activeListings: enoughListings,
      propertyTypes: ['t1'],
      hasDescription: true,
    });
    expect(e.indexable).toBe(true);
    expect(e.robots).toEqual({ index: true, follow: true });
    expect(e.reasons).toEqual([]);
  });

  it('noindex khi thiếu mô tả riêng', () => {
    const e = evaluateNeighborhoodSeo({
      neighborhood: { name: 'X', slug: 'x' },
      activeListings: enoughListings,
      propertyTypes: [],
      hasDescription: false,
    });
    expect(e.indexable).toBe(false);
    expect(e.reasons).toContain('missing_unique_description');
    expect(e.robots.index).toBe(false);
    expect(e.robots.follow).toBe(true); // vẫn follow
  });

  it('noindex khi chưa đủ tin đăng (chống thin-page)', () => {
    const e = evaluateNeighborhoodSeo({
      neighborhood: { name: 'X', slug: 'x' },
      activeListings: [{ id: '1' }],
      propertyTypes: [],
      hasDescription: true,
    });
    expect(e.indexable).toBe(false);
    expect(e.reasons).toContain('not_enough_active_listings');
  });

  it('noindex khi thiếu slug/tên', () => {
    const e = evaluateNeighborhoodSeo({
      neighborhood: { name: '', slug: '' },
      activeListings: enoughListings,
      propertyTypes: [],
      hasDescription: true,
    });
    expect(e.reasons).toContain('missing_slug');
    expect(e.reasons).toContain('missing_name');
  });
});

describe('neighborhoodSummary', () => {
  it('ưu tiên mô tả DB', () => {
    expect(neighborhoodSummary({ name: 'A', description: 'Mô tả riêng.' })).toBe('Mô tả riêng.');
  });
  it('fallback sinh mô tả có tên khi thiếu', () => {
    const s = neighborhoodSummary({ name: 'Phú Hồng Thịnh 8', description: null });
    expect(s).toContain('Phú Hồng Thịnh 8');
  });
});
