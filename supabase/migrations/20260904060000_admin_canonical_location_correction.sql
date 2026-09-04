-- =============================================================================
-- One-time admin RPC for the measured canonical location conflict
--
-- The RPC must be called through an authenticated admin session, not the SQL
-- Editor. The existing user_listings mutation trigger remains enabled and sees
-- the authenticated admin identity through auth.uid().
--
-- Scope is intentionally fixed to one measured pair and one known old snapshot.
-- No client-supplied location values are accepted.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.admin_correct_canonical_location_conflict()
RETURNS TABLE (
  listing_id uuid,
  property_id uuid,
  city text,
  district text,
  ward text,
  area_id uuid,
  district_id uuid,
  ward_id uuid,
  status text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing public.user_listings%ROWTYPE;
  v_property public.properties%ROWTYPE;
  v_updated public.user_listings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin đã đăng nhập mới được sửa correction này'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_listing
    FROM public.user_listings
   WHERE id = '3be55890-6ab2-455a-b3ef-daebd893f15d'::uuid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy listing correction mục tiêu'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
    INTO v_property
    FROM public.properties
   WHERE id = '823a968b-ec91-474f-8477-b989f1f1e01a'::uuid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy property correction mục tiêu'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_listing.property_id IS DISTINCT FROM v_property.id
     OR v_listing.status <> 'approved'
     OR v_listing.expires_at IS NULL
     OR v_listing.expires_at <= now()
     OR v_property.is_active IS NOT TRUE
     OR v_property.is_verified IS NOT FALSE
     OR v_property.verification_status <> 'unverified'
  THEN
    RAISE EXCEPTION 'Correction bị hủy: identity, lifecycle hoặc trust state đã thay đổi'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_listing.city IS DISTINCT FROM 'Đồng Nai'
     OR v_listing.district IS NOT NULL
     OR v_listing.ward IS DISTINCT FROM 'Nha Bích'
     OR v_listing.area_id IS DISTINCT FROM 'd1a0469f-acdc-4262-9f19-617c98e917fd'::uuid
     OR v_listing.district_id IS NOT NULL
     OR v_listing.ward_id IS NOT NULL
     OR v_listing.neighborhood_slug IS NOT NULL
  THEN
    RAISE EXCEPTION 'Correction bị hủy: snapshot location listing đã thay đổi'
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.areas AS a
      JOIN public.districts AS d
        ON d.id = v_property.district_id
       AND d.area_id = v_property.area_id
      JOIN public.wards AS w
        ON w.id = v_property.ward_id
       AND w.district_id = v_property.district_id
     WHERE a.id = v_property.area_id
       AND lower(regexp_replace(btrim(v_property.city), '\s+', ' ', 'g'))
         = lower(regexp_replace(btrim(a.name), '\s+', ' ', 'g'))
       AND lower(regexp_replace(btrim(v_property.district), '\s+', ' ', 'g'))
         = lower(regexp_replace(btrim(d.name), '\s+', ' ', 'g'))
       AND lower(regexp_replace(btrim(v_property.ward), '\s+', ' ', 'g'))
         = lower(regexp_replace(btrim(w.name), '\s+', ' ', 'g'))
  ) THEN
    RAISE EXCEPTION 'Correction bị hủy: property taxonomy không còn hợp lệ'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.user_listings
     SET city = v_property.city,
         district = v_property.district,
         ward = v_property.ward,
         area_id = v_property.area_id,
         district_id = v_property.district_id,
         ward_id = v_property.ward_id
   WHERE id = v_listing.id
   RETURNING * INTO v_updated;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction không cập nhật được listing mục tiêu'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    v_updated.id,
    v_updated.property_id,
    v_updated.city,
    v_updated.district,
    v_updated.ward,
    v_updated.area_id,
    v_updated.district_id,
    v_updated.ward_id,
    v_updated.status,
    v_updated.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_correct_canonical_location_conflict() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_correct_canonical_location_conflict() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- After the authenticated admin call succeeds and post-verification passes,
-- remove this one-time surface in a separately reviewed cleanup migration:
-- DROP FUNCTION public.admin_correct_canonical_location_conflict();
