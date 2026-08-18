import { describe, expect, it } from 'vitest';
import { deriveNearbyPoiViewState } from './nearbyPoiState';

describe('deriveNearbyPoiViewState', () => {
  it('phân biệt idle/loading', () => {
    expect(deriveNearbyPoiViewState('idle', [])).toBe('idle');
    expect(deriveNearbyPoiViewState('loading', [])).toBe('loading');
  });

  it('giữ lỗi rõ ràng để UI có retry', () => {
    expect(deriveNearbyPoiViewState('error', [])).toBe('error');
  });

  it('phân biệt không có dữ liệu và có danh sách POI', () => {
    expect(deriveNearbyPoiViewState('done', [])).toBe('empty');
    expect(deriveNearbyPoiViewState('done', [{ name: 'Trường A' }])).toBe('results');
  });
});
