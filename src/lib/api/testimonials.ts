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
