-- Staff/admin may upload review-only media under a listing-scoped namespace.
-- Public media remains readable, but ordinary users cannot write this namespace.
DROP POLICY IF EXISTS "public_media_insert_listing_review" ON storage.objects;
CREATE POLICY "public_media_insert_listing_review" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'public-media'
    AND name LIKE 'listing-review/%/%'
    AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1 FROM public.user_listings l
       WHERE l.id = split_part(name, '/', 2)::uuid AND l.status = 'pending'
    )
    AND public.is_admin_or_staff()
  );

DROP POLICY IF EXISTS "public_media_update_listing_review" ON storage.objects;
CREATE POLICY "public_media_update_listing_review" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'public-media'
    AND name LIKE 'listing-review/%/%'
    AND public.is_admin_or_staff()
  )
  WITH CHECK (
    bucket_id = 'public-media'
    AND name LIKE 'listing-review/%/%'
    AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1 FROM public.user_listings l
       WHERE l.id = split_part(name, '/', 2)::uuid AND l.status = 'pending'
    )
    AND public.is_admin_or_staff()
  );

DROP POLICY IF EXISTS "public_media_delete_listing_review" ON storage.objects;
CREATE POLICY "public_media_delete_listing_review" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'public-media'
    AND name LIKE 'listing-review/%/%'
    AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1 FROM public.user_listings l
       WHERE l.id = split_part(name, '/', 2)::uuid AND l.status = 'pending'
    )
    AND public.is_admin_or_staff()
  );
