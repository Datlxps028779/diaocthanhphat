import { describe, expect, it } from 'vitest';
import { buildNewsPath, isCanonicalNewsSource } from './newsPath';

describe('news public canonical path', () => {
  it('builds a path only from a valid slug', () => {
    expect(buildNewsPath({ slug: 'gia-nha-di-an-2026' })).toBe('/tin-tuc/gia-nha-di-an-2026');
    expect(isCanonicalNewsSource({ slug: 'gia-nha-di-an-2026' })).toBe(true);
  });

  it('never falls back to a UUID or malformed raw slug', () => {
    expect(buildNewsPath({ slug: null })).toBeNull();
    expect(buildNewsPath({ slug: 'bai-viet-' })).toBeNull();
    expect(buildNewsPath({ slug: 'Tin-Viet-Hoa' })).toBeNull();
    expect(isCanonicalNewsSource({ slug: undefined })).toBe(false);
  });
});
