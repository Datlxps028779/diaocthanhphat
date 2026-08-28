import { describe, expect, it } from 'vitest';
import { pickArcGisCandidate, canonicalGeocoderQuery, geocoderQueryVariants } from './LocationPicker';

describe('canonicalGeocoderQuery', () => {
  it('normalizes the seeded Đắc Lua spelling for providers', () => {
    expect(canonicalGeocoderQuery('Đắc Lua, Tân Phú, Đồng Nai')).toBe('Đak Lua, Tân Phú, Đồng Nai');
  });

  it('does not alter unrelated administrative names', () => {
    expect(canonicalGeocoderQuery('Đắc Nông, Đồng Nai')).toBe('Đắc Nông, Đồng Nai');
  });
  it('tries explicit Vietnamese administrative prefixes without changing the legacy hierarchy', () => {
    expect(geocoderQueryVariants('An Phú, Thuận An, Bình Dương')).toEqual([
      'Phường An Phú, Thuận An, Bình Dương',
      'Xã An Phú, Thuận An, Bình Dương',
      'Thị trấn An Phú, Thuận An, Bình Dương',
      'An Phú, Thuận An, Bình Dương',
    ]);
  });
});

describe('pickArcGisCandidate', () => {
  it('selects the ward matching the first requested location part', () => {
    const result = pickArcGisCandidate([
      { address: 'Hớn Quản, Bình Phước', score: 87.83, location: { x: 106.60586, y: 11.64711 } },
      { address: 'Tan Khai, Bình Phước', score: 86.95, location: { x: 106.61667, y: 11.55 } },
      { address: 'Xã Tân Khai, Bình Phước', score: 83.93, location: { x: 106.61459, y: 11.54058 } },
    ], 'Tân Khai, Hớn Quản, Bình Phước');
    expect(result).toEqual({ lat: 11.55, lng: 106.61667, label: 'Tan Khai, Bình Phước' });
  });

  it('accepts the provider spelling Đak Lua when the selected ward is Đắc Lua', () => {
    const result = pickArcGisCandidate([
      { address: 'Tân Phú, Đồng Nai', score: 100, location: { x: 107.428841, y: 11.26711 } },
      { address: 'Đak Lua, Đồng Nai', score: 86.49, location: { x: 107.374648, y: 11.537466 } },
    ], canonicalGeocoderQuery('Đắc Lua, Tân Phú, Đồng Nai'));
    expect(result).toEqual({ lat: 11.537466, lng: 107.374648, label: 'Đak Lua, Đồng Nai' });
  });
  it('rejects a provider result that drops the selected ward', () => {
    expect(pickArcGisCandidate([
      { address: 'Tân Phú, Đồng Nai', score: 100, location: { x: 107.428841, y: 11.26711 } },
    ], 'Đak Lua, Tân Phú, Đồng Nai')).toBeNull();
  });

  it('selects An Phú under the Bình Dương branch instead of another same-name place', () => {
    const result = pickArcGisCandidate([
      { address: 'An Phú, An Khánh, Hồ Chí Minh', score: 100, location: { x: 106.7483999, y: 10.7916232 } },
      { address: 'Phường An Phú, Bình Dương', score: 83.73, location: { x: 106.73683, y: 10.94734 } },
    ], 'An Phú, Thuận An, Bình Dương');
    expect(result).toEqual({ lat: 10.94734, lng: 106.73683, label: 'Phường An Phú, Bình Dương' });
  });
  it('prefers an exact administrative label over an ambiguous place name', () => {
    const result = pickArcGisCandidate([
      { address: 'Bình Phước, Đồng Nai', score: 100, location: { x: 106.900775, y: 11.539697 } },
      { address: 'Bình Phước', score: 100, location: { x: 106.91667, y: 11.75 } },
    ], 'Bình Phước');
    expect(result).toEqual({ lat: 11.75, lng: 106.91667, label: 'Bình Phước' });
  });
});
