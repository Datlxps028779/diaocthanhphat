import { describe, expect, it } from 'vitest';
import { readLocationDiscovery, resolveLocationSelection, saveLocationDiscovery, validateLocationItems } from './homeLocationDiscovery';
import { pageToHref } from './router';

const areas = [
  { id: 'a', name: 'Bình Dương', slug: 'binh-duong' },
  { id: 'b', name: 'Bình Phước', slug: 'binh-phuoc' },
  { id: 'c', name: 'Đồng Nai', slug: 'dong-nai' },
];
const item = { id: 'card-a', area_id: 'a', image_url: '', subtitle: '', enabled: true };

describe('home location discovery', () => {
  it('selects a taxonomy tab even when it is not a featured card', () => {
    expect(resolveLocationSelection('c', [item], areas)?.id).toBe('c');
  });
  it('defaults to the first enabled configured card, not taxonomy order', () => {
    expect(resolveLocationSelection('', [{ ...item, enabled: false }, { ...item, id: 'b', area_id: 'b' }], areas)?.id).toBe('b');
  });
  it('recovers after the selected taxonomy area is removed', () => {
    expect(resolveLocationSelection('removed', [item], areas)?.id).toBe('a');
    expect(resolveLocationSelection('removed', [item], [])).toBeUndefined();
  });

  it('resolves legacy internal paths by slug, independent of taxonomy order', () => {
    const result = readLocationDiscovery({ region1_slug: '/khu-vuc/binh-duong' }, [...areas].reverse());
    expect(result.items.map(i => i.area_id)).toEqual(['a', 'b', 'c']);
    expect(result.issues).toEqual([]);
  });
  it('never guesses a supplied invalid or ambiguous legacy identity', () => {
    const result = readLocationDiscovery({ region1_slug: 'missing', region1_title: 'Bình Dương', region2_slug: 'missing', region3_slug: 'missing' }, areas);
    expect(result.items).toEqual([]);
    expect(result.issues).toHaveLength(3);
  });
  it('keeps explicit empty v2 empty rather than restoring defaults', () => {
    expect(readLocationDiscovery({ version: 2, items: [] }, areas).items).toEqual([]);
  });
  it('rejects unknown versions and malformed v2 lists without legacy fallback', () => {
    expect(readLocationDiscovery({ version: 3, items: [item] }, areas).issues.length).toBeGreaterThan(0);
    expect(readLocationDiscovery({ version: 2, items: 'bad' }, areas).items).toEqual([]);
  });
  it('validates duplicates, IDs, missing areas, unsafe images and bounds', () => {
    expect(validateLocationItems([item], areas)).toEqual([]);
    expect(validateLocationItems([item, { ...item, id: 'other' }], areas).length).toBeGreaterThan(0);
    expect(validateLocationItems([{ ...item, area_id: 'missing', image_url: 'javascript:alert(1)' }], areas).length).toBeGreaterThan(0);
    expect(validateLocationItems([{ ...item, subtitle: 'x'.repeat(201) }], areas).length).toBeGreaterThan(0);
  });
  it('preserves settings, order and disabled items when saving', () => {
    const disabled = { ...item, id: 'card-b', area_id: 'b', enabled: false };
    const settings = saveLocationDiscovery({ empty_behavior: 'empty_state', region1_slug: 'old' }, [disabled, item]);
    expect(settings.empty_behavior).toBe('empty_state');
    expect(readLocationDiscovery(settings, areas).items).toEqual([disabled, item]);
  });
  it('keeps province identity in links even when district names repeat', () => {
    const href = new URL(pageToHref({ name: 'listings', areaId: 'a', district: 'Trùng tên' }), 'https://example.test');
    expect(href.searchParams.get('area')).toBe('a');
    expect(href.searchParams.get('district')).toBe('Trùng tên');
  });
  it('does not render malformed or duplicate public entries', () => {
    const result = readLocationDiscovery({ version: 2, items: [item, null, item, { ...item, id: 'x', area_id: 'missing' }] }, areas);
    expect(result.items).toEqual([item]);
    expect(result.issues.length).toBeGreaterThan(0);
  });
});
