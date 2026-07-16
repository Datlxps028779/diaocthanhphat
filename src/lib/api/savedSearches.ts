import { supabase, type UserSavedSearch } from '../supabase';
import { normalizeFilters, isAlertCadence, type SavedFilters, type AlertCadence } from '../savedSearch';

// Bộ lọc tìm kiếm đã lưu của người dùng đăng nhập. RLS owner-scoped
// (auth.uid() = user_id) — guest luôn nhận [] / bị chặn ghi. Slice này chỉ
// lưu + quản lý; gửi cảnh báo tin mới là foundation cho bước sau.

export async function listSavedSearches(): Promise<UserSavedSearch[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('user_saved_searches')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  return (data ?? []) as UserSavedSearch[];
}

export async function createSavedSearch(input: {
  name: string; filters: SavedFilters; cadence?: AlertCadence;
}): Promise<UserSavedSearch> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Vui lòng đăng nhập để lưu tìm kiếm.');
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error('Tên tìm kiếm không được để trống.');
  const cadence = input.cadence && isAlertCadence(input.cadence) ? input.cadence : 'daily';
  const { data, error } = await supabase
    .from('user_saved_searches')
    .insert({
      user_id: user.id,
      name,
      filters: normalizeFilters(input.filters),
      cadence,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as UserSavedSearch;
}

export async function updateSavedSearch(id: string, patch: {
  alert_enabled?: boolean; cadence?: AlertCadence; name?: string;
}): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Vui lòng đăng nhập.');
  const fields: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (typeof patch.alert_enabled === 'boolean') fields.alert_enabled = patch.alert_enabled;
  if (patch.cadence && isAlertCadence(patch.cadence)) fields.cadence = patch.cadence;
  if (typeof patch.name === 'string') {
    const name = patch.name.trim().slice(0, 120);
    if (name) fields.name = name;
  }
  const { error } = await supabase
    .from('user_saved_searches')
    .update(fields)
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw error;
}

export async function deleteSavedSearch(id: string): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Vui lòng đăng nhập.');
  const { error } = await supabase
    .from('user_saved_searches')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) throw error;
}
