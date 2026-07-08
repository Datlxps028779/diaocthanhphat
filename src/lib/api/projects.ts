import { supabase, type Project } from '../supabase';

// ─── Projects ─────────────────────────────────────────────────────────────────
export async function getProjects(filters?: { areaId?: string; phase?: string }): Promise<Project[]> {
  let q = supabase.from('projects').select('*, areas(id,name,slug)').eq('is_active', true).order('created_at', { ascending: false });
  if (filters?.areaId) q = q.eq('area_id', filters.areaId);
  if (filters?.phase && filters.phase !== 'Tất cả') q = q.eq('phase', filters.phase);
  const { data } = await q;
  return (data ?? []) as Project[];
}
export async function adminGetAllProjects(): Promise<Project[]> {
  const { data } = await supabase.from('projects').select('*, areas(id,name,slug)').order('created_at', { ascending: false });
  return (data ?? []) as Project[];
}
export async function createProject(p: Omit<Project, 'id' | 'created_at' | 'updated_at' | 'areas'>): Promise<void> {
  const { error } = await supabase.from('projects').insert(p);
  if (error) throw error;
}
export async function updateProject(id: string, p: Partial<Project>): Promise<void> {
  const { error } = await supabase.from('projects').update({ ...p, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
export async function deleteProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) throw error;
}

// ─── Bulk operations ──────────────────────────────────────────────────────────
// Cập nhật/xóa nhiều dự án trong 1 câu (.in). Trả số dòng ảnh hưởng để UI báo lại.
export async function bulkUpdateProjects(
  ids: string[],
  patch: Partial<Pick<Project, 'is_active'>>,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await supabase
    .from('projects')
    .update({ ...patch, updated_at: new Date().toISOString() }, { count: 'exact' })
    .in('id', ids);
  if (error) throw error;
  return count ?? ids.length;
}

export async function bulkDeleteProjects(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await supabase
    .from('projects')
    .delete({ count: 'exact' })
    .in('id', ids);
  if (error) throw error;
  return count ?? ids.length;
}
