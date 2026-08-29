import { describe, it, expect } from 'vitest';
import { inferTaste, mergeSignalSources, topKey, hasEnoughSignal, scoreCandidate, rankRecommendations, diversify, normalizeSignalAttrs, signalDedupeKey, type Signal, type Candidate } from './taste';

describe('signal normalization', () => {
  it('tạo dedupe key ổn định cho empty string/null và giá hợp lệ', () => {
    expect(normalizeSignalAttrs({ areaId: '', typeId: null, listingType: 'mua_ban', price: Number.NaN }))
      .toEqual({ areaId: null, typeId: null, listingType: 'mua_ban', price: null });
    expect(signalDedupeKey('search', { areaId: '', listingType: 'mua_ban' }))
      .toBe(signalDedupeKey('search', { areaId: null, listingType: 'mua_ban', price: null }));
  });
});

const NOW = new Date('2026-07-14T12:00:00Z').getTime();
const DAY = 86_400_000;

const sig = (o: Partial<Signal> = {}): Signal => ({
  kind: 'view', areaId: 'a1', typeId: 't1', listingType: 'mua_ban', price: 3, ts: NOW, ...o,
});

describe('mergeSignalSources', () => {
  it('khử đúng một event đã dual-write local và remote', () => {
    const local = [sig({ eventId: 'e1', ts: NOW, areaId: 'a1' })];
    const remote = [
      sig({ eventId: 'e1', ts: NOW + 10, areaId: 'a1' }),
      sig({ eventId: 'e2', ts: NOW + 20, areaId: 'a2' }),
    ];
    const merged = mergeSignalSources(local, remote);
    expect(merged.map(signal => signal.eventId)).toEqual(['e2', 'e1']);
  });

  it('giữ signal legacy không có event id thay vì đoán trùng theo thuộc tính', () => {
    const merged = mergeSignalSources(
      [sig({ eventId: null, ts: NOW })],
      [sig({ eventId: null, ts: NOW + 1 })],
    );
    expect(merged).toHaveLength(2);
  });
});

describe('inferTaste', () => {
  it('gom trọng số khu vực/loại', () => {
    const p = inferTaste([sig({ areaId: 'a1' }), sig({ areaId: 'a1' }), sig({ areaId: 'a2' })], NOW);
    expect(p.areaWeights['a1']).toBeGreaterThan(p.areaWeights['a2']);
    expect(p.sampleSize).toBe(3);
  });
  it('view nặng hơn search', () => {
    const p = inferTaste([sig({ kind: 'view', areaId: 'v' }), sig({ kind: 'search', areaId: 's' })], NOW);
    expect(p.areaWeights['v']).toBeGreaterThan(p.areaWeights['s']);
  });
  it('ý định mạnh hơn nặng hơn: contact > favorite > view > search', () => {
    const p = inferTaste([
      sig({ kind: 'contact', areaId: 'c' }),
      sig({ kind: 'favorite', areaId: 'f' }),
      sig({ kind: 'view', areaId: 'v' }),
      sig({ kind: 'search', areaId: 's' }),
    ], NOW);
    expect(p.areaWeights['c']).toBeGreaterThan(p.areaWeights['f']);
    expect(p.areaWeights['f']).toBeGreaterThan(p.areaWeights['v']);
    expect(p.areaWeights['v']).toBeGreaterThan(p.areaWeights['s']);
  });
  it('không suy khoảng giá khi đơn vị mua bán/cho thuê chưa được chuẩn hóa', () => {
    const p = inferTaste([
      sig({ kind: 'view', price: 2, listingType: 'mua_ban' }),
      sig({ kind: 'contact', price: 8, listingType: 'cho_thue' }),
    ], NOW);
    expect('priceMin' in p).toBe(false);
    expect('priceMax' in p).toBe(false);
  });
  it('tín hiệu cũ nhẹ hơn tín hiệu mới', () => {
    const p = inferTaste([sig({ areaId: 'new', ts: NOW }), sig({ areaId: 'old', ts: NOW - 28 * DAY })], NOW);
    expect(p.areaWeights['new']).toBeGreaterThan(p.areaWeights['old']);
  });
  it('session boost: intent phiên vượt hồ sơ cũ mạnh hơn', () => {
    // "old" tích luỹ 3 view cách đây 2 ngày; "now" chỉ 1 view vừa xong trong phiên.
    const signals = [
      sig({ areaId: 'old', ts: NOW - 2 * DAY }),
      sig({ areaId: 'old', ts: NOW - 2 * DAY }),
      sig({ areaId: 'old', ts: NOW - 2 * DAY }),
      sig({ areaId: 'now', ts: NOW }),
    ];
    const off = inferTaste(signals, NOW);
    expect(off.areaWeights['old']).toBeGreaterThan(off.areaWeights['now']);
    const on = inferTaste(signals, NOW, { sessionWindowMs: 60 * 60 * 1000, sessionBoost: 5 });
    expect(on.areaWeights['now']).toBeGreaterThan(on.areaWeights['old']);
  });
  it('sessionBoost = 1 giữ nguyên trọng số như khi opts tắt', () => {
    const signals = [sig({ areaId: 'a1', ts: NOW }), sig({ areaId: 'a2', ts: NOW - 2 * DAY })];
    const base = inferTaste(signals, NOW);
    const noBoost = inferTaste(signals, NOW, { sessionWindowMs: 60 * 60 * 1000, sessionBoost: 1 });
    expect(noBoost.areaWeights).toEqual(base.areaWeights);
  });
});

