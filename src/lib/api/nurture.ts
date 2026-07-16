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
