import { supabase, type MenuItem } from '../supabase';

// Menu điều hướng động (bảng menu_items). Public đọc; admin CRUD (RLS is_admin phía DB).
export async function getMenuItems(): Promise<MenuItem[]> {
  const { data } = await supabase.from('menu_items').select('*').order('order_index');
  return (data ?? []) as MenuItem[];
}

export async function adminCreateMenuItem(m: Omit<MenuItem, 'id' | 'created_at' | 'updated_at'>): Promise<MenuItem> {
  const { data, error } = await supabase.from('menu_items').insert(m).select().single();
  if (error) throw error;
  return data as MenuItem;
}

export async function adminUpdateMenuItem(id: string, m: Partial<MenuItem>): Promise<void> {
  const { error } = await supabase.from('menu_items').update(m).eq('id', id);
  if (error) throw error;
}

export async function adminDeleteMenuItem(id: string): Promise<void> {
  const { error } = await supabase.from('menu_items').delete().eq('id', id);
  if (error) throw error;
}
