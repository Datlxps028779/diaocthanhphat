-- Tài liệu đào tạo AI (admin upload Word/Excel/PDF…) — bảng nguồn cho RAG.
-- Admin upload file lên bucket admin-uploads, text được trích Ở CLIENT rồi lưu vào
-- extracted_text. refresh_rag_index('admin_docs') chunk hoá extracted_text → rag_chunks
-- (nguồn 'admin_docs'). AI Chat trả lời dựa trên chunk thật + trích nguồn, KHÔNG bịa.
-- Idempotent: IF NOT EXISTS + DROP POLICY IF EXISTS.

CREATE TABLE IF NOT EXISTS admin_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  file_name text,
  file_url text,
  mime_type text,
  size_bytes integer,
  extracted_text text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_documents_active_idx ON admin_documents(is_active);

ALTER TABLE admin_documents ENABLE ROW LEVEL SECURITY;

-- Admin-only toàn bộ (tài liệu nội bộ; chunk public sinh ra ở rag_chunks, không lộ bảng nguồn).
DROP POLICY IF EXISTS "admin_select_admin_documents" ON admin_documents;
CREATE POLICY "admin_select_admin_documents" ON admin_documents
  FOR SELECT TO authenticated USING (is_admin());

DROP POLICY IF EXISTS "admin_insert_admin_documents" ON admin_documents;
CREATE POLICY "admin_insert_admin_documents" ON admin_documents
  FOR INSERT TO authenticated WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_update_admin_documents" ON admin_documents;
CREATE POLICY "admin_update_admin_documents" ON admin_documents
  FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());

DROP POLICY IF EXISTS "admin_delete_admin_documents" ON admin_documents;
CREATE POLICY "admin_delete_admin_documents" ON admin_documents
  FOR DELETE TO authenticated USING (is_admin());

NOTIFY pgrst, 'reload schema';
