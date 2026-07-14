import { describe, it, expect } from 'vitest';
import { buildTimeline, originLabel, type TimelineActivity, type TimelineLead } from './leadTimeline';

const lead: TimelineLead = { created_at: '2026-07-01T08:00:00Z', source: 'contact_modal' };
const act = (o: Partial<TimelineActivity>): TimelineActivity => ({
  id: 'a', kind: 'note', body: null, author: null, created_at: '2026-07-02T08:00:00Z', ...o,
});

describe('originLabel', () => {
  it('map nguồn đã biết', () => {
    expect(originLabel('admin_manual')).toBe('Phát sinh từ nhập tay');
    expect(originLabel('property_detail_form')).toBe('Phát sinh từ form trang chi tiết');
  });
  it('nguồn lạ trả nguyên văn', () => {
    expect(originLabel('zalo_ads')).toBe('Phát sinh từ zalo_ads');
  });
  it('không nguồn → nhãn mặc định', () => {
    expect(originLabel(null)).toBe('Phát sinh khách mới');
  });
});

describe('buildTimeline', () => {
  it('chèn mốc created suy ra khi DB chưa có', () => {
    const t = buildTimeline(lead, [act({ id: 'n1' })]);
    expect(t).toHaveLength(2);
    const last = t[t.length - 1];
    expect(last.kind).toBe('created');
    expect(last.synthetic).toBe(true);
    expect(last.created_at).toBe(lead.created_at);
    expect(last.body).toBe('Phát sinh từ popup liên hệ');
  });
  it('KHÔNG chèn khi đã có created thật', () => {
    const t = buildTimeline(lead, [act({ id: 'c', kind: 'created' }), act({ id: 'n1' })]);
    expect(t.filter(a => a.kind === 'created')).toHaveLength(1);
    expect(t.some(a => a.synthetic)).toBe(false);
  });
  it('sắp xếp mới nhất trước', () => {
    const t = buildTimeline(lead, [
      act({ id: 'old', created_at: '2026-07-02T08:00:00Z' }),
      act({ id: 'new', created_at: '2026-07-05T08:00:00Z' }),
    ]);
    expect(t[0].id).toBe('new');
  });
  it('timeline rỗng vẫn có mốc khởi đầu', () => {
    const t = buildTimeline(lead, []);
    expect(t).toHaveLength(1);
    expect(t[0].kind).toBe('created');
    expect(t[0].synthetic).toBe(true);
  });
});
