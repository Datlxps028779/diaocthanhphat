import { describe, expect, it } from 'vitest';
import { buildHomepageListingTarget, shouldClearInferredLocation } from './listingSearchState';
import type { SearchIntent } from './aiSearch';

function intent(overrides: Partial<SearchIntent> = {}): SearchIntent {
  return {
    filters: {},
    residualKeyword: '',
    matched: [],
    confidence: 'low',
    ...overrides,
  };
}

describe('buildHomepageListingTarget', () => {
  it('moves a recognized ward out of q and marks the location as inferred', () => {
    expect(buildHomepageListingTarget({
      activeTab: 'mua_ban',
      explicit: {},
      intent: intent({ filters: { ward: 'An Phú' }, residualKeyword: '  ' }),
    })).toEqual({
      name: 'listings',
      listingType: 'mua_ban',
      areaId: undefined,
      district: undefined,
      ward: 'An Phú',
      locationSource: 'inferred',
      typeId: undefined,
      keyword: undefined,
      minPrice: undefined,
      maxPrice: undefined,
    });
  });

  it('preserves an explicitly selected location with a residual keyword', () => {
    expect(buildHomepageListingTarget({
      activeTab: 'mua_ban',
      explicit: { areaId: 'a1', district: 'Thuận An', ward: 'An Phú' },
      intent: intent({ residualKeyword: 'nhà 2 phòng' }),
    })).toMatchObject({
      areaId: 'a1',
      district: 'Thuận An',
      ward: 'An Phú',
      locationSource: undefined,
      keyword: 'nhà 2 phòng',
    });
  });
});

describe('shouldClearInferredLocation', () => {
  it('clears an inferred location when the keyword changes', () => {
    expect(shouldClearInferredLocation({
      locationSource: 'inferred',
      initialKeyword: '',
      nextKeyword: 'Minh Hưng',
    })).toBe(true);
  });

  it('keeps an explicit location when the keyword changes', () => {
    expect(shouldClearInferredLocation({
      locationSource: 'explicit',
      initialKeyword: '',
      nextKeyword: 'nhà 2 phòng',
    })).toBe(false);
  });
});
