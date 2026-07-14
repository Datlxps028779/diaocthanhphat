import { describe, it, expect } from 'vitest';
import { funnelReport, conversionRate, staffPerformance, leadsInLastDays, type AnalyticsLead } from './leadAnalytics';
import type { StageKey } from './leadPipeline';

const mk = (status: StageKey, assigned_to: string | null = null, created_at = '2026-07-10T08:00:00Z'): AnalyticsLead =>
  ({ status, assigned_to, created_at });

describe('funnelReport', () => {
  it('đếm đủ 7 giai đoạn kể cả 0', () => {
    const r = funnelReport([mk('new'), mk('new'), mk('won')]);
    expect(r).toHaveLength(7);
    expect(r.find(x => x.key === 'new')?.count).toBe(2);
    expect(r.find(x => x.key === 'won')?.count).toBe(1);
    expect(r.find(x => x.key === 'lost')?.count).toBe(0);
  });
  it('tính % trên tổng', () => {
    const r = funnelReport([mk('new'), mk('new'), mk('contacted'), mk('won')]);
    expect(r.find(x => x.key === 'new')?.pct).toBe(50);
    expect(r.find(x => x.key === 'won')?.pct).toBe(25);
  });
  it('rỗng → tất cả 0, không chia 0', () => {
    const r = funnelReport([]);
    expect(r.every(x => x.count === 0 && x.pct === 0)).toBe(true);
  });
});

describe('conversionRate', () => {
  it('won / (won+lost)', () => {
    expect(conversionRate([mk('won'), mk('won'), mk('lost'), mk('new')])).toBe(67);
  });
  it('0 khi chưa có lead kết thúc', () => {
    expect(conversionRate([mk('new'), mk('contacted')])).toBe(0);
  });
});

describe('staffPerformance', () => {
  it('gộp theo NV + gộp chưa gán', () => {
    const rows = staffPerformance([
      mk('won', 'An'), mk('lost', 'An'), mk('new', 'An'),
      mk('won', 'Bình'),
      mk('new', null),
    ]);
    const an = rows.find(r => r.name === 'An')!;
    expect(an.total).toBe(3);
    expect(an.won).toBe(1);
    expect(an.open).toBe(1);
    expect(an.winRate).toBe(50);
    expect(rows.find(r => r.name === 'Chưa gán')?.total).toBe(1);
  });
  it('sắp xếp nhiều chốt trước', () => {
    const rows = staffPerformance([mk('won', 'A'), mk('won', 'B'), mk('won', 'B')]);
    expect(rows[0].name).toBe('B');
  });
});

describe('leadsInLastDays', () => {
  const now = new Date('2026-07-14T12:00:00Z');
  it('đếm lead trong cửa sổ ngày', () => {
    const leads = [
      mk('new', null, '2026-07-14T08:00:00Z'),  // hôm nay
      mk('new', null, '2026-07-10T08:00:00Z'),  // 4 ngày trước
      mk('new', null, '2026-06-01T08:00:00Z'),  // ngoài 7 ngày
    ];
    expect(leadsInLastDays(leads, 7, now)).toBe(2);
    expect(leadsInLastDays(leads, 1, now)).toBe(1);
  });
});
