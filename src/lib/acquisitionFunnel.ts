import type { Lead } from './supabase';

export interface AcquisitionChatSession {
  id: string;
  visitor_phone: string | null;
  wants_staff?: boolean | null;
  lead_id: string | null;
  created_at: string;
}

export interface FunnelStep {
  key: 'chat_opened' | 'contact_intent' | 'lead_created' | 'won';
  label: string;
  count: number;
  pctOfPrevious: number;
  pctOfOpened: number;
}

export interface AcquisitionFunnelReport {
  steps: FunnelStep[];
  totals: {
    opened: number;
    contactIntent: number;
    leads: number;
    won: number;
  };
}

function pct(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function acquisitionFunnel(sessions: AcquisitionChatSession[], leads: Pick<Lead, 'id' | 'status' | 'source'>[]): AcquisitionFunnelReport {
  const opened = sessions.length;
  const contactIntent = sessions.filter(s => !!s.visitor_phone?.trim() || s.wants_staff === true).length;
  const leadIds = new Set(sessions.map(s => s.lead_id).filter((id): id is string => !!id));
  const leadById = new Map(leads.map(l => [l.id, l]));
  const leadsCreated = [...leadIds].filter(id => leadById.has(id)).length;
  const won = [...leadIds].filter(id => leadById.get(id)?.status === 'won').length;
  const specs: { key: FunnelStep['key']; label: string; count: number; prev: number }[] = [
    { key: 'chat_opened', label: 'Mở chat', count: opened, prev: opened },
    { key: 'contact_intent', label: 'Để SĐT / gặp NV', count: contactIntent, prev: opened },
    { key: 'lead_created', label: 'Thành lead', count: leadsCreated, prev: contactIntent },
    { key: 'won', label: 'Chốt', count: won, prev: leadsCreated },
  ];
  return {
    totals: { opened, contactIntent, leads: leadsCreated, won },
    steps: specs.map(s => ({
      key: s.key,
      label: s.label,
      count: s.count,
      pctOfPrevious: pct(s.count, s.prev),
      pctOfOpened: pct(s.count, opened),
    })),
  };
}
