import { describe, expect, it } from 'vitest';
import { buildListingResultLabel, listingEmptyStateGuidance } from './listingDecision';

describe('buildListingResultLabel', () => {
  it('describes the active property type, transaction, and most specific place', () => {
    expect(buildListingResultLabel({
      propertyTypeName: 'Đất nền',
      listingType: 'mua_ban',
      areaName: 'Bình Dương',
      district: 'Thuận An',
      ward: 'An Phú',
    })).toBe('Đất nền bán An Phú');
  });

  it('uses the residual keyword when no location is active', () => {
    expect(buildListingResultLabel({ listingType: 'mua_ban', keyword: 'Minh Hưng' }))
      .toBe('bất động sản bán Minh Hưng');
  });

  it('falls back to the generic subject when no decision filters are active', () => {
    expect(buildListingResultLabel({ listingType: '' })).toBe('bất động sản');
  });
});

describe('listingEmptyStateGuidance', () => {
  it('uses a rental-specific recovery suggestion', () => {
    expect(listingEmptyStateGuidance('cho_thue')).toContain('cho thuê');
  });

  it('uses search recovery guidance for sales and unscoped results', () => {
    expect(listingEmptyStateGuidance('mua_ban')).toContain('từ khóa');
    expect(listingEmptyStateGuidance('')).toContain('từ khóa');
  });
});
