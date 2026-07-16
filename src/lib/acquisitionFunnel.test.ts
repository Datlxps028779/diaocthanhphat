import { describe, it, expect } from 'vitest';
import { acquisitionFunnel, type AcquisitionChatSession } from './acquisitionFunnel';
import type { Lead } from './supabase';

const session = (o: Partial<AcquisitionChatSession>): AcquisitionChatSession => ({
  id: 's', visitor_phone: null, wants_staff: false, lead_id: null, created_at: '2026-07-16T00:00:00Z', ...o,
});
const lead = (id: string, status: Lead['status']): Pick<Lead, 'id' | 'status' | 'source'> => ({ id, status, source: 'ai_advisor' });

describe('acquisitionFunnel', () => {
  it('đếm đúng phễu chat → contact → lead → won', () => {
    const report = acquisitionFunnel([
      session({ id: 's1' }),
      session({ id: 's2', visitor_phone: '0909', lead_id: 'l1' }),
      session({ id: 's3', wants_staff: true }),
      session({ id: 's4', visitor_phone: '0911', lead_id: 'l2' }),
    ], [lead('l1', 'new'), lead('l2', 'won')]);
    expect(report.totals).toEqual({ opened: 4, contactIntent: 3, leads: 2, won: 1 });
    expect(report.steps.map(s => [s.key, s.count, s.pctOfPrevious, s.pctOfOpened])).toEqual([
      ['chat_opened', 4, 100, 100],
      ['contact_intent', 3, 75, 75],
      ['lead_created', 2, 67, 50],
      ['won', 1, 50, 25],
    ]);
  });

  it('không crash khi rỗng', () => {
    const report = acquisitionFunnel([], []);
    expect(report.totals).toEqual({ opened: 0, contactIntent: 0, leads: 0, won: 0 });
    expect(report.steps.every(s => s.pctOfPrevious === 0 && s.pctOfOpened === 0)).toBe(true);
  });

  it('lead_id không join được lead thì chưa tính thành lead', () => {
    const report = acquisitionFunnel([session({ id: 's1', visitor_phone: '0909', lead_id: 'missing' })], []);
    expect(report.totals).toEqual({ opened: 1, contactIntent: 1, leads: 0, won: 0 });
  });
});
