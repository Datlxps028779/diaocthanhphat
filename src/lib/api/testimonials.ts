import { supabase, type Testimonial } from '../supabase';

// ─── Testimonials ─────────────────────────────────────────────────────────────
export async function getTestimonials(): Promise<Testimonial[]> {
  const { data } = await supabase.from('testimonials').select('*').eq('is_active', true).order('created_at');
  return data ?? [];
}
export async function adminGetTestimonials(): Promise<Testimonial[]> {
  const { data } = await supabase.from('testimonials').select('*').order('created_at');
  return data ?? [];
}
export async function createTestimonial(t: Omit<Testimonial, 'id' | 'created_at'>): Promise<void> {
  const { error } = await supabase.from('testimonials').insert(t);
  if (error) throw error;
}
export async function updateTestimonial(id: string, t: Partial<Testimonial>): Promise<void> {
  const { error } = await supabase.from('testimonials').update(t).eq('id', id);
  if (error) throw error;
}
export async function deleteTestimonial(id: string): Promise<void> {
  const { error } = await supabase.from('testimonials').delete().eq('id', id);
  if (error) throw error;
}

// ─── Bulk operations ──────────────────────────────────────────────────────────
// Cập nhật/xóa nhiều đánh giá trong 1 câu (.in). Trả số dòng ảnh hưởng để UI báo lại.
export async function bulkUpdateTestimonials(
  ids: string[],
  patch: Partial<Pick<Testimonial, 'is_active'>>,
): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await supabase
    .from('testimonials')
    .update(patch, { count: 'exact' })
    .in('id', ids);
  if (error) throw error;
  return count ?? ids.length;
}

export async function bulkDeleteTestimonials(ids: string[]): Promise<number> {
  if (ids.length === 0) return 0;
  const { error, count } = await supabase
    .from('testimonials')
    .delete({ count: 'exact' })
    .in('id', ids);
  if (error) throw error;
  return count ?? ids.length;
}
