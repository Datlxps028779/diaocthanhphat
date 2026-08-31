import { describe, expect, it } from 'vitest';
import { dedupeFeaturedSectionProperties } from './featuredSectionDedupe';

const property = (id: string) => ({ id } as never);

describe('dedupeFeaturedSectionProperties', () => {
  it('keeps the first section priority and preserves order', () => {
    const result = dedupeFeaturedSectionProperties([
      { section: { id: 'featured' }, properties: [property('a'), property('b')] },
      { section: { id: 'hot' }, properties: [property('b'), property('c')] },
    ]);
    expect(result.map(entry => entry.properties.map(item => (item as { id: string }).id))).toEqual([['a', 'b'], ['c']]);
  });

  it('removes sections left empty by deduplication', () => {
    const result = dedupeFeaturedSectionProperties([
      { section: { id: 'first' }, properties: [property('a')] },
      { section: { id: 'second' }, properties: [property('a')] },
    ]);
    expect(result).toHaveLength(1);
  });
});
