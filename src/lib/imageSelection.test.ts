import { describe, expect, it } from 'vitest';
import { appendImageUrls } from './imageSelection';

describe('appendImageUrls', () => {
  it('appends multiple uploaded URLs in order', () => {
    const result = appendImageUrls(['a.jpg'], ['b.jpg', 'c.jpg'], 5);
    expect(result.images).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(result.added).toEqual(['b.jpg', 'c.jpg']);
  });

  it('trims URLs and ignores empty values', () => {
    const result = appendImageUrls([' a.jpg '], [' ', ' b.jpg ', ''], 5);
    expect(result.images).toEqual(['a.jpg', 'b.jpg']);
    expect(result.added).toEqual(['b.jpg']);
  });

  it('skips duplicates from existing and incoming URLs', () => {
    const result = appendImageUrls(['a.jpg'], ['a.jpg', 'b.jpg', 'b.jpg'], 5);
    expect(result.images).toEqual(['a.jpg', 'b.jpg']);
    expect(result.added).toEqual(['b.jpg']);
    expect(result.skippedDuplicate).toEqual(['a.jpg', 'b.jpg']);
  });

  it('enforces max image count and reports overflow', () => {
    const result = appendImageUrls(['a.jpg', 'b.jpg'], ['c.jpg', 'd.jpg'], 3);
    expect(result.images).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(result.added).toEqual(['c.jpg']);
    expect(result.skippedOverflow).toEqual(['d.jpg']);
  });

  it('does not lose earlier selected URLs when merging a batch', () => {
    const result = appendImageUrls([], ['a.jpg', 'b.jpg', 'c.jpg'], 10);
    expect(result.images).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
  });
});
