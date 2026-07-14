// Đồng phụ trách lead (thuần, test được). Gán lead theo MÃ tài khoản (user_id) qua
// bảng junction lead_assignments — nhiều NV cùng chăm 1 khách. RLS ở DB lo phần
// "ai thấy lead nào"; các hàm này chỉ dựng nhãn + kế hoạch chia đều.

export type Role = 'user' | 'staff' | 'admin';

export interface TeamMember {
  id: string;
  display_name: string | null;
  phone: string | null;
  role: Role;
}

// Lead ở góc nhìn gán: chỉ cần danh sách user_id được gán (từ nested select).
export interface AssignableLead {
  lead_assignments?: { user_id: string }[];
}

export interface Assignee {
  id: string;
  label: string;
}

// Nhãn hiển thị của 1 tài khoản: display_name → phone → NV-<6 ký tự đầu id>.
// (Cùng quy tắc dropdown gán cũ, nay tách ra dùng chung + test được.)
export function memberLabel(m: Pick<TeamMember, 'id' | 'display_name' | 'phone'>): string {
  return m.display_name?.trim() || m.phone?.trim() || `NV-${m.id.slice(0, 6)}`;
}

// Nhãn suy từ chính user_id khi không tìm thấy trong roster (NV đã mất quyền/đổi tên).
function labelFor(userId: string, roster: TeamMember[]): string {
  const found = roster.find(m => m.id === userId);
  return found ? memberLabel(found) : `NV-${userId.slice(0, 6)}`;
}

// Danh sách NV đang phụ trách 1 lead (giữ thứ tự trong lead_assignments).
export function assigneesOf(lead: AssignableLead, roster: TeamMember[]): Assignee[] {
  return (lead.lead_assignments ?? []).map(a => ({ id: a.user_id, label: labelFor(a.user_id, roster) }));
}

// Chia đều lead chưa gán cho các NV theo vòng (round-robin), keyed theo user_id.
export function assignmentPlan(leadIds: string[], memberIds: string[]): { lead_id: string; user_id: string }[] {
  if (leadIds.length === 0 || memberIds.length === 0) return [];
  return leadIds.map((lead_id, i) => ({ lead_id, user_id: memberIds[i % memberIds.length] }));
}
