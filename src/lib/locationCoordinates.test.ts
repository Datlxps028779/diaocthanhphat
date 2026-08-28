import { describe, expect, it } from 'vitest';
import { coordinatePairFromUnknown, validateCoordinatePair } from './locationCoordinates';

describe('validateCoordinatePair', () => {
  it('allows an empty pair', () => {
    expect(validateCoordinatePair('', '')).toEqual({ valid: true, coordinates: { latitude: null, longitude: null } });
  });

  it('accepts finite coordinates, including boundaries', () => {
    expect(validateCoordinatePair('10.9804', '106.6519')).toEqual({ valid: true, coordinates: { latitude: 10.9804, longitude: 106.6519 } });
    expect(validateCoordinatePair(-90, 180)).toEqual({ valid: true, coordinates: { latitude: -90, longitude: 180 } });
  });

  it('requires both coordinates together', () => {
    expect(validateCoordinatePair('10.9', '')).toMatchObject({ valid: false });
    expect(validateCoordinatePair('', '106.6')).toMatchObject({ valid: false });
  });

  it('rejects malformed, non-finite, and out-of-range values', () => {
    for (const pair of [['10abc', '106.6'], [NaN, 106.6], [Infinity, 106.6], [91, 106.6], [10.9, 181]]) {
      expect(validateCoordinatePair(pair[0], pair[1])).toMatchObject({ valid: false });
    }
  });

  it('normalizes invalid pairs to empty coordinates for previews', () => {
    expect(coordinatePairFromUnknown('10.9', '')).toEqual({ latitude: null, longitude: null });
    expect(coordinatePairFromUnknown('10.9', '106.6')).toEqual({ latitude: 10.9, longitude: 106.6 });
  });
});
