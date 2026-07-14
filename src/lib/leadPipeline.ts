// Pipeline chăm sóc lead (thuần, test được) — dùng ở LeadsTab + LeadDetailDrawer.
// 6 giai đoạn BĐS: new→contacted→nurturing→viewing→negotiating rồi terminal won/lost.

export type StageKey = 'new' | 'contacted' | 'nurturing' | 'viewing' | 'negotiating' | 'won' | 'lost';
export type StageType = 'open' | 'won' | 'lost';

export interface Stage {
  key: StageKey;
  label: string;
  color: string;   // class Tailwind cho badge (nền + chữ)
  dot: string;     // class chấm màu
  type: StageType;
}

export const PIPELINE_STAGES: Stage[] = [
  { key: 'new',         label: 'Mới',          color: 'bg-blue-100 text-blue-700',       dot: 'bg-blue-500',    type: 'open' },
  { key: 'contacted',   label: 'Đã liên hệ',   color: 'bg-cyan-100 text-cyan-700',       dot: 'bg-cyan-500',    type: 'open' },
  { key: 'nurturing',   label: 'Đang chăm sóc', color: 'bg-violet-100 text-violet-700',  dot: 'bg-violet-500',  type: 'open' },
  { key: 'viewing',     label: 'Hẹn xem',      color: 'bg-amber-100 text-amber-700',     dot: 'bg-amber-500',   type: 'open' },
  { key: 'negotiating', label: 'Đàm phán',     color: 'bg-orange-100 text-orange-700',   dot: 'bg-orange-500',  type: 'open' },
  { key: 'won',         label: 'Chốt',         color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500', type: 'won' },
  { key: 'lost',        label: 'Mất',          color: 'bg-gray-200 text-gray-600',       dot: 'bg-gray-400',    type: 'lost' },
];

const BY_KEY = new Map(PIPELINE_STAGES.map(s => [s.key, s]));

// Fallback về 'new' cho giá trị lạ (dữ liệu cũ / sai) — luôn trả metadata hợp lệ.
export function stageMeta(key: StageKey): Stage {
  return BY_KEY.get(key) ?? PIPELINE_STAGES[0];
}

export function isTerminal(key: StageKey): boolean {
  return stageMeta(key).type !== 'open';
}

// Vị trí theo thứ tự phễu; -1 nếu key không hợp lệ.
export function stageIndex(key: StageKey): number {
  return PIPELINE_STAGES.findIndex(s => s.key === key);
}

// Đếm số lead ở từng giai đoạn — luôn trả đủ 7 key (kể cả 0).
export function funnelCounts(leads: { status: string }[]): Record<StageKey, number> {
  const counts = Object.fromEntries(PIPELINE_STAGES.map(s => [s.key, 0])) as Record<StageKey, number>;
  for (const l of leads) {
    if (l.status in counts) counts[l.status as StageKey] += 1;
  }
  return counts;
}
