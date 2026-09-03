-- P12/P18: listing moderation is an admin-only capability.
-- Customer assignment grants CRM support scope, never listing publication or content moderation.

DROP POLICY IF EXISTS "user_listings_admin_update" ON public.user_listings;
CREATE POLICY "user_listings_admin_update" ON public.user_listings
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

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
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "public_media_update_listing_review" ON storage.objects;
CREATE POLICY "public_media_update_listing_review" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'public-media'
    AND name LIKE 'listing-review/%/%'
    AND public.is_admin()
  )
  WITH CHECK (
    bucket_id = 'public-media'
    AND name LIKE 'listing-review/%/%'
    AND split_part(name, '/', 2) ~ '^[0-9a-fA-F-]{36}$'
    AND EXISTS (
      SELECT 1 FROM public.user_listings l
      WHERE l.id = split_part(name, '/', 2)::uuid AND l.status = 'pending'
    )
    AND public.is_admin()
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
    AND public.is_admin()
  );

-- Keep the existing atomic implementations private and expose admin-guarded wrappers.
ALTER FUNCTION public.approve_user_listing(uuid) RENAME TO approve_user_listing_legacy;
CREATE OR REPLACE FUNCTION public.approve_user_listing(p_listing_id uuid)
RETURNS TABLE (
  property_id uuid,
  title text,
  description text,
  city text,
  district text,
  listing_type text,
  price numeric,
  price_unit text,
  area_sqm numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Không có quyền duyệt tin đăng' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.approve_user_listing_legacy(p_listing_id);
END;
$$;
REVOKE ALL ON FUNCTION public.approve_user_listing_legacy(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.approve_user_listing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_user_listing(uuid) TO authenticated;

ALTER FUNCTION public.admin_update_pending_user_listing(uuid, jsonb) RENAME TO admin_update_pending_user_listing_legacy;
CREATE OR REPLACE FUNCTION public.admin_update_pending_user_listing(
  p_listing_id uuid,
  p_patch jsonb
)
RETURNS public.user_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Không có quyền chỉnh tin chờ duyệt' USING ERRCODE = '42501';
  END IF;
  RETURN public.admin_update_pending_user_listing_legacy(p_listing_id, p_patch);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_update_pending_user_listing_legacy(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_update_pending_user_listing(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_pending_user_listing(uuid, jsonb) TO authenticated;

ALTER FUNCTION public.admin_apply_user_listing_ai_seo(uuid) RENAME TO admin_apply_user_listing_ai_seo_legacy;
CREATE OR REPLACE FUNCTION public.admin_apply_user_listing_ai_seo(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Không có quyền áp dụng SEO AI' USING ERRCODE = '42501';
  END IF;
  PERFORM public.admin_apply_user_listing_ai_seo_legacy(p_listing_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_apply_user_listing_ai_seo_legacy(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_apply_user_listing_ai_seo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_apply_user_listing_ai_seo(uuid) TO authenticated;

ALTER FUNCTION public.admin_reject_user_listing_ai_seo(uuid) RENAME TO admin_reject_user_listing_ai_seo_legacy;
CREATE OR REPLACE FUNCTION public.admin_reject_user_listing_ai_seo(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Không có quyền bỏ SEO AI' USING ERRCODE = '42501';
  END IF;
  PERFORM public.admin_reject_user_listing_ai_seo_legacy(p_listing_id);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_reject_user_listing_ai_seo_legacy(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_reject_user_listing_ai_seo(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_reject_user_listing_ai_seo(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
