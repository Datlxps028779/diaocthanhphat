import { describe, expect, it } from 'vitest';
import {
  isPropertyTypeSeoGroup,
  propertyTypeSeoGroupFromSlug,
  propertyTypeSeoGroupLabel,
  propertyTypeSlugsForSeoGroup,
} from './propertyTypeGroups';

describe('property type SEO groups', () => {
  it('maps broad vocabulary to explicit taxonomy slugs', () => {
    expect(propertyTypeSlugsForSeoGroup('nha')).toEqual(['nha-pho']);
    expect(propertyTypeSlugsForSeoGroup('dat')).toEqual(['dat-nen', 'dat-mau-dat-sao']);
    expect(propertyTypeSeoGroupFromSlug('nha-pho')).toBe('nha');
    expect(propertyTypeSeoGroupFromSlug('dat-nen')).toBe('dat');
    expect(propertyTypeSeoGroupFromSlug('dat-mau-dat-sao')).toBe('dat');
  });

  it('does not silently classify unknown or separate property types', () => {
    expect(propertyTypeSeoGroupFromSlug('can-ho')).toBeNull();
    expect(propertyTypeSeoGroupFromSlug('day-tro')).toBe('day-tro');
    expect(isPropertyTypeSeoGroup('nha')).toBe(true);
    expect(isPropertyTypeSeoGroup('can-ho')).toBe(false);
    expect(propertyTypeSeoGroupLabel('dat')).toBe('đất');
  });
});
