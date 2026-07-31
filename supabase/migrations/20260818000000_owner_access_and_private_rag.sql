-- Owner-only console + private admin documents/RAG hardening.
-- Run this migration before the owner bootstrap statement below.
-- It intentionally fails closed: no owner config means is_admin() returns false.

BEGIN;

CREATE TABLE IF NOT EXISTS public.owner_access_config (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  owner_user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.owner_access_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.owner_access_config FROM anon, authenticated;

-- Bootstrap the owner separately after this migration in the authorized SQL Editor:
-- INSERT INTO public.owner_access_config (singleton, owner_user_id)
-- VALUES (true, '<owner-auth-user-uuid>')
-- ON CONFLICT (singleton) DO UPDATE SET owner_user_id = EXCLUDED.owner_user_id, updated_at = now();
-- Owner identity is independent from profiles.role; do not assign admin through profiles.

CREATE OR REPLACE FUNCTION public.is_owner()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.owner_access_config c
    WHERE c.singleton AND c.owner_user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_owner_mfa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_owner()
    AND coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_owner_mfa();
$$;

CREATE OR REPLACE FUNCTION public.is_admin_or_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_owner_mfa()
    OR EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'staff'
    );
$$;

GRANT EXECUTE ON FUNCTION public.is_owner() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_owner_mfa() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_staff() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.restrict_owner_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  configured_owner uuid;
BEGIN
  SELECT owner_user_id INTO configured_owner
  FROM public.owner_access_config
  WHERE singleton;

  IF configured_owner IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.id = configured_owner AND NEW.role <> 'admin' THEN
    RAISE EXCEPTION 'Không thể hạ quyền chủ hệ thống';
  END IF;

  IF NEW.role = 'admin' AND NEW.id <> configured_owner THEN
    RAISE EXCEPTION 'Chỉ UUID chủ hệ thống mới có thể có role admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_restrict_owner_role ON public.profiles;
CREATE TRIGGER trg_restrict_owner_role
  BEFORE INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.restrict_owner_role();

CREATE TABLE IF NOT EXISTS public.admin_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  file_name text,
  file_url text,
  file_path text,
  mime_type text,
  size_bytes integer,
  extracted_text text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_documents_active_idx ON public.admin_documents(is_active);
ALTER TABLE public.admin_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_select_admin_documents" ON public.admin_documents;
CREATE POLICY "admin_select_admin_documents" ON public.admin_documents
  FOR SELECT TO authenticated USING (public.is_owner_mfa());
DROP POLICY IF EXISTS "admin_insert_admin_documents" ON public.admin_documents;
CREATE POLICY "admin_insert_admin_documents" ON public.admin_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_owner_mfa());
DROP POLICY IF EXISTS "admin_update_admin_documents" ON public.admin_documents;
CREATE POLICY "admin_update_admin_documents" ON public.admin_documents
  FOR UPDATE TO authenticated USING (public.is_owner_mfa()) WITH CHECK (public.is_owner_mfa());
DROP POLICY IF EXISTS "admin_delete_admin_documents" ON public.admin_documents;
CREATE POLICY "admin_delete_admin_documents" ON public.admin_documents
  FOR DELETE TO authenticated USING (public.is_owner_mfa());

ALTER TABLE public.admin_documents ADD COLUMN IF NOT EXISTS file_path text;

UPDATE public.admin_documents
SET file_path = CASE
  WHEN file_url LIKE '%/storage/v1/object/public/admin-uploads/%'
    THEN split_part(file_url, '/storage/v1/object/public/admin-uploads/', 2)
  WHEN file_url LIKE '%/hinh-anh/admin-uploads/%'
    THEN split_part(file_url, '/hinh-anh/admin-uploads/', 2)
  ELSE file_path
END
WHERE file_path IS NULL AND file_url IS NOT NULL;

-- Public URLs must stop working once the bucket becomes private.
UPDATE public.admin_documents
SET file_url = NULL
WHERE file_url IS NOT NULL;

