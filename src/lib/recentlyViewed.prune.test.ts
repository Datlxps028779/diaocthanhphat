import { afterEach, describe, expect, it, vi } from 'vitest';
import { getRecentlyViewed, pruneRecentlyViewedUnavailable, recordRecentlyViewed } from './recentlyViewed';
import type { Property } from './supabase';

function setup(value: unknown) {
  let stored = JSON.stringify(value);
  const dispatchEvent = vi.fn();
  vi.stubGlobal('window', { localStorage: { getItem: () => stored, setItem: (_: string, text: string) => { stored = text; } }, dispatchEvent });
  vi.stubGlobal('CustomEvent', class { constructor(readonly type: string) {} });
  return { dispatchEvent };
}

afterEach(() => vi.unstubAllGlobals());

describe('recent history pruning', () => {
  it('does not notify when public verification changed nothing', () => {
    const { dispatchEvent } = setup([{ id: 'a' }]);
    pruneRecentlyViewedUnavailable(['a'], ['a']);
    expect(dispatchEvent).not.toHaveBeenCalled();
  });
  it('preserves newly recorded IDs outside the verified snapshot', () => {
    setup([{ id: 'new' }, { id: 'gone' }, { id: 'kept' }]);
    expect(pruneRecentlyViewedUnavailable(['gone', 'kept'], ['kept']).map(item => item.id)).toEqual(['new', 'kept']);
  });
  it('bounds and deduplicates imported history', () => {
    setup([{ id: 'a' }, { id: 'a' }, ...Array.from({ length: 20 }, (_, i) => ({ id: String(i) }))]);
    expect(getRecentlyViewed()).toHaveLength(8);
    expect(getRecentlyViewed().filter(item => item.id === 'a')).toHaveLength(1);
  });
  it('tolerates blocked storage reads and writes', () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('blocked'); } });
    expect(getRecentlyViewed()).toEqual([]);
    expect(() => recordRecentlyViewed({ id: 'a' } as Property)).not.toThrow();
    expect(() => pruneRecentlyViewedUnavailable(['a'], [])).not.toThrow();
  });
});
