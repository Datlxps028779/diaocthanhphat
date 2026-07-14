// Logic SLA cho lead (thuần, test được) — dùng ở LeadsTab để tô cảnh báo + sắp xếp.
// Mọi hàm nhận `now` làm tham số để test tất định, không đọc đồng hồ bên trong.

export type SlaLead = {
  status: 'new' | 'contacted' | 'closed';
  created_at: string;
  follow_up_at: string | null;
};

export type SlaState = 'overdue' | 'due_soon' | 'ok' | 'none';

// Lead 'new' quá số giờ này mà chưa liên hệ → coi là quá hạn SLA.
export const SLA_NEW_HOURS = 2;

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}

export function leadSlaState(lead: SlaLead, now: Date): SlaState {
  if (lead.status === 'closed') return 'none';

  const nowMs = now.getTime();

  // Hẹn gọi lại đã tới/quá giờ → quá hạn (bất kể trạng thái).
  if (lead.follow_up_at) {
    const fu = new Date(lead.follow_up_at);
    if (fu.getTime() <= nowMs) return 'overdue';
  }

  // Lead mới để quá lâu chưa liên hệ → quá hạn.
  if (lead.status === 'new') {
    const created = new Date(lead.created_at).getTime();
    if (created + SLA_NEW_HOURS * 3600_000 <= nowMs) return 'overdue';
  }

  // Hẹn gọi trong hôm nay (chưa tới giờ) → cần gọi hôm nay.
  if (lead.follow_up_at) {
    const fu = new Date(lead.follow_up_at);
    if (sameLocalDay(fu, now)) return 'due_soon';
  }

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

// Chia luân phiên danh sách lead cho các nhân viên (round-robin). Rỗng nếu thiếu 1 phía.
export function distributeRoundRobin(
  leadIds: string[],
  staffLabels: string[],
): { id: string; assigned_to: string }[] {
  if (leadIds.length === 0 || staffLabels.length === 0) return [];
  return leadIds.map((id, i) => ({ id, assigned_to: staffLabels[i % staffLabels.length] }));
}
