import { supabase, type AiChatKnowledge } from '../supabase';

// ─── AI Chat Knowledge (kho Hỏi–Đáp admin soạn cho Trợ lý BĐS) ──────────────────
// Public đọc câu đang bật (chat công khai dùng anon key). Admin CRUD (RLS is_admin()).

// Public: chỉ câu is_active, ưu tiên priority cao trước để matcher chọn đúng câu.
export async function getAiChatKnowledge(): Promise<AiChatKnowledge[]> {
  const { data } = await supabase
    .from('ai_chat_knowledge')
    .select('*')
    .eq('is_active', true)
    .order('priority', { ascending: false });
  return (data ?? []) as AiChatKnowledge[];
}

// Admin: đọc tất cả (kể cả câu đang tắt) để quản lý.
export async function adminGetAiChatKnowledge(): Promise<AiChatKnowledge[]> {
  const { data } = await supabase
    .from('ai_chat_knowledge')
    .select('*')
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false });
  return (data ?? []) as AiChatKnowledge[];
}

export async function createAiChatKnowledge(
  input: Omit<AiChatKnowledge, 'id' | 'created_at' | 'updated_at'>,
): Promise<void> {
  const { error } = await supabase.from('ai_chat_knowledge').insert(input);
  if (error) throw error;
}

export async function updateAiChatKnowledge(id: string, input: Partial<AiChatKnowledge>): Promise<void> {
  const { error } = await supabase
    .from('ai_chat_knowledge')
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function deleteAiChatKnowledge(id: string): Promise<void> {
  const { error } = await supabase.from('ai_chat_knowledge').delete().eq('id', id);
  if (error) throw error;
}
