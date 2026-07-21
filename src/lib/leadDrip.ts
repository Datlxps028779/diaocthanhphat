import { isTerminal, type StageKey } from './leadPipeline';

export type DripChannel = 'zalo' | 'sms' | 'email';

export interface DripStepConfig {
  id: string;
  delay_days: number;
  channel: DripChannel;
  message_template: string;
  enabled: boolean;
  sort_order: number;
}

export interface NurtureFilterConfig {
  eligible_statuses: StageKey[];
  require_phone: boolean;
}

export const DRIP_CHANNELS: { value: DripChannel; label: string; ready: boolean }[] = [
  { value: 'zalo', label: 'Zalo OA', ready: true },
  { value: 'sms', label: 'SMS', ready: false },
  { value: 'email', label: 'Email', ready: false },
];

export function channelLabel(channel: DripChannel): string {
  return DRIP_CHANNELS.find(c => c.value === channel)?.label ?? channel;
}

export function channelReady(channel: DripChannel): boolean {
  return DRIP_CHANNELS.find(c => c.value === channel)?.ready ?? false;
}

export interface DripLead {
  status: StageKey;
  created_at: string;
  follow_up_at?: string | null;
  last_activity_at?: string | null;
  phone?: string | null;
  full_name?: string | null;
  area_interest?: string | null;
  budget?: string | null;
  message?: string | null;
  note?: string | null;
}

// Chọn bước drip kế tiếp cho lead theo config động + luật lọc admin.
export function pickDripStep(
  lead: DripLead,
  sentStepIds: string[],
  now: Date,
  steps: DripStepConfig[],
  filter: NurtureFilterConfig,
): DripStepConfig | null {
  if (isTerminal(lead.status)) return null;
  if (!filter.eligible_statuses.includes(lead.status)) return null;
  if (filter.require_phone && !lead.phone?.trim()) return null;
  if (lead.follow_up_at && new Date(lead.follow_up_at).getTime() > now.getTime()) return null;

  const basis = lead.last_activity_at ?? lead.created_at;
  const ageDays = Math.floor((now.getTime() - new Date(basis).getTime()) / 86_400_000);
  if (ageDays < 0) return null;

  const sent = new Set(sentStepIds);
  const ordered = [...steps]
    .filter(s => s.enabled)
    .sort((a, b) => a.sort_order - b.sort_order || a.delay_days - b.delay_days);
  return ordered.find(step => ageDays >= step.delay_days && !sent.has(step.id)) ?? null;
}

export interface TemplateVar {
  token: string;
  label: string;
  sample: string;
  fallback: string;
}

// Biến chèn được trong nội dung tin. `token` khớp cột trong `leads`, `fallback`
// dùng khi lead thiếu dữ liệu — nội dung phải luôn đọc trôi chảy.
export const TEMPLATE_VARS: TemplateVar[] = [
  { token: '{ten}', label: 'Tên khách', sample: 'Chị Lan', fallback: 'Anh/Chị' },
  { token: '{khu_vuc}', label: 'Khu vực quan tâm', sample: 'Thuận An', fallback: 'khu vực bạn quan tâm' },
  { token: '{ngan_sach}', label: 'Ngân sách', sample: '2-3 tỷ', fallback: 'ngân sách của mình' },
  { token: '{nhu_cau}', label: 'Nhu cầu', sample: 'nhà phố 3 phòng ngủ', fallback: 'nhu cầu BĐS' },
];

type TemplateSource = Pick<DripLead, 'full_name' | 'area_interest' | 'budget' | 'message' | 'note'>;

// Thay biến {…} bằng dữ liệu lead (cùng logic với Edge Function để preview khớp bản gửi thật).
export function renderDripMessage(template: string, lead: TemplateSource): string {
  const values: Record<string, string> = {
    '{ten}': lead.full_name?.trim() || 'Anh/Chị',
    '{khu_vuc}': lead.area_interest?.trim() || 'khu vực bạn quan tâm',
    '{ngan_sach}': lead.budget?.trim() || 'ngân sách của mình',
    '{nhu_cau}': lead.message?.trim() || lead.note?.trim() || 'nhu cầu BĐS',
  };
  return template.replace(/\{ten\}|\{khu_vuc\}|\{ngan_sach\}|\{nhu_cau\}/g, m => values[m] ?? m);
}

export const SAMPLE_LEAD: TemplateSource = {
  full_name: 'Chị Lan',
  area_interest: 'Thuận An',
  budget: '2-3 tỷ',
  message: 'nhà phố 3 phòng ngủ',
  note: null,
};

export interface DripStepValidation {
  ok: boolean;
  error?: string;
  warnings: string[];
}

const KNOWN_TOKENS = new Set(TEMPLATE_VARS.map(v => v.token));

export function validateDripStep(step: Pick<DripStepConfig, 'delay_days' | 'message_template'>): DripStepValidation {
  const warnings: string[] = [];
  if (!Number.isFinite(step.delay_days) || step.delay_days < 0) {
    return { ok: false, error: 'Số ngày phải là số ≥ 0.', warnings };
  }
  if (!step.message_template.trim()) {
    return { ok: false, error: 'Nội dung tin không được để trống.', warnings };
  }
  const used = step.message_template.match(/\{[a-z_]+\}/g) ?? [];
  const unknown = [...new Set(used)].filter(t => !KNOWN_TOKENS.has(t));
  if (unknown.length > 0) {
    warnings.push(`Biến không nhận diện được sẽ giữ nguyên: ${unknown.join(', ')}`);
  }
  return { ok: true, warnings };
}

export type DripStatus = 'sent' | 'skipped' | 'failed';
export type DripStatusTone = 'green' | 'amber' | 'red';

export function stepLabelFromDays(delayDays: number): string {
  return `Nhắc sau ${delayDays} ngày`;
}

// Map id bước → nhãn. Rows lịch sử ('d1/d3/d7' hoặc id đã xoá) không map được thì hiện raw.
export function dripStepLabel(stepId: string, steps: DripStepConfig[]): string {
  const found = steps.find(s => s.id === stepId);
  if (found) return stepLabelFromDays(found.delay_days);
  if (stepId === 'd1') return 'Nhắc sau 1 ngày';
  if (stepId === 'd3') return 'Nhắc sau 3 ngày';
  if (stepId === 'd7') return 'Nhắc sau 7 ngày';
  return stepId;
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

export const NURTURE_DEPLOY_COMMAND = 'supabase functions deploy nurture-drip';

export const NURTURE_SECRET_KEYS = ['NURTURE_DRIP_SECRET', 'ZALO_OA_TOKEN'] as const;

export function parseSupabaseRef(endpoint?: string | null): string | null {
  const url = endpoint?.trim();
  if (!url) return null;
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co(?:\/|$)/i.exec(url);
  return match ? match[1].toLowerCase() : null;
}

export function supabaseSecretsUrl(endpoint?: string | null): string | null {
  const ref = parseSupabaseRef(endpoint);
  return ref ? `https://supabase.com/dashboard/project/${ref}/settings/functions` : null;
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