UPDATE storage.buckets
SET public = false
WHERE id = 'admin-uploads';

DROP POLICY IF EXISTS "admin_uploads_select" ON storage.objects;
DROP POLICY IF EXISTS "admin_uploads_insert" ON storage.objects;
DROP POLICY IF EXISTS "admin_uploads_update" ON storage.objects;
DROP POLICY IF EXISTS "admin_uploads_delete" ON storage.objects;

CREATE POLICY "admin_uploads_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'admin-uploads' AND public.is_owner_mfa());
CREATE POLICY "admin_uploads_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'admin-uploads' AND public.is_owner_mfa());
CREATE POLICY "admin_uploads_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'admin-uploads' AND public.is_owner_mfa())
  WITH CHECK (bucket_id = 'admin-uploads' AND public.is_owner_mfa());
CREATE POLICY "admin_uploads_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'admin-uploads' AND public.is_owner_mfa());

DELETE FROM public.rag_chunks WHERE source_table = 'admin_docs';

DROP POLICY IF EXISTS "rag_chunks_select_public" ON public.rag_chunks;
CREATE POLICY "rag_chunks_select_public" ON public.rag_chunks
  FOR SELECT TO anon, authenticated
  USING (
    (visibility = 'public' AND source_table <> 'admin_docs')
    OR public.is_owner_mfa()
  );

CREATE OR REPLACE FUNCTION public.match_rag_chunks(
  query text,
  match_count int DEFAULT 8,
  filter_source_types text[] DEFAULT NULL,
  filter_visibility text DEFAULT 'public'
)
RETURNS TABLE (
  chunk_id uuid,
  source_table text,
  source_id uuid,
  source_slug text,
  source_url text,
  title text,
  content text,
  metadata jsonb,
  score real
)
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT
      websearch_to_tsquery('simple', public.f_unaccent(coalesce(query, ''))) AS tsq,
      public.f_unaccent(coalesce(query, '')) AS uq
  )
  SELECT
    c.id, c.source_table, c.source_id, c.source_slug, c.source_url,
    c.title, c.content, c.metadata,
    (ts_rank(c.content_tsv, q.tsq) + 0.5 * similarity(public.f_unaccent(c.title), q.uq))::real AS score
  FROM public.rag_chunks c, q
  WHERE c.source_table <> 'admin_docs'
    AND (
      CASE
        WHEN public.is_owner_mfa() AND filter_visibility = 'internal' THEN c.visibility = 'internal'
        ELSE c.visibility = 'public'
      END
    )
    AND (filter_source_types IS NULL OR c.source_table = ANY(filter_source_types))
    AND (
      c.content_tsv @@ q.tsq
      OR similarity(public.f_unaccent(c.title), q.uq) > 0.2
    )
  ORDER BY score DESC
  LIMIT greatest(1, least(coalesce(match_count, 8), 30));
$$;

GRANT EXECUTE ON FUNCTION public.match_rag_chunks(text, int, text[], text) TO anon, authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.refresh_rag_index_legacy(text)') IS NULL
     AND to_regprocedure('public.refresh_rag_index(text)') IS NOT NULL THEN
    ALTER FUNCTION public.refresh_rag_index(text) RENAME TO refresh_rag_index_legacy;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_rag_index_legacy(text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.refresh_rag_index(target text DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result_count integer;
BEGIN
  IF NOT public.is_owner_mfa() THEN
    RAISE EXCEPTION 'Chỉ chủ hệ thống đã xác thực đa yếu tố được đồng bộ dữ liệu AI';
  END IF;

  IF target = 'admin_docs' THEN
    DELETE FROM public.rag_chunks WHERE source_table = 'admin_docs';
    RETURN 0;
  END IF;

  PERFORM public.refresh_rag_index_legacy(target);
  DELETE FROM public.rag_chunks WHERE source_table = 'admin_docs';

  SELECT count(*)::integer INTO result_count
  FROM public.rag_chunks
  WHERE target IS NULL OR source_table = target;

  RETURN result_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_rag_index(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
