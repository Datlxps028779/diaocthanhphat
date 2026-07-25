// Logic SLA cho lead (thuần, test được) — dùng ở LeadsTab để tô cảnh báo + sắp xếp.
// Mọi hàm nhận `now` làm tham số để test tất định, không đọc đồng hồ bên trong.

import { isTerminal, stageMeta, type StageKey } from './leadPipeline';

export type SlaLead = {
  status: StageKey;
  created_at: string;
  follow_up_at: string | null;
  last_activity_at?: string | null;  // hoạt động gần nhất; thiếu → bỏ qua kiểm nguội
};

export type SlaState = 'overdue' | 'due_soon' | 'ok' | 'none';

// Lead 'new' quá số giờ này mà chưa liên hệ → coi là quá hạn SLA.
export const SLA_NEW_HOURS = 2;

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

// Parse mốc thời gian an toàn: chuỗi rác/sai định dạng → null (không phải Invalid Date).
// Tránh new Date(rác) ra NaN khiến mọi so sánh .getTime() im lặng false → lead quá
// hạn bị chấm nhầm 'ok'. Ngày không đọc được coi như "không biết" và bỏ qua nhánh đó.
function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function leadSlaState(lead: SlaLead, now: Date): SlaState {
  // Lead đã chốt/mất (terminal) → không còn nhắc SLA.
  if (isTerminal(lead.status)) return 'none';

  const nowMs = now.getTime();
  const followUp = parseDate(lead.follow_up_at);

  // Hẹn gọi lại đã tới/quá giờ → quá hạn (bất kể trạng thái).
  if (followUp && followUp.getTime() <= nowMs) return 'overdue';

  // Lead mới để quá lâu chưa liên hệ → quá hạn. created_at rác → coi như quá hạn để
  // không bỏ sót (an toàn hơn im lặng chấm 'ok'), vì lead 'new' phải được liên hệ sớm.
  if (lead.status === 'new') {
    const created = parseDate(lead.created_at);
    if (!created || created.getTime() + SLA_NEW_HOURS * 3600_000 <= nowMs) return 'overdue';
  }

  // Hẹn gọi trong hôm nay (chưa tới giờ) → cần gọi hôm nay.
  if (followUp && sameLocalDay(followUp, now)) return 'due_soon';

  // Lead mở đã lâu không có hoạt động (quá staleDays của giai đoạn) → nguội, cần chăm.
  // Chỉ áp khi biết last_activity_at (nếu không truyền/rác → bỏ qua để giữ tương thích cũ).
  const staleDays = stageMeta(lead.status).staleDays;
  const lastActivity = parseDate(lead.last_activity_at);
  if (staleDays && lastActivity && lastActivity.getTime() + staleDays * 86_400_000 <= nowMs) return 'due_soon';

  return 'ok';
}

export function slaLabel(state: SlaState): string {
  if (state === 'overdue') return 'Quá hạn';
  if (state === 'due_soon') return 'Cần gọi hôm nay';
  return '';
}

const RANK: Record<SlaState, number> = { overdue: 0, due_soon: 1, ok: 2, none: 3 };

// Overdue lên đầu → due_soon → (ok/none) theo created_at mới nhất trước. Không đột biến mảng gốc.
export function sortLeadsByUrgency<T extends SlaLead>(leads: T[], now: Date): T[] {
  return [...leads].sort((a, b) => {
    const r = RANK[leadSlaState(a, now)] - RANK[leadSlaState(b, now)];
    if (r !== 0) return r;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}

// Đếm số lead theo mức khẩn (để hiện chuông nhắc ở header admin, mọi tab đều thấy).
export interface SlaCounts { overdue: number; dueSoon: number; total: number }

export function countSlaStates(leads: SlaLead[], now: Date): SlaCounts {
  let overdue = 0, dueSoon = 0;
  for (const l of leads) {
    const s = leadSlaState(l, now);
    if (s === 'overdue') overdue++;
    else if (s === 'due_soon') dueSoon++;
  }
  return { overdue, dueSoon, total: overdue + dueSoon };
}
