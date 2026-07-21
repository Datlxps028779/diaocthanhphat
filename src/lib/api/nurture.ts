import { supabase, type LeadDripLog, type NurtureDripConfig, type NurtureDripStep } from '../supabase';
import { isTerminal, type StageKey } from '../leadPipeline';

export async function getNurtureDripConfig(): Promise<NurtureDripConfig | null> {
  const { data, error } = await supabase
    .from('nurture_drip_config')
    .select('*')
    .eq('id', true)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as NurtureDripConfig | null;
}

export async function updateNurtureDripConfig(patch: Partial<Pick<NurtureDripConfig, 'enabled' | 'endpoint' | 'secret' | 'eligible_statuses' | 'require_phone'>>): Promise<void> {
  const { error } = await supabase
    .from('nurture_drip_config')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', true);
  if (error) throw error;
}

export type DripStepInput = Pick<NurtureDripStep, 'delay_days' | 'channel' | 'message_template' | 'enabled'>;

export async function getDripSteps(): Promise<NurtureDripStep[]> {
  const { data, error } = await supabase
    .from('nurture_drip_step')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('delay_days', { ascending: true });
  if (error) throw error;
  return (data ?? []) as NurtureDripStep[];
}

export async function createDripStep(input: DripStepInput): Promise<NurtureDripStep> {
  const { data: maxRow } = await supabase
    .from('nurture_drip_step')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;
  const { data, error } = await supabase
    .from('nurture_drip_step')
    .insert({ ...input, sort_order: nextOrder })
    .select('*')
    .single();
  if (error) throw error;
  return data as NurtureDripStep;
}

export async function updateDripStep(id: string, patch: Partial<DripStepInput>): Promise<void> {
  const { error } = await supabase
    .from('nurture_drip_step')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteDripStep(id: string): Promise<void> {
  const { error } = await supabase.from('nurture_drip_step').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderDripSteps(ids: string[]): Promise<void> {
  const now = new Date().toISOString();
  await Promise.all(ids.map((id, i) =>
    supabase.from('nurture_drip_step').update({ sort_order: i, updated_at: now }).eq('id', id).then(({ error }) => {
      if (error) throw error;
    })
  ));
}

// Đếm gần đúng lead đủ điều kiện cơ bản (status ∈ eligible & không terminal, có SĐT nếu require_phone).
// Chưa tính tuổi lead / bước đã gửi / trùng lịch hẹn — chỉ để admin ước lượng quy mô.
export async function countEligibleLeads(filter: { eligible_statuses: string[]; require_phone: boolean }): Promise<number> {
  const statuses = filter.eligible_statuses.filter(s => !isTerminal(s as StageKey));
  if (statuses.length === 0) return 0;
  let q = supabase.from('leads').select('id', { count: 'exact', head: true }).in('status', statuses);
  if (filter.require_phone) q = q.not('phone', 'is', null).neq('phone', '');
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export async function invokeNurtureDrip(): Promise<number> {
  const { data, error } = await supabase.rpc('admin_invoke_nurture_drip');
  if (error) throw error;
  return (data as number) ?? 0;
}

export async function getLeadDripLogs(leadId: string): Promise<LeadDripLog[]> {
  const { data, error } = await supabase
    .from('lead_drip_log')
    .select('*')
    .eq('lead_id', leadId)
    .order('sent_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LeadDripLog[];
}

export type DripLogWithLead = LeadDripLog & { leads: { id: string; full_name: string; phone: string } | null };

export async function getRecentDripLogs(opts?: { status?: LeadDripLog['status']; limit?: number }): Promise<DripLogWithLead[]> {
  let q = supabase
    .from('lead_drip_log')
    .select('*, leads(id, full_name, phone)')
    .order('sent_at', { ascending: false })
    .limit(opts?.limit ?? 100);
  if (opts?.status) q = q.eq('status', opts.status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as DripLogWithLead[];
}
