import { describe, expect, it } from 'vitest';
import {
  buildAreaNames,
  buildLocalityGeoAreaAllowlist,
  dedupeLocalityNews,
  localityNewsMatches,
  LOCALITY_NEWS_MINIMUM,
  normalizeLocalityLabel,
} from './localityNewsMatch';

describe('locality news matching', () => {
  const allowlist = buildLocalityGeoAreaAllowlist('Bình Dương', ['  Tỉnh   Bình Dương ']);

  it('matches structured area ids exactly', () => {
    expect(localityNewsMatches({ id: 'structured', area_id: 'area-1', geo_area: 'Nơi khác' }, 'area-1', allowlist)).toBe(true);
    expect(localityNewsMatches({ id: 'other', area_id: 'area-10', geo_area: 'Nơi khác' }, 'area-1', allowlist)).toBe(false);
  });

  it('matches only normalized exact geo-area allowlist values', () => {
    expect(normalizeLocalityLabel('  Bình   Dương  ')).toBe('Bình Dương');
    expect(localityNewsMatches({ id: 'exact', geo_area: '  Bình   Dương ' }, 'area-1', allowlist)).toBe(true);
    expect(localityNewsMatches({ id: 'substring', geo_area: 'Bình Dương và Đồng Nai' }, 'area-1', allowlist)).toBe(false);
    expect(localityNewsMatches({ id: 'empty', geo_area: null }, 'area-1', allowlist)).toBe(false);
  });

  it('deduplicates by article id while preserving first occurrence', () => {
    const rows = [
      { id: 'a', title: 'first' },
      { id: 'a', title: 'duplicate' },
      { id: '', title: 'missing id' },
      { id: 'b', title: 'second' },
    ];
    expect(dedupeLocalityNews(rows)).toEqual([
      { id: 'a', title: 'first' },
      { id: 'b', title: 'second' },
    ]);
  });

  it('exposes the minimum count used before promoting locality news', () => {
    expect(LOCALITY_NEWS_MINIMUM).toBe(3);
  });
});

describe('buildAreaNames', () => {
  it('normalizes names and keeps the slug when a name is unique', () => {
    const names = buildAreaNames([
      { slug: 'binh-duong', name: '  Bình   Dương ' },
      { slug: 'dong-nai', name: 'Đồng Nai' },
    ]);
    expect(names.get('Bình Dương')).toBe('binh-duong');
    expect(names.get('Đồng Nai')).toBe('dong-nai');
  });

  it('drops a name that resolves to two different slugs so narratives are never guessed', () => {
    const names = buildAreaNames([
      { slug: 'binh-duong', name: 'Bình Dương' },
      { slug: 'binh-duong-2', name: '  Bình   Dương ' },
      { slug: 'dong-nai', name: 'Đồng Nai' },
    ]);
    expect(names.has('Bình Dương')).toBe(false);
    expect(names.get('Đồng Nai')).toBe('dong-nai');
  });

  it('skips rows missing a name or a slug', () => {
    const names = buildAreaNames([
      { slug: 'binh-duong', name: null },
      { slug: null, name: 'Đồng Nai' },
      { slug: 'ba-ria', name: '   ' },
    ]);
    expect(names.size).toBe(0);
  });
});
