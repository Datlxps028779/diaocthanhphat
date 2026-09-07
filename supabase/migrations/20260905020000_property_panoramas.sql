BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('property-360', 'property-360', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE TABLE IF NOT EXISTS public.property_panoramas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 31457280),
  width integer NOT NULL CHECK (width >= 2000 AND width <= 16000),
  height integer NOT NULL CHECK (height >= 1000 AND height <= 8000),
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 120),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_panoramas_mime_check CHECK (mime_type IN ('image/jpeg', 'image/webp')),
  CONSTRAINT property_panoramas_ratio_check CHECK (width::numeric / NULLIF(height, 0) BETWEEN 1.8 AND 2.2),
  CONSTRAINT property_panoramas_path_check CHECK (storage_path LIKE property_id::text || '/%')
);

CREATE INDEX IF NOT EXISTS property_panoramas_public_order_idx
  ON public.property_panoramas(property_id, is_active, sort_order, created_at);

ALTER TABLE public.property_panoramas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_panoramas_public_select ON public.property_panoramas;
CREATE POLICY property_panoramas_public_select
  ON public.property_panoramas FOR SELECT TO anon, authenticated
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = property_panoramas.property_id
        AND p.is_active = true
    )
  );

DROP POLICY IF EXISTS property_panoramas_admin_select ON public.property_panoramas;
CREATE POLICY property_panoramas_admin_select
  ON public.property_panoramas FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS property_panoramas_admin_insert ON public.property_panoramas;
CREATE POLICY property_panoramas_admin_insert
  ON public.property_panoramas FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS property_panoramas_admin_update ON public.property_panoramas;
CREATE POLICY property_panoramas_admin_update
  ON public.property_panoramas FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS property_panoramas_admin_delete ON public.property_panoramas;
CREATE POLICY property_panoramas_admin_delete
  ON public.property_panoramas FOR DELETE TO authenticated
  USING (public.is_admin());

GRANT SELECT ON public.property_panoramas TO anon, authenticated;
GRANT INSERT, UPDATE, DELETE ON public.property_panoramas TO authenticated;

CREATE OR REPLACE FUNCTION public.set_property_panoramas_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_property_panoramas_updated_at ON public.property_panoramas;
CREATE TRIGGER trg_property_panoramas_updated_at
  BEFORE UPDATE ON public.property_panoramas
  FOR EACH ROW EXECUTE FUNCTION public.set_property_panoramas_updated_at();

REVOKE ALL ON FUNCTION public.set_property_panoramas_updated_at() FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS property_360_admin_select ON storage.objects;
CREATE POLICY property_360_admin_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'property-360'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS property_360_admin_insert ON storage.objects;
CREATE POLICY property_360_admin_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-360'
    AND public.is_admin()
    AND name ~ '^[0-9a-fA-F-]{36}/[^/]+[.](jpe?g|webp)$'
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id::text = split_part(name, '/', 1)
    )
  );

DROP POLICY IF EXISTS property_360_admin_update ON storage.objects;
CREATE POLICY property_360_admin_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'property-360' AND public.is_admin())
  WITH CHECK (bucket_id = 'property-360' AND public.is_admin());

DROP POLICY IF EXISTS property_360_admin_delete ON storage.objects;
CREATE POLICY property_360_admin_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'property-360' AND public.is_admin());

NOTIFY pgrst, 'reload schema';
COMMIT;
