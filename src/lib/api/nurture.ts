import { supabase, type LeadDripLog, type NurtureDripConfig } from '../supabase';

export async function getNurtureDripConfig(): Promise<NurtureDripConfig | null> {
  const { data, error } = await supabase
    .from('nurture_drip_config')
    .select('*')
    .eq('id', true)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as NurtureDripConfig | null;
}

export async function updateNurtureDripConfig(patch: Partial<Pick<NurtureDripConfig, 'enabled' | 'endpoint' | 'secret'>>): Promise<void> {
  const { error } = await supabase
    .from('nurture_drip_config')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', true);
  if (error) throw error;
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
