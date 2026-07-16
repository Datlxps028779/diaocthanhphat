import { isTerminal, type StageKey } from './leadPipeline';

export type DripStepKey = 'd1' | 'd3' | 'd7';

export interface DripStep {
  key: DripStepKey;
  delayDays: number;
  label: string;
}

export const DRIP_STEPS: DripStep[] = [
  { key: 'd1', delayDays: 1, label: 'Nhắc sau 1 ngày' },
  { key: 'd3', delayDays: 3, label: 'Nhắc sau 3 ngày' },
  { key: 'd7', delayDays: 7, label: 'Nhắc sau 7 ngày' },
];

export interface DripLead {
  status: StageKey;
  created_at: string;
  follow_up_at?: string | null;
  last_activity_at?: string | null;
  phone?: string | null;
  full_name?: string | null;
}

export function pickDripStep(lead: DripLead, sentSteps: string[], now: Date): DripStep | null {
  if (isTerminal(lead.status)) return null;
  if (!lead.phone?.trim()) return null;
  if (lead.follow_up_at && new Date(lead.follow_up_at).getTime() > now.getTime()) return null;

  const basis = lead.last_activity_at ?? lead.created_at;
  const ageDays = Math.floor((now.getTime() - new Date(basis).getTime()) / 86_400_000);
  if (ageDays < 0) return null;

  const sent = new Set(sentSteps);
  return DRIP_STEPS.find(step => ageDays >= step.delayDays && !sent.has(step.key)) ?? null;
}

export function dripMessage(step: DripStep, lead: Pick<DripLead, 'full_name'>): string {
  const name = lead.full_name?.trim() || 'Anh/Chị';
  if (step.key === 'd1') {
    return `${name} ơi, Dia Oc Thanh Phat vẫn đang giữ thông tin nhu cầu BĐS của mình. Nếu cần xem thêm lựa chọn phù hợp, đội ngũ tư vấn sẵn sàng hỗ trợ.`;
  }
  if (step.key === 'd3') {
    return `${name} ơi, thị trường Bình Dương có thêm nhiều lựa chọn mới theo nhu cầu của mình. Trả lời tin nhắn này nếu mình muốn được lọc nhanh các căn phù hợp.`;
  }
  return `${name} ơi, nếu kế hoạch mua/thuê BĐS vẫn còn, Dia Oc Thanh Phat có thể rà lại ngân sách, pháp lý và khu vực phù hợp để mình không mất thời gian xem sai căn.`;
}

export type DripStatus = 'sent' | 'skipped' | 'failed';
export type DripStatusTone = 'green' | 'amber' | 'red';

export function dripStepLabel(step: DripStepKey): string {
  return DRIP_STEPS.find(s => s.key === step)?.label ?? step;
}

export function dripStatusLabel(status: DripStatus): string {
  if (status === 'sent') return 'Đã gửi';
  if (status === 'skipped') return 'Bỏ qua';
  return 'Lỗi';
}

export function dripStatusTone(status: DripStatus): DripStatusTone {
  if (status === 'sent') return 'green';
  if (status === 'skipped') return 'amber';
  return 'red';
}

export interface NurtureConfigInput {
  enabled: boolean;
  endpoint?: string | null;
  secret?: string | null;
}

export interface ValidatedNurtureConfig {
  enabled: boolean;
  endpoint: string | null;
  secret: string | null;
}

export function validateNurtureConfig(input: NurtureConfigInput): { ok: true; value: ValidatedNurtureConfig } | { ok: false; error: string } {
  const endpoint = input.endpoint?.trim() || '';
  const secret = input.secret?.trim() || '';
  if (input.enabled) {
    if (!endpoint) return { ok: false, error: 'Cần nhập endpoint Edge Function trước khi bật drip.' };
    if (!secret) return { ok: false, error: 'Cần nhập NURTURE_DRIP_SECRET trước khi bật drip.' };
  }
  if (endpoint && !endpoint.startsWith('https://')) return { ok: false, error: 'Endpoint phải bắt đầu bằng https://.' };
  return { ok: true, value: { enabled: input.enabled, endpoint: endpoint || null, secret: secret || null } };
}

export interface DripLogCounts {
  sent: number;
  skipped: number;
  failed: number;
  total: number;
}

export function summarizeDripLogs(logs: { status: DripStatus }[]): DripLogCounts {
  const counts: DripLogCounts = { sent: 0, skipped: 0, failed: 0, total: logs.length };
  for (const l of logs) counts[l.status]++;
  return counts;
}
