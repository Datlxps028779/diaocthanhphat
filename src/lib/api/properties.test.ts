import { describe, expect, it } from 'vitest';
import {
  normalizeAdminPropertyLimit,
  normalizeAdminPropertyPage,
  sanitizeAdminPropertyKeyword,
} from './properties';

describe('Admin property catalogue filter guards', () => {
  it('removes PostgREST structural characters from a keyword', () => {
    expect(sanitizeAdminPropertyKeyword('  nha, (pho)\\%  quan 1  ')).toBe('nha pho quan 1');
  });

  it('limits keyword length after normalizing whitespace', () => {
    expect(sanitizeAdminPropertyKeyword(`  ${'a'.repeat(130)}  `)).toHaveLength(120);
  });

  it.each([
    [undefined, 1],
    [0, 1],
    [-2, 1],
    [1.5, 1],
    [3, 3],
  ])('normalizes page %s to %s', (value, expected) => {
    expect(normalizeAdminPropertyPage(value)).toBe(expected);
  });

  it.each([
    [undefined, 25],
    [20, 25],
    [25, 25],
    [50, 50],
    [100, 100],
  ])('allows only approved page limits: %s', (value, expected) => {
    expect(normalizeAdminPropertyLimit(value)).toBe(expected);
  });
});
