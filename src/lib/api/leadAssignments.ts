import { supabase } from '../supabase';
import type { TeamMember } from '../leadAssignment';

// ─── Đồng phụ trách lead (bảng lead_assignments) ────────────────────────────────
// RLS ở DB quyết ai được thêm/gỡ/xem (admin hoặc NV đang phụ trách lead đó). Client
// chỉ gọi; không tự kiểm quyền.

// Roster team để chọn NV phụ trách: chỉ tài khoản admin/staff. Đọc được nhờ policy
// profiles_select_team (cả staff cũng gọi được, khác /api/admin/users chỉ-admin).
export async function getTeamMembers(): Promise<TeamMember[]> {
  const { data } = await supabase
    .from('profiles')
    .select('id, display_name, phone, role')
    .in('role', ['admin', 'staff'])
    .order('display_name', { ascending: true });
  return (data ?? []) as TeamMember[];
}

// Thêm 1 NV vào phụ trách lead. added_by = ai thực hiện (admin hoặc NV đang phụ trách).
// ON CONFLICT (đã là thành viên) → bỏ qua, không lỗi.
export async function addAssignee(leadId: string, userId: string, addedBy: string | null): Promise<void> {
  const { error } = await supabase
    .from('lead_assignments')
    .upsert({ lead_id: leadId, user_id: userId, added_by: addedBy }, { onConflict: 'lead_id,user_id', ignoreDuplicates: true });
  if (error) throw error;
}

export async function removeAssignee(leadId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('lead_assignments')
    .delete()
    .eq('lead_id', leadId)
    .eq('user_id', userId);
  if (error) throw error;
}
