import { supabase, type AdminDocument } from '../supabase';

// CRUD tài liệu nội bộ owner-only. Text trích ở client được lưu riêng, không tự
// đưa vào public RAG; file gốc nằm trong bucket private admin-uploads.

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
  file_path?: string | null;
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
      file_path: payload.file_path ?? null,
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

export async function adminDeleteDocument(doc: Pick<AdminDocument, 'id' | 'file_path'>): Promise<void> {
  const { error } = await supabase.from('admin_documents').delete().eq('id', doc.id);
  if (error) throw error;
  if (doc.file_path) {
    try { await supabase.storage.from('admin-uploads').remove([doc.file_path]); } catch { /* file gốc mồ côi không chặn xóa record */ }
  }
}

export async function adminCreateDocumentSignedUrl(filePath: string): Promise<string | null> {
  if (!filePath) return null;
  const { data, error } = await supabase.storage.from('admin-uploads').createSignedUrl(filePath, 60);
  if (error) throw error;
  return data.signedUrl;
}
