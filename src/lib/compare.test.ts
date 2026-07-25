import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Property } from './supabase';

function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal('window', { localStorage, dispatchEvent: () => true });
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('Event', class { constructor(public type: string) {} });
}

function property(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1', title: 'Nhà phố', price: 3, price_unit: 'tỷ', price_label: null,
    image_url: null, area_sqm: 80, bedrooms: 2, bathrooms: 2, direction: 'Đông',
    legal_status: 'Sổ hồng', district: 'Dĩ An', city: 'Bình Dương',
    slug: 'nha-pho', listing_type: 'mua_ban',
    ...overrides,
  } as Property;
}

describe('compare', () => {
  let m: typeof import('./compare');

  beforeEach(async () => {
    installLocalStorage();
    vi.resetModules();
    m = await import('./compare');
  });

  it('toggle thêm rồi bỏ 1 BĐS', () => {
    expect(m.toggleCompare(property({ id: 'a' }))).toEqual({ inList: true, full: false });
    expect(m.isInCompare('a')).toBe(true);
    expect(m.toggleCompare(property({ id: 'a' }))).toEqual({ inList: false, full: false });
    expect(m.isInCompare('a')).toBe(false);
  });

  it('giới hạn tối đa 3 mục, mục thứ 4 báo full', () => {
    m.toggleCompare(property({ id: 'a' }));
    m.toggleCompare(property({ id: 'b' }));
    m.toggleCompare(property({ id: 'c' }));
    expect(m.toggleCompare(property({ id: 'd' }))).toEqual({ inList: false, full: true });
    expect(m.getCompareList()).toHaveLength(3);
  });

  it('setCompareList ghi đè và cắt còn tối đa 3', () => {
    m.setCompareList([property({ id: 'a' }), property({ id: 'b' }), property({ id: 'c' }), property({ id: 'd' })]);
    expect(m.getCompareList().map(p => p.id)).toEqual(['a', 'b', 'c']);
  });

  it('removeFromCompare và clearCompare', () => {
    m.setCompareList([property({ id: 'a' }), property({ id: 'b' })]);
    m.removeFromCompare('a');
    expect(m.getCompareList().map(p => p.id)).toEqual(['b']);
    m.clearCompare();
    expect(m.getCompareList()).toHaveLength(0);
  });
});
