-- Public images must not share the owner-only admin-uploads bucket used for private documents.
BEGIN;

INSERT INTO storage.buckets (id, name, public)
VALUES ('public-media', 'public-media', true)
ON CONFLICT (id) DO UPDATE SET public = true;

DROP POLICY IF EXISTS "public_media_insert_owner" ON storage.objects;
CREATE POLICY "public_media_insert_owner" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'public-media' AND public.is_owner_mfa());

DROP POLICY IF EXISTS "public_media_update_owner" ON storage.objects;
CREATE POLICY "public_media_update_owner" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'public-media' AND public.is_owner_mfa())
  WITH CHECK (bucket_id = 'public-media' AND public.is_owner_mfa());

DROP POLICY IF EXISTS "public_media_delete_owner" ON storage.objects;
CREATE POLICY "public_media_delete_owner" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'public-media' AND public.is_owner_mfa());

NOTIFY pgrst, 'reload schema';
COMMIT;