describe('topKey', () => {
  it('trả key trọng số cao nhất', () => {
    expect(topKey({ a: 1, b: 5, c: 2 })).toBe('b');
  });
  it('null khi rỗng', () => { expect(topKey({})).toBeNull(); });
});

describe('hasEnoughSignal', () => {
  it('cần >= 2 tín hiệu', () => {
    expect(hasEnoughSignal(inferTaste([sig()], NOW))).toBe(false);
    expect(hasEnoughSignal(inferTaste([sig(), sig()], NOW))).toBe(true);
  });
});

const cand = (o: Partial<Candidate> = {}): Candidate => ({
  id: 'c1', area_id: 'a1', property_type_id: 't1', listing_type: 'mua_ban', price: 3, ...o,
});

describe('scoreCandidate', () => {
  it('cộng điểm khi khớp khu vực/loại', () => {
    const p = inferTaste([sig({ areaId: 'a1', typeId: 't1' }), sig({ areaId: 'a1' })], NOW);
    expect(scoreCandidate(cand({ area_id: 'a1', property_type_id: 't1' }), p)).toBeGreaterThan(0);
    expect(scoreCandidate(cand({ area_id: 'zz', property_type_id: 'zz', listing_type: 'zz', price: 999 }), p)).toBe(0);
  });
  it('không cộng điểm giá khi price personalization đang tắt', () => {
    const p = inferTaste([
      sig({ kind: 'view', areaId: null, typeId: null, listingType: null, price: 3 }),
      sig({ kind: 'view', areaId: null, typeId: null, listingType: null, price: 3 }),
    ], NOW);
    const inRange = scoreCandidate(cand({ area_id: null, property_type_id: null, listing_type: null, price: 3 }), p);
    const outRange = scoreCandidate(cand({ area_id: null, property_type_id: null, listing_type: null, price: 99 }), p);
    expect(inRange).toBe(0);
    expect(outRange).toBe(0);
  });
});

describe('rankRecommendations', () => {
  const profile = inferTaste([sig({ areaId: 'a1', typeId: 't1' }), sig({ areaId: 'a1', typeId: 't1' })], NOW);
  it('xếp hạng theo điểm, loại không liên quan', () => {
    const cands = [
      cand({ id: 'match', area_id: 'a1', property_type_id: 't1' }),
      cand({ id: 'nope', area_id: 'zz', property_type_id: 'zz', listing_type: 'zz', price: 999 }),
    ];
    const r = rankRecommendations(cands, profile);
    expect(r.map(c => c.id)).toEqual(['match']);
  });
  it('loại excludeIds + giới hạn limit', () => {
    const cands = [cand({ id: 'a' }), cand({ id: 'b' }), cand({ id: 'c' })];
    const r = rankRecommendations(cands, profile, { limit: 1, excludeIds: ['a'] });
    expect(r).toHaveLength(1);
    expect(r[0].id).toBe('b');
  });
});

describe('diversify', () => {
  const item = (id: string, area: string | null) => ({ id, area });
  it('chặn 1 nhóm chiếm quá maxPerKey nhưng vẫn đủ limit (backfill)', () => {
    const items = [
      item('a1', 'A'), item('a2', 'A'), item('a3', 'A'), item('a4', 'A'),
      item('b1', 'B'), item('c1', 'C'),
    ];
    const r = diversify(items, x => x.area, { maxPerKey: 2, limit: 4 });
    expect(r).toHaveLength(4);
    // Tối đa 2 tin khu vực A trước khi nhận B/C.
    expect(r.slice(0, 4).filter(x => x.area === 'A').length).toBeLessThanOrEqual(2);
    expect(r.map(x => x.id)).toEqual(['a1', 'a2', 'b1', 'c1']);
  });
  it('backfill khi không đủ nhóm khác để đạt limit', () => {
    const items = [item('a1', 'A'), item('a2', 'A'), item('a3', 'A'), item('a4', 'A')];
    const r = diversify(items, x => x.area, { maxPerKey: 2, limit: 4 });
    expect(r).toHaveLength(4);
    expect(r.map(x => x.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
  });
  it('key null không bị giới hạn', () => {
    const items = [item('n1', null), item('n2', null), item('n3', null)];
    const r = diversify(items, x => x.area, { maxPerKey: 1, limit: 3 });
    expect(r).toHaveLength(3);
  });
});
