import { describe, it, expect } from 'vitest';
import { inferTaste, topKey, hasEnoughSignal, scoreCandidate, rankRecommendations, type Signal, type Candidate } from './taste';

const NOW = new Date('2026-07-14T12:00:00Z').getTime();
const DAY = 86_400_000;

const sig = (o: Partial<Signal> = {}): Signal => ({
  kind: 'view', areaId: 'a1', typeId: 't1', listingType: 'mua_ban', price: 3, ts: NOW, ...o,
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
  it('tín hiệu cũ nhẹ hơn tín hiệu mới', () => {
    const p = inferTaste([sig({ areaId: 'new', ts: NOW }), sig({ areaId: 'old', ts: NOW - 28 * DAY })], NOW);
    expect(p.areaWeights['new']).toBeGreaterThan(p.areaWeights['old']);
  });
  it('khoảng giá nới ±15% từ BĐS đã xem', () => {
    const p = inferTaste([sig({ kind: 'view', price: 2 }), sig({ kind: 'view', price: 4 })], NOW);
    expect(p.priceMin).toBeCloseTo(1.7, 5);   // 2 * 0.85
    expect(p.priceMax).toBeCloseTo(4.6, 5);   // 4 * 1.15
  });
  it('search không đặt khoảng giá', () => {
    const p = inferTaste([sig({ kind: 'search', price: null }), sig({ kind: 'search', price: null })], NOW);
    expect(p.priceMin).toBeUndefined();
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
  it('thưởng khi giá trong khoảng ưa thích', () => {
    const p = inferTaste([sig({ kind: 'view', areaId: null, typeId: null, listingType: null, price: 3 }),
                          sig({ kind: 'view', areaId: null, typeId: null, listingType: null, price: 3 })], NOW);
    const inRange = scoreCandidate(cand({ area_id: null, property_type_id: null, listing_type: null, price: 3 }), p);
    const outRange = scoreCandidate(cand({ area_id: null, property_type_id: null, listing_type: null, price: 99 }), p);
    expect(inRange).toBeGreaterThan(outRange);
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
