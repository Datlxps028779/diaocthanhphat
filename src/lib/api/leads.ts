import { supabase, type Lead } from '../supabase';

// ─── Leads ────────────────────────────────────────────────────────────────────
export async function submitLead(lead: { full_name: string; phone: string; area_interest?: string; message?: string; property_id?: string; property_title?: string; budget?: string }): Promise<void> {
  const { error } = await supabase.from('leads').insert({
    full_name: lead.full_name, phone: lead.phone,
    area_interest: lead.area_interest, message: lead.message, property_id: lead.property_id,
  });
  if (error) throw error;
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
  fetch(`${supabaseUrl}/functions/v1/crm-webhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${anonKey}` },
    body: JSON.stringify({
      full_name: lead.full_name, phone: lead.phone,
      property_id: lead.property_id, property_title: lead.property_title,
      message: lead.message, budget: lead.budget,
    }),
  }).catch(() => {});
}
export async function getLeads(status?: string): Promise<Lead[]> {
  let q = supabase.from('leads').select('*, properties(id,title)').order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return (data ?? []) as Lead[];
}
export async function updateLeadStatus(id: string, status: Lead['status']): Promise<void> {
  const { error } = await supabase.from('leads').update({ status }).eq('id', id);
  if (error) throw error;
}
export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}

// ─── Bulk operations ──────────────────────────────────────────────────────────
// Đổi trạng thái/xóa nhiều lead trong 1 câu (.in). Trả số dòng ảnh hưởng.
export async function bulkUpdateLeadStatus(ids: string[], status: Lead['status']): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await supabase
    .from('leads')
    .update({ status }, { count: 'exact' })
    .in('id', ids);
  if (error) throw error;
  return count ?? ids.length;
}

export async function bulkDeleteLeads(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await supabase
    .from('leads')
    .delete({ count: 'exact' })
    .in('id', ids);
  if (error) throw error;
  return count ?? ids.length;
}
