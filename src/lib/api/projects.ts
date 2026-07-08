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
