import { supabase, type Lead, type LeadActivity } from '../supabase';
import { stageMeta } from '../leadPipeline';
import { assigneesOf, type TeamMember } from '../leadAssignment';

// ─── Leads ────────────────────────────────────────────────────────────────────
export async function submitLead(lead: { id?: string; full_name: string; phone: string; area_interest?: string; message?: string; property_id?: string; property_title?: string; budget?: string; source?: string; follow_up_at?: string }): Promise<string | undefined> {
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from('leads').insert({
    ...(lead.id ? { id: lead.id } : {}),
    full_name: lead.full_name, phone: lead.phone,
    area_interest: lead.area_interest, message: lead.message, property_id: lead.property_id,
    source: lead.source ?? null, budget: lead.budget ?? null, follow_up_at: lead.follow_up_at ?? null,
    user_id: user?.id ?? null,
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
  return lead.id;
}

// Admin/staff tạo lead thủ công (khách gọi điện/sự kiện/giới thiệu — không qua form web).
// KHÔNG bắn crm-webhook (khỏi spam Zalo NV cho lead tự nhập). Ghi 1 activity 'created'.
// Gán NV qua bảng lead_assignments: assignee_ids (chọn tay); RPC luôn thêm người
// đang đăng nhập để staff thấy lead vừa tạo do RLS lọc theo thành viên. Gộp + khử trùng.
export async function createLead(input: {
  full_name: string; phone: string; area_interest?: string | null; budget?: string | null;
  message?: string | null; status?: Lead['status']; author?: string | null;
  property_id?: string | null; assignee_ids?: string[]; creator_id?: string | null;
}): Promise<Lead> {
  const memberIds = Array.from(new Set(input.assignee_ids ?? []));
  const { data, error } = await supabase.rpc('admin_create_lead', {
    p_full_name: input.full_name,
    p_phone: input.phone,
    p_area_interest: input.area_interest ?? null,
    p_budget: input.budget ?? null,
    p_message: input.message ?? null,
    p_status: input.status ?? 'new',
    p_property_id: input.property_id ?? null,
    p_assignee_ids: memberIds,
    p_author: input.author ?? null,
  });
  if (error) throw error;
  return data as Lead;
}

// ─── Lead activities (nhật ký chăm sóc) ────────────────────────────────────────
export async function getLeadActivities(leadId: string): Promise<LeadActivity[]> {
  const { data, error } = await supabase.from('lead_activities')
    .select('*').eq('lead_id', leadId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as LeadActivity[];
}
export async function addLeadActivity(leadId: string, a: { kind: LeadActivity['kind']; body?: string | null; author?: string | null }): Promise<void> {
  const { error } = await supabase.from('lead_activities')
    .insert({ lead_id: leadId, kind: a.kind, body: a.body ?? null, author: a.author ?? null });
  if (error) throw error;
}

// Tải gọn field SLA của các lead chưa kết thúc (won/lost) — cho chuông nhắc ở header.
// Chỉ 3 cột, lọc bỏ terminal ở DB để không kéo toàn bộ lead lịch sử về.
export async function getOpenLeadSla(): Promise<{ status: Lead['status']; created_at: string; follow_up_at: string | null; last_activity_at: string | null }[]> {
  const { data, error } = await supabase.from('leads')
    .select('status, created_at, follow_up_at, last_activity_at')
    .not('status', 'in', '(won,lost)');
  if (error) throw error;
  return (data ?? []) as { status: Lead['status']; created_at: string; follow_up_at: string | null; last_activity_at: string | null }[];
}

// Nested select lead_assignments(user_id) để biết NV phụ trách. RLS tự lọc: staff chỉ
// nhận lead mình là thành viên; admin nhận hết.
export async function getLeads(status?: string): Promise<Lead[]> {
  let q = supabase.from('leads').select('*, properties(id,title), lead_assignments(user_id)').order('created_at', { ascending: false });
  if (status && status !== 'all') q = q.eq('status', status);
  const { data } = await q;
  return (data ?? []) as Lead[];
}
export async function updateLeadStatus(id: string, status: Lead['status']): Promise<void> {
  const { error } = await supabase.rpc('admin_update_lead_crm', {
    p_lead_id: id,
    p_patch: { status },
  });
  if (error) throw error;
}
// CRM: cập nhật ghi chú nội bộ + hẹn gọi lại + BĐS quan tâm. Gán NV nay tách sang
// lead_assignments (addAssignee/removeAssignee) — không còn qua patch này.
export async function updateLeadCrm(id: string, patch: { note?: string | null; follow_up_at?: string | null; property_id?: string | null }): Promise<void> {
  const { error } = await supabase.rpc('admin_update_lead_crm', {
    p_lead_id: id,
    p_patch: patch,
  });
  if (error) throw error;
}

// Gán hàng loạt (round-robin) sang bảng lead_assignments. 1 lead có thể thêm nhiều NV
// nên upsert theo (lead_id,user_id), trùng thì bỏ qua. Trả số cặp gán.
export async function bulkAssignLeads(assignments: { lead_id: string; user_id: string }[]): Promise<number> {
  if (assignments.length === 0) return 0;
  const { data, error } = await supabase.from('lead_assignments')
    .upsert(assignments, { onConflict: 'lead_id,user_id', ignoreDuplicates: true })
    .select('lead_id, user_id');
  if (error) throw error;
  return data?.length ?? 0;
}
export async function deleteLead(id: string): Promise<void> {
  const { error } = await supabase.from('leads').delete().eq('id', id);
  if (error) throw error;
}

// Xuất danh sách lead ra chuỗi CSV (UTF-8 BOM để Excel đọc đúng tiếng Việt).
// Cột "Phụ trách" ghép nhãn NV từ lead_assignments (resolve qua roster truyền vào).
export function leadsToCsv(leads: Lead[], roster: TeamMember[] = []): string {
  const cols = ['created_at', 'full_name', 'phone', 'status', 'source', 'assignees', 'follow_up_at', 'area_interest', 'budget', 'message', 'note'];
  const header = ['Ngày tạo', 'Họ tên', 'SĐT', 'Giai đoạn', 'Nguồn', 'Phụ trách', 'Hẹn gọi lại', 'Khu vực quan tâm', 'Ngân sách', 'Lời nhắn', 'Ghi chú'];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = leads.map(l => cols.map(c => {
    if (c === 'status') return esc(stageMeta(l.status).label);
    if (c === 'assignees') return esc(assigneesOf(l, roster).map(a => a.label).join(' · '));
    return esc((l as Record<string, unknown>)[c]);
  }).join(','));
  return '﻿' + [header.join(','), ...rows].join('\n');
}

// ─── Bulk operations ──────────────────────────────────────────────────────────
// Đổi trạng thái/xóa nhiều lead trong 1 câu (.in). Trả số dòng ảnh hưởng.
export async function bulkUpdateLeadStatus(ids: string[], status: Lead['status']): Promise<number> {
  if (ids.length === 0) return 0;
  const { data, error } = await supabase.rpc('admin_bulk_update_lead_status', {
    p_lead_ids: ids,
    p_status: status,
  });
  if (error) throw error;
  return Number(data ?? 0);
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
