import { supabase, type AdminDocument } from '../supabase';
import { publicImageUrlToStoragePath } from '../siteUrl';

// CRUD tài liệu đào tạo AI (admin-only qua RLS is_admin()). Text đã trích sẵn ở
// client (documentParse.ts) rồi lưu vào extracted_text; refresh_rag_index('admin_docs')
// chunk hoá thành rag_chunks. File gốc nằm trên bucket admin-uploads.

export async function adminListDocuments(): Promise<AdminDocument[]> {
  const { data, error } = await supabase
    .from('admin_documents')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as AdminDocument[];
}

export interface AdminDocumentInput {
  title: string;
  extracted_text: string;
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  size_bytes?: number | null;
}

export async function adminCreateDocument(payload: AdminDocumentInput): Promise<AdminDocument> {
  const { data, error } = await supabase
    .from('admin_documents')
    .insert({
      title: payload.title,
      extracted_text: payload.extracted_text,
      file_url: payload.file_url ?? null,
      file_name: payload.file_name ?? null,
      mime_type: payload.mime_type ?? null,
      size_bytes: payload.size_bytes ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as AdminDocument;
}

export async function adminUpdateDocument(
  id: string,
  patch: Partial<Pick<AdminDocument, 'title' | 'extracted_text' | 'is_active'>>,
): Promise<void> {
  const { error } = await supabase
    .from('admin_documents')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

// Xóa record + file gốc trên storage (best-effort, theo pattern deleteUserMedia).
export async function adminDeleteDocument(doc: Pick<AdminDocument, 'id' | 'file_url'>): Promise<void> {
  const { error } = await supabase.from('admin_documents').delete().eq('id', doc.id);
  if (error) throw error;
  if (doc.file_url) {
    try {
      const storage = publicImageUrlToStoragePath(doc.file_url);
      if (storage) await supabase.storage.from(storage.bucket).remove([storage.path]);
    } catch { /* file gốc mồ côi không chặn xóa record */ }
  }
}
