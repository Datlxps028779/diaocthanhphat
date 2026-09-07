BEGIN;

-- Re-apply the admin-only approval boundary after the AI/identity migration and
-- promote listing panoramas only after the legacy approval has produced the property.
CREATE OR REPLACE FUNCTION public.approve_user_listing(
  p_listing_id uuid
)
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
DECLARE
  v_result record;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Không có quyền duyệt tin đăng' USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_result
    FROM public.approve_user_listing_legacy(p_listing_id);

  DELETE FROM public.property_panoramas
   WHERE property_id = v_result.property_id;

  INSERT INTO public.property_panoramas (
    property_id, storage_path, original_filename, mime_type, size_bytes,
    width, height, label, sort_order, is_active
  )
  SELECT
    v_result.property_id, p.storage_path, p.original_filename, p.mime_type, p.size_bytes,
    p.width, p.height, p.label, p.sort_order, p.is_active
    FROM public.user_listing_panoramas p
   WHERE p.user_listing_id = p_listing_id
   ORDER BY p.sort_order, p.created_at;

  RETURN QUERY SELECT
    v_result.property_id, v_result.title, v_result.description, v_result.city,
    v_result.district, v_result.listing_type, v_result.price, v_result.price_unit,
    v_result.area_sqm;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_user_listing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_user_listing(uuid) TO authenticated;

DROP POLICY IF EXISTS property_360_admin_user_listing_insert ON storage.objects;
CREATE POLICY property_360_admin_user_listing_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-360'
    AND public.is_admin()
    AND name ~ '^user-listings/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[^/]+[.](jpe?g|webp)$'
  );

NOTIFY pgrst, 'reload schema';
COMMIT;
