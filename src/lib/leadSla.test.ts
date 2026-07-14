import { describe, it, expect } from 'vitest';
import {
  SLA_NEW_HOURS, leadSlaState, slaLabel, sortLeadsByUrgency, distributeRoundRobin,
  type SlaLead,
} from './leadSla';

// Dùng constructor theo thành phần local để so-sánh-cùng-ngày không lệ thuộc múi giờ máy chạy test.
const at = (y: number, mo: number, d: number, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi, 0);
const iso = (dt: Date) => dt.toISOString();

const mk = (o: Partial<SlaLead> & { created_at: string }): SlaLead => ({
  status: 'new', follow_up_at: null, ...o,
});

describe('leadSla — trạng thái SLA + sắp xếp + chia đều lead', () => {
  const NOW = at(2026, 7, 14, 12, 0); // 14/07/2026 12:00 local

  describe('leadSlaState', () => {
    it('lead new quá SLA_NEW_HOURS chưa liên hệ → overdue', () => {
      expect(SLA_NEW_HOURS).toBe(2);
      const old = mk({ created_at: iso(at(2026, 7, 14, 9, 0)) }); // 3h trước
      expect(leadSlaState(old, NOW)).toBe('overdue');
    });

    it('lead new còn trong hạn (dưới SLA) → ok', () => {
      const fresh = mk({ created_at: iso(at(2026, 7, 14, 11, 0)) }); // 1h trước
      expect(leadSlaState(fresh, NOW)).toBe('ok');
    });

    it('đúng mốc SLA (>=) → overdue', () => {
      const edge = mk({ created_at: iso(at(2026, 7, 14, 10, 0)) }); // đúng 2h
      expect(leadSlaState(edge, NOW)).toBe('overdue');
    });

    it('follow_up_at đã tới/quá → overdue kể cả khi status không phải new', () => {
      const past = mk({ status: 'contacted', created_at: iso(at(2026, 7, 10, 0, 0)), follow_up_at: iso(at(2026, 7, 14, 11, 0)) });
      expect(leadSlaState(past, NOW)).toBe('overdue');
    });

    it('follow_up_at trong hôm nay nhưng chưa tới giờ → due_soon', () => {
      const later = mk({ status: 'contacted', created_at: iso(at(2026, 7, 10, 0, 0)), follow_up_at: iso(at(2026, 7, 14, 18, 0)) });
      expect(leadSlaState(later, NOW)).toBe('due_soon');
    });

    it('follow_up_at ngày mai → ok (chưa cần gọi hôm nay)', () => {
      const tomorrow = mk({ status: 'contacted', created_at: iso(at(2026, 7, 10, 0, 0)), follow_up_at: iso(at(2026, 7, 15, 9, 0)) });
      expect(leadSlaState(tomorrow, NOW)).toBe('ok');
    });

    it('lead đã đóng (closed) → none dù cũ', () => {
      const closed = mk({ status: 'closed', created_at: iso(at(2026, 7, 1, 0, 0)) });
      expect(leadSlaState(closed, NOW)).toBe('none');
    });

    it('contacted không có follow_up, không phải new → ok (không bị SLA new)', () => {
      const contacted = mk({ status: 'contacted', created_at: iso(at(2026, 7, 1, 0, 0)) });
      expect(leadSlaState(contacted, NOW)).toBe('ok');
    });
  });

  describe('slaLabel', () => {
    it('nhãn tiếng Việt cho từng trạng thái', () => {
      expect(slaLabel('overdue')).toBe('Quá hạn');
      expect(slaLabel('due_soon')).toBe('Cần gọi hôm nay');
      expect(slaLabel('ok')).toBe('');
      expect(slaLabel('none')).toBe('');
    });
  });

  describe('sortLeadsByUrgency', () => {
    it('overdue lên đầu, rồi due_soon, rồi theo created_at desc', () => {
      const overdue = mk({ id: 'overdue', created_at: iso(at(2026, 7, 14, 8, 0)) } as never);
      const dueSoon = mk({ id: 'due', status: 'contacted', created_at: iso(at(2026, 7, 10, 0, 0)), follow_up_at: iso(at(2026, 7, 14, 18, 0)) } as never);
      const okNew = mk({ id: 'ok_new', created_at: iso(at(2026, 7, 14, 11, 30)) } as never);
      const okOld = mk({ id: 'ok_old', status: 'contacted', created_at: iso(at(2026, 7, 12, 0, 0)) } as never);
      const input = [okOld, dueSoon, okNew, overdue];
      const out = sortLeadsByUrgency(input, NOW) as (SlaLead & { id: string })[];
      expect(out.map(l => l.id)).toEqual(['overdue', 'due', 'ok_new', 'ok_old']);
    });

    it('không đột biến mảng gốc', () => {
      const a = mk({ id: 'a', created_at: iso(at(2026, 7, 14, 11, 0)) } as never);
      const b = mk({ id: 'b', created_at: iso(at(2026, 7, 14, 8, 0)) } as never);
      const input = [a, b];
      sortLeadsByUrgency(input, NOW);
      expect(input[0]).toBe(a); // vẫn nguyên thứ tự cũ
    });
  });

  describe('distributeRoundRobin', () => {
    it('chia luân phiên id cho staff theo vòng', () => {
      const out = distributeRoundRobin(['l1', 'l2', 'l3', 'l4'], ['A', 'B']);
      expect(out).toEqual([
        { id: 'l1', assigned_to: 'A' },
        { id: 'l2', assigned_to: 'B' },
        { id: 'l3', assigned_to: 'A' },
        { id: 'l4', assigned_to: 'B' },
      ]);
    });

    it('số dư lẻ: staff đầu nhận nhiều hơn 1', () => {
      const out = distributeRoundRobin(['l1', 'l2', 'l3'], ['A', 'B']);
      expect(out.filter(x => x.assigned_to === 'A').length).toBe(2);
      expect(out.filter(x => x.assigned_to === 'B').length).toBe(1);
    });

    it('không có staff hoặc không có lead → rỗng', () => {
      expect(distributeRoundRobin([], ['A'])).toEqual([]);
      expect(distributeRoundRobin(['l1'], [])).toEqual([]);
    });
  });
});
