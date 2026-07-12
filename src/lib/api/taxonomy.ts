import { supabase, type Area, type District, type Ward, type PropertyType } from '../supabase';

// ─── Areas ────────────────────────────────────────────────────────────────────
export async function getAreas(): Promise<Area[]> {
  const { data } = await supabase.from('areas').select('*').order('order_index');
  return data ?? [];
}

// ─── Districts ─────────────────────────────────────────────────────────────────
export async function getDistricts(areaId?: string): Promise<District[]> {
  let q = supabase.from('districts').select('*').order('order_index');
  if (areaId) q = q.eq('area_id', areaId);
  const { data } = await q;
  return (data ?? []) as District[];
}
export async function adminCreateDistrict(d: Omit<District, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('districts').insert(d);
  if (error) throw error;
}
export async function adminUpdateDistrict(id: string, d: Partial<District>): Promise<void> {
  const { error } = await supabase.from('districts').update(d).eq('id', id);
  if (error) throw error;
}
export async function adminDeleteDistrict(id: string): Promise<void> {
  const { error } = await supabase.from('districts').delete().eq('id', id);
  if (error) throw error;
}
export async function updateArea(id: string, a: Partial<Area>): Promise<void> {
  const { error } = await supabase.from('areas').update(a).eq('id', id);
  if (error) throw error;
}

// ─── Wards (Phường/Xã) ──────────────────────────────────────────────────────────
export async function getWards(districtId?: string): Promise<Ward[]> {
  let q = supabase.from('wards').select('*').order('order_index');
  if (districtId) q = q.eq('district_id', districtId);
  const { data } = await q;
  return (data ?? []) as Ward[];
}

// ─── Property Types ───────────────────────────────────────────────────────────
export async function getPropertyTypes(): Promise<PropertyType[]> {
  const { data } = await supabase.from('property_types').select('*').order('name');
  return data ?? [];
}
