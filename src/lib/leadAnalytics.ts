// Phân tích phễu CRM (thuần, test được) — dùng ở FunnelReport trên LeadsTab.
// Nhận danh sách lead đã tải sẵn, KHÔNG fetch thêm.

import { PIPELINE_STAGES, isTerminal, type StageKey } from './leadPipeline';
import { memberLabel, type TeamMember } from './leadAssignment';

export interface AnalyticsLead {
  status: StageKey;
  assignee_ids: string[];   // user_id các NV cùng phụ trách (rỗng = chưa gán)
  created_at: string;
}

export interface FunnelRow {
  key: StageKey;
  label: string;
  count: number;
  pct: number;   // % so với tổng lead (làm tròn)
}

// Đếm lead theo từng giai đoạn (đủ 7 key) + % trên tổng. Giữ thứ tự phễu.
export function funnelReport(leads: AnalyticsLead[]): FunnelRow[] {
  const total = leads.length;
  const counts = new Map<StageKey, number>(PIPELINE_STAGES.map(s => [s.key, 0]));
  for (const l of leads) {
    if (counts.has(l.status)) counts.set(l.status, (counts.get(l.status) ?? 0) + 1);
  }
  return PIPELINE_STAGES.map(s => {
    const count = counts.get(s.key) ?? 0;
    return { key: s.key, label: s.label, count, pct: total > 0 ? Math.round((count / total) * 100) : 0 };
  });
}

// Tỉ lệ chốt = won / (won + lost). Trả 0 khi chưa có lead kết thúc (tránh chia 0).
export function conversionRate(leads: AnalyticsLead[]): number {
  const won = leads.filter(l => l.status === 'won').length;
  const lost = leads.filter(l => l.status === 'lost').length;
  const closed = won + lost;
  return closed > 0 ? Math.round((won / closed) * 100) : 0;
}

export interface StaffPerformance {
  name: string;
  total: number;      // tổng lead được gán
  won: number;        // số chốt
  open: number;       // đang xử lý (chưa terminal)
  winRate: number;    // won / (đã kết thúc), %
}

// Hiệu suất theo nhân viên phụ trách. 1 lead có nhiều NV → mỗi (NV,lead) tính 1 lần
// (đồng phụ trách đều được ghi công). Lead không NV nào → gộp nhãn "Chưa gán".
// Tên NV resolve qua roster (user_id → nhãn); id ngoài roster vẫn hiện NV-<id6>.
// Sắp xếp: nhiều chốt trước → tổng lead nhiều trước.
export function staffPerformance(leads: AnalyticsLead[], roster: TeamMember[]): StaffPerformance[] {
  const labelOf = (userId: string): string => {
    const m = roster.find(r => r.id === userId);
    return m ? memberLabel(m) : `NV-${userId.slice(0, 6)}`;
  };
  const byStaff = new Map<string, AnalyticsLead[]>();
  const push = (key: string, l: AnalyticsLead) => {
    if (!byStaff.has(key)) byStaff.set(key, []);
    byStaff.get(key)!.push(l);
  };
  for (const l of leads) {
    if (l.assignee_ids.length === 0) push('Chưa gán', l);
    else for (const uid of l.assignee_ids) push(labelOf(uid), l);
  }
  const rows: StaffPerformance[] = [];
  for (const [name, list] of byStaff) {
    const won = list.filter(l => l.status === 'won').length;
    const lost = list.filter(l => l.status === 'lost').length;
    const open = list.filter(l => !isTerminal(l.status)).length;
    const closed = won + lost;
    rows.push({ name, total: list.length, won, open, winRate: closed > 0 ? Math.round((won / closed) * 100) : 0 });
  }
  return rows.sort((a, b) => (b.won - a.won) || (b.total - a.total));
}

// Đếm lead tạo trong N ngày gần đây (tính theo now truyền vào — test tất định).
export function leadsInLastDays(leads: AnalyticsLead[], days: number, now: Date): number {
  const cutoff = now.getTime() - days * 86_400_000;
  return leads.filter(l => new Date(l.created_at).getTime() >= cutoff).length;
}
