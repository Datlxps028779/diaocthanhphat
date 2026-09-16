import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Property } from './supabase';

// Stub window + localStorage thật (có theo dõi addEventListener) để kiểm tra:
//  - đọc dữ liệu hỏng (không phải mảng / phần tử rác) không làm vỡ app
//  - cùng tab: phát CustomEvent sau khi ghi
//  - tab khác: nghe 'storage' và phát lại CustomEvent nội bộ
function installWindow() {
  const store = new Map<string, string>();
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  const dispatched: string[] = [];

  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };

  const win = {
    localStorage,
    addEventListener: (type: string, fn: (event: unknown) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: (event: unknown) => void) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (event: { type: string; detail?: unknown }) => {
      dispatched.push(event.type);
      for (const fn of listeners.get(event.type) ?? []) fn(event);
      return true;
    },
  };

  vi.stubGlobal('window', win);
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('CustomEvent', class {
    type: string; detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) { this.type = type; this.detail = init?.detail; }
  });

  return {
    store,
    dispatched,
    emit: (type: string, event: unknown) => { for (const fn of listeners.get(type) ?? []) fn(event); },
    listenerCount: (type: string) => listeners.get(type)?.size ?? 0,
  };
}

function property(overrides: Partial<Property> = {}): Property {
  return {
    id: 'p1', title: 'Nhà phố', price: 3, price_unit: 'tỷ', price_label: null,
    image_url: null, area_sqm: 80, district: 'Dĩ An', city: 'Bình Dương',
    slug: 'nha-pho', listing_type: 'mua_ban',
    ...overrides,
  } as Property;
}

type Mod = typeof import('./recentlyViewed');

async function load(): Promise<Mod> {
  vi.resetModules();
  return import('./recentlyViewed');
}

describe('recentlyViewed — dữ liệu hỏng', () => {
  let env: ReturnType<typeof installWindow>;
  beforeEach(() => { env = installWindow(); });

  it('trả về [] khi JSON không parse được', async () => {
    env.store.set('dtp_recently_viewed', '{khong-phai-json');
    const mod = await load();
    expect(mod.getRecentlyViewed()).toEqual([]);
  });

  it('trả về [] khi giá trị là object thay vì mảng', async () => {
    env.store.set('dtp_recently_viewed', JSON.stringify({ id: 'a', title: 'x' }));
    const mod = await load();
    expect(mod.getRecentlyViewed()).toEqual([]);
  });

  it('bỏ phần tử rác nhưng giữ phần tử hợp lệ', async () => {
    env.store.set('dtp_recently_viewed', JSON.stringify([
      null, 42, 'chuỗi', [], { title: 'thiếu id' }, { id: 'ok', title: 'Nhà phố', price: 3, price_unit: 'tỷ', city: 'Bình Dương' },
    ]));
    const mod = await load();
    expect(mod.getRecentlyViewed().map(p => p.id)).toEqual(['ok']);
  });

  it('prune trên dữ liệu hỏng không ném lỗi', async () => {
    env.store.set('dtp_recently_viewed', 'null');
    const mod = await load();
    expect(mod.pruneRecentlyViewed(['a'])).toEqual([]);
  });
});

describe('recentlyViewed — sự kiện đồng bộ', () => {
  let env: ReturnType<typeof installWindow>;
  beforeEach(() => { env = installWindow(); });

  it('record phát CustomEvent cùng tab', async () => {
    const mod = await load();
    mod.recordRecentlyViewed(property({ id: 'a' }));
    expect(env.dispatched).toContain(mod.RECENTLY_VIEWED_CHANGED_EVENT);
  });

  it('subscribe nhận thay đổi cùng tab và unsubscribe sạch', async () => {
    const mod = await load();
    const seen: number[] = [];
    const off = mod.subscribeRecentlyViewedChanged(() => seen.push(1));

    mod.recordRecentlyViewed(property({ id: 'a' }));
    expect(seen).toHaveLength(1);

    off();
    mod.recordRecentlyViewed(property({ id: 'b' }));
    expect(seen).toHaveLength(1);
    expect(env.listenerCount(mod.RECENTLY_VIEWED_CHANGED_EVENT)).toBe(0);
    expect(env.listenerCount('storage')).toBe(0);
  });

  it('thay đổi từ tab khác (storage) được phát lại nội bộ', async () => {
    const mod = await load();
    const seen: number[] = [];
    mod.subscribeRecentlyViewedChanged(() => seen.push(1));

    env.emit('storage', { type: 'storage', key: mod.RECENTLY_VIEWED_STORAGE_KEY, newValue: '[]' });
    expect(seen).toHaveLength(1);
  });

  it('storage của key khác bị bỏ qua', async () => {
    const mod = await load();
    const seen: number[] = [];
    mod.subscribeRecentlyViewedChanged(() => seen.push(1));

    env.emit('storage', { type: 'storage', key: 'key_khac', newValue: '[]' });
    expect(seen).toHaveLength(0);
  });
});
