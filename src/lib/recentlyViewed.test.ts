import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Property } from './supabase';

// Stub localStorage + window trước khi import module (module đọc window ở top-level guard).
function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal('window', { localStorage, dispatchEvent: () => true, Event: class {} });
  vi.stubGlobal('localStorage', localStorage);
  return store;
}

function property(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1', title: 'Nhà phố', price: 3, price_unit: 'tỷ', price_label: null,
    image_url: null, area_sqm: 80, district: 'Dĩ An', city: 'Bình Dương',
    slug: 'nha-pho', listing_type: 'mua_ban',
    ...overrides,
  } as Property;
}

describe('recentlyViewed', () => {
  let getRecentlyViewed: typeof import('./recentlyViewed').getRecentlyViewed;
  let recordRecentlyViewed: typeof import('./recentlyViewed').recordRecentlyViewed;

  beforeEach(async () => {
    installLocalStorage();
    vi.resetModules();
    const mod = await import('./recentlyViewed');
    getRecentlyViewed = mod.getRecentlyViewed;
    recordRecentlyViewed = mod.recordRecentlyViewed;
  });

  it('ghi 1 BĐS rồi đọc lại được', () => {
    recordRecentlyViewed(property({ id: 'a' }));
    expect(getRecentlyViewed().map(p => p.id)).toEqual(['a']);
  });

  it('đưa mục mới lên đầu và khử trùng', () => {
    recordRecentlyViewed(property({ id: 'a' }));
    recordRecentlyViewed(property({ id: 'b' }));
    recordRecentlyViewed(property({ id: 'a' }));
    expect(getRecentlyViewed().map(p => p.id)).toEqual(['a', 'b']);
  });

  it('giới hạn tối đa 8 mục', () => {
    for (let i = 0; i < 12; i++) recordRecentlyViewed(property({ id: `p${i}` }));
    expect(getRecentlyViewed()).toHaveLength(8);
  });

  it('excludeId loại BĐS đang xem khỏi danh sách', () => {
    recordRecentlyViewed(property({ id: 'a' }));
    recordRecentlyViewed(property({ id: 'b' }));
    expect(getRecentlyViewed('a').map(p => p.id)).toEqual(['b']);
  });
});
