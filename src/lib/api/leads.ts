import { supabase, type Lead, type LeadActivity } from '../supabase';
import { stageMeta } from '../leadPipeline';

// ─── Leads ────────────────────────────────────────────────────────────────────
export async function submitLead(lead: { full_name: string; phone: string; area_interest?: string; message?: string; property_id?: string; property_title?: string; budget?: string; source?: string }): Promise<void> {
  const { error } = await supabase.from('leads').insert({
    full_name: lead.full_name, phone: lead.phone,
    area_interest: lead.area_interest, message: lead.message, property_id: lead.property_id,
    source: lead.source ?? null, budget: lead.budget ?? null,
  });
  if (error) throw error;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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

// Admin tạo lead thủ công (khách gọi điện/sự kiện/giới thiệu — không qua form web).
// KHÔNG bắn crm-webhook (khỏi spam Zalo NV cho lead admin tự nhập). Ghi 1 activity 'created'.
export async function createLead(input: {
  full_name: string; phone: string; area_interest?: string | null; budget?: string | null;
  message?: string | null; assigned_to?: string | null; status?: Lead['status']; author?: string | null;
  property_id?: string | null;
}): Promise<Lead> {
  const { data, error } = await supabase.from('leads').insert({
    full_name: input.full_name, phone: input.phone,
    area_interest: input.area_interest ?? null, budget: input.budget ?? null,
    message: input.message ?? null, assigned_to: input.assigned_to ?? null,
    status: input.status ?? 'new', source: 'admin_manual',
    property_id: input.property_id ?? null,
  }).select('*, properties(id,title)').single();
  if (error) throw error;
  const lead = data as Lead;
  await addLeadActivity(lead.id, { kind: 'created', body: 'Tạo khách thủ công', author: input.author ?? null });
  return lead;
}

// ─── Lead activities (nhật ký chăm sóc) ────────────────────────────────────────
export async function getLeadActivities(leadId: string): Promise<LeadActivity[]> {
  const { data } = await supabase.from('lead_activities')
    .select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
  return (data ?? []) as LeadActivity[];
}
export async function addLeadActivity(leadId: string, a: { kind: LeadActivity['kind']; body?: string | null; author?: string | null }): Promise<void> {
  const { error } = await supabase.from('lead_activities')
    .insert({ lead_id: leadId, kind: a.kind, body: a.body ?? null, author: a.author ?? null });
  if (error) throw error;
}

// Tải gọn field SLA của các lead chưa kết thúc (won/lost) — cho chuông nhắc ở header.
// Chỉ 3 cột, lọc bỏ terminal ở DB để không kéo toàn bộ lead lịch sử về.
export async function getOpenLeadSla(): Promise<{ status: Lead['status']; created_at: string; follow_up_at: string | null }[]> {
  const { data } = await supabase.from('leads')
    .select('status, created_at, follow_up_at')
    .not('status', 'in', '(won,lost)');
  return (data ?? []) as { status: Lead['status']; created_at: string; follow_up_at: string | null }[];
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
// CRM: cập nhật ghi chú nội bộ + nhân viên phụ trách + hẹn gọi lại.
export async function updateLeadCrm(id: string, patch: { note?: string | null; assigned_to?: string | null; follow_up_at?: string | null; property_id?: string | null }): Promise<void> {
  const { error } = await supabase.from('leads').update(patch).eq('id', id);
  if (error) throw error;
}

// Gán hàng loạt — mỗi lead một nhãn NV khác nhau (round-robin) nên không gộp 1 query.
// Team nhỏ, số lead chưa gán mỗi lần bấm không lớn → Promise.all chấp nhận được.
export async function bulkAssignLeads(assignments: { id: string; assigned_to: string }[]): Promise<number> {
  if (assignments.length === 0) return 0;
  await Promise.all(assignments.map(a => updateLeadCrm(a.id, { assigned_to: a.assigned_to })));
  return assignments.length;
}
export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}

// Xuất danh sách lead ra chuỗi CSV (UTF-8 BOM để Excel đọc đúng tiếng Việt).
export function leadsToCsv(leads: Lead[]): string {
  const cols = ['created_at', 'full_name', 'phone', 'status', 'source', 'assigned_to', 'follow_up_at', 'area_interest', 'budget', 'message', 'note'];
  const header = ['Ngày tạo', 'Họ tên', 'SĐT', 'Giai đoạn', 'Nguồn', 'Phụ trách', 'Hẹn gọi lại', 'Khu vực quan tâm', 'Ngân sách', 'Lời nhắn', 'Ghi chú'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = leads.map(l => cols.map(c =>
    esc(c === 'status' ? stageMeta(l.status).label : (l as Record<string, unknown>)[c])
  ).join(','));
  return '﻿' + [header.join(','), ...rows].join('\n');
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
