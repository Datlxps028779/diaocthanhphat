import { describe, it, expect, beforeEach, vi } from 'vitest';

const KEY = 'dtp_taste_signals';

// tasteStore là tầng I/O localStorage cho engine taste.ts. Test hành vi ghi/đọc,
// khử tín hiệu rỗng, giới hạn số tín hiệu, và an toàn khi localStorage lỗi.
// Stub window/localStorage trước khi import module (module đọc window ở guard top-level).
function installLocalStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
  };
  vi.stubGlobal('window', { localStorage });
  vi.stubGlobal('localStorage', localStorage);
  return store;
}

describe('tasteStore', () => {
  let getSignals: typeof import('./tasteStore').getSignals;
  let recordSignal: typeof import('./tasteStore').recordSignal;
  let store: Map<string, string>;

  beforeEach(async () => {
    store = installLocalStorage();
    vi.resetModules();
    const mod = await import('./tasteStore');
    getSignals = mod.getSignals;
    recordSignal = mod.recordSignal;
  });

  it('recordSignal ghi tín hiệu có thuộc tính, đọc lại được', () => {
    recordSignal('view', { areaId: 'a1', typeId: null, listingType: 'mua_ban', price: 3 });
    const signals = getSignals();
    expect(signals).toHaveLength(1);
    expect(signals[0].kind).toBe('view');
    expect(signals[0].areaId).toBe('a1');
    expect(signals[0].listingType).toBe('mua_ban');
    expect(signals[0].price).toBe(3);
    expect(typeof signals[0].ts).toBe('number');
  });

  it('bỏ qua tín hiệu rỗng (không mang thuộc tính suy sở thích)', () => {
    recordSignal('search', { areaId: null, typeId: null, listingType: null, price: null });
    expect(getSignals()).toHaveLength(0);
    // price <= 0 cũng coi là rỗng
    recordSignal('view', { price: 0 });
    expect(getSignals()).toHaveLength(0);
  });

  it('tín hiệu mới đưa lên đầu danh sách', () => {
    recordSignal('view', { areaId: 'a1' });
    recordSignal('view', { areaId: 'a2' });
    const signals = getSignals();
    expect(signals[0].areaId).toBe('a2');
    expect(signals[1].areaId).toBe('a1');
  });

  it('giới hạn tối đa 60 tín hiệu (cắt phần cũ nhất)', () => {
    for (let i = 0; i < 70; i++) recordSignal('view', { areaId: `a${i}` });
    const signals = getSignals();
    expect(signals).toHaveLength(60);
    // tín hiệu mới nhất (a69) ở đầu, các tín hiệu cũ nhất (a0..a9) đã bị cắt
    expect(signals[0].areaId).toBe('a69');
    expect(signals.some(s => s.areaId === 'a0')).toBe(false);
  });

  it('localStorage chứa JSON hỏng → getSignals trả [] không throw', () => {
    store.set(KEY, '{not valid json');
    expect(() => getSignals()).not.toThrow();
    expect(getSignals()).toEqual([]);
  });
});
