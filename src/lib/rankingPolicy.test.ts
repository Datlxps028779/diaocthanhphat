import { describe, expect, it } from 'vitest';
import {
  RANKING_POLICY_VERSION,
  advisorMatchReasonLabels,
  countAdvisorIntentCriteria,
  normalizeAdvisorMatchReasons,
} from './rankingPolicy';

describe('P5 ranking policy helpers', () => {
  it('uses a stable version for privacy-safe outcome telemetry', () => {
    expect(RANKING_POLICY_VERSION).toBe('p5-2026-09-03');
  });

  it('normalizes known advisor reasons in policy order without duplicates', () => {
    expect(normalizeAdvisorMatchReasons([
      'legal', 'budget', 'location', 'budget', 'unknown', null,
    ])).toEqual(['location', 'budget', 'legal']);
  });

  it('does not expose a near-budget reason when the property is already in budget', () => {
    expect(normalizeAdvisorMatchReasons(['near_budget', 'budget'])).toEqual(['budget']);
  });

  it('maps only truthful deterministic reason labels', () => {
    expect(advisorMatchReasonLabels(['property_type', 'area', 'loan'])).toEqual([
      'Đúng loại BĐS',
      'Phù hợp diện tích',
      'Có hỗ trợ vay',
    ]);
    expect(advisorMatchReasonLabels({ fabricated: true })).toEqual([]);
  });

  it('counts criteria groups without collecting raw queries or identifiers', () => {
    expect(countAdvisorIntentCriteria({
      district: 'Dĩ An',
      ward: 'Tân Đông Hiệp',
      typeId: 'type-1',
      maxPrice: 3,
      minArea: 60,
      maxArea: 90,
      loan: true,
      legal: 'Sổ hồng',
      keyword: 'gần trường học',
    })).toBe(7);
    expect(countAdvisorIntentCriteria({})).toBe(0);
  });
});
