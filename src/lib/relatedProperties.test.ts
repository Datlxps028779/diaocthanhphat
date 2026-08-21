import { describe, expect, it } from 'vitest';
import { buildRelatedPropertyReason, mergeRelatedPropertyCandidates, rankRelatedProperties } from './relatedProperties';

function property(overrides: Record<string, unknown> = {}) {
  return {
    id: 'current',
    listing_type: 'mua_ban' as const,
    area_id: 'area-1',
    district: 'Thuận An',
    property_type_id: 'land',
    property_types: { name: 'Đất nền' },
    price: 2,
    price_per_month: null,
    area_sqm: 100,
    bedrooms: null,
    legal_status: 'Sổ hồng',
    created_at: '2026-08-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('rankRelatedProperties', () => {
  it('keeps transaction type as a hard requirement and excludes the current listing', () => {
    const current = property();
    const ranked = rankRelatedProperties(current, [
      current,
      property({ id: 'rental', listing_type: 'cho_thue', price_per_month: 2 }),
      property({ id: 'sale' }),
    ]);

    expect(ranked.map(item => item.id)).toEqual(['sale']);
  });

  it('prioritizes same district and property type over broader candidates', () => {
    const current = property();
    const ranked = rankRelatedProperties(current, [
      property({ id: 'same-area', district: 'Dầu Tiếng', property_type_id: 'house', property_types: { name: 'Nhà phố' } }),
      property({ id: 'same-type-other-area', area_id: 'area-2', district: 'Chơn Thành' }),
      property({ id: 'same-district-other-type', property_type_id: 'house', property_types: { name: 'Nhà phố' } }),
      property({ id: 'exact', price: 2.1 }),
    ]);

    expect(ranked.map(item => item.id)).toEqual(['exact', 'same-district-other-type', 'same-area', 'same-type-other-area']);
  });

  it('uses closest price and area within the same tier', () => {
    const current = property();
    const ranked = rankRelatedProperties(current, [
      property({ id: 'far', price: 9, area_sqm: 400 }),
      property({ id: 'near-price-far-area', price: 2.1, area_sqm: 250 }),
      property({ id: 'near-both', price: 2.1, area_sqm: 105 }),
    ]);

    expect(ranked.map(item => item.id)).toEqual(['near-both', 'near-price-far-area', 'far']);
  });

  it('only widens to another area after local candidates and honors the limit', () => {
    const current = property();
    const ranked = rankRelatedProperties(current, [
      property({ id: 'same-district-1' }),
      property({ id: 'same-district-2', price: 2.2 }),
      property({ id: 'same-type-other-area', area_id: 'area-2', district: 'Chơn Thành' }),
    ], 2);

    expect(ranked.map(item => item.id)).toEqual(['same-district-1', 'same-district-2']);
  });

  it('does not fabricate optional similarity reasons', () => {
    const current = property({ legal_status: null, property_types: null });
    const candidate = property({ id: 'candidate', legal_status: null, property_types: null });

    expect(buildRelatedPropertyReason(current, candidate)).toBe('Cùng Thuận An');
  });

  it('uses recency then id as a deterministic tie break', () => {
    const current = property();
    const ranked = rankRelatedProperties(current, [
      property({ id: 'z', created_at: '2026-08-01T00:00:00.000Z' }),
      property({ id: 'a', created_at: '2026-08-01T00:00:00.000Z' }),
      property({ id: 'newer', created_at: '2026-08-02T00:00:00.000Z' }),
    ]);

    expect(ranked.map(item => item.id)).toEqual(['newer', 'a', 'z']);
  });

  it('keeps an older local candidate when relevance query groups overlap', () => {
    const localOlder = property({ id: 'local-older', created_at: '2025-01-01T00:00:00.000Z' });
    const sameAreaNewer = property({ id: 'same-area-newer', district: 'Dầu Tiếng', created_at: '2026-08-02T00:00:00.000Z' });
    const sameTypeElsewhere = property({ id: 'same-type-elsewhere', area_id: 'area-2', district: 'Chơn Thành', created_at: '2026-08-03T00:00:00.000Z' });

    const merged = mergeRelatedPropertyCandidates(
      [localOlder],
      [sameAreaNewer, localOlder],
      [sameTypeElsewhere, localOlder],
    );

    expect(merged.map(item => item.id)).toEqual(['local-older', 'same-area-newer', 'same-type-elsewhere']);
    expect(rankRelatedProperties(property(), merged).map(item => item.id)).toEqual([
      'local-older',
      'same-area-newer',
      'same-type-elsewhere',
    ]);
  });
});
