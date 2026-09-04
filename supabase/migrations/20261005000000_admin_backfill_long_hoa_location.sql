-- Guarded one-time correction for the two exact-unique Long Hòa rows.
-- The function accepts no client-supplied location values or IDs.
-- It changes only district text, district_id, and ward_id on the fixed property/listing pair.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_backfill_long_hoa_location()
RETURNS TABLE (
  source text,
  record_id uuid,
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
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_property public.properties%ROWTYPE;
  v_listing public.user_listings%ROWTYPE;
  v_updated_property public.properties%ROWTYPE;
  v_updated_listing public.user_listings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin đã đăng nhập mới được sửa correction này'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.areas AS a
    JOIN public.districts AS d
      ON d.id = 'acf04041-b171-4f2f-ab4c-0ba288968775'::uuid
     AND d.area_id = a.id
    JOIN public.wards AS w
      ON w.id = 'd50fcc80-798b-4fce-a162-7f9ee00cf18e'::uuid
     AND w.district_id = d.id
    WHERE a.id = '37cad24c-afa9-47e7-a0b9-d1351c74f1fc'::uuid
      AND public.normalize_location_label(a.name) = public.normalize_location_label('TP. Hồ Chí Minh')
      AND public.normalize_location_label(d.name) = public.normalize_location_label('Cần Giờ')
      AND public.normalize_location_label(w.name) = public.normalize_location_label('Long Hòa')
  ) THEN
    RAISE EXCEPTION 'Correction bị hủy: canonical taxonomy Long Hòa không còn hợp lệ'
      USING ERRCODE = 'P0001';
  END IF;

  SELECT *
    INTO v_property
    FROM public.properties
   WHERE id = 'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy property correction mục tiêu'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT *
    INTO v_listing
    FROM public.user_listings
   WHERE id = '087b078e-a678-49aa-822f-ba26f038012a'::uuid
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy listing correction mục tiêu'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_property.id <> 'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid
     OR v_property.is_active IS NOT TRUE
     OR v_property.is_verified IS NOT FALSE
     OR v_property.verification_status <> 'unverified'
     OR v_property.city IS DISTINCT FROM 'TP. Hồ Chí Minh'
     OR v_property.district IS NOT NULL
     OR v_property.ward IS DISTINCT FROM 'Long Hòa'
     OR v_property.area_id IS DISTINCT FROM '37cad24c-afa9-47e7-a0b9-d1351c74f1fc'::uuid
     OR v_property.district_id IS NOT NULL
     OR v_property.ward_id IS NOT NULL
     OR v_property.neighborhood_slug IS NOT NULL
     OR v_property.latitude IS NOT NULL
     OR v_property.longitude IS NOT NULL
  THEN
    RAISE EXCEPTION 'Correction bị hủy: snapshot property đã thay đổi'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_listing.property_id IS DISTINCT FROM v_property.id
     OR v_listing.status <> 'approved'
     OR v_listing.expires_at IS NULL
     OR v_listing.expires_at <= now()
     OR v_listing.city IS DISTINCT FROM 'TP. Hồ Chí Minh'
     OR v_listing.district IS NOT NULL
     OR v_listing.ward IS DISTINCT FROM 'Long Hòa'
     OR v_listing.area_id IS DISTINCT FROM '37cad24c-afa9-47e7-a0b9-d1351c74f1fc'::uuid
     OR v_listing.district_id IS NOT NULL
     OR v_listing.ward_id IS NOT NULL
     OR v_listing.neighborhood_slug IS NOT NULL
     OR v_listing.latitude IS NOT NULL
     OR v_listing.longitude IS NOT NULL
  THEN
    RAISE EXCEPTION 'Correction bị hủy: snapshot listing hoặc identity đã thay đổi'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.properties
     SET district = 'Cần Giờ',
         district_id = 'acf04041-b171-4f2f-ab4c-0ba288968775'::uuid,
         ward_id = 'd50fcc80-798b-4fce-a162-7f9ee00cf18e'::uuid
   WHERE id = v_property.id
   RETURNING * INTO v_updated_property;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction không cập nhật được property mục tiêu'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.user_listings
     SET district = 'Cần Giờ',
         district_id = 'acf04041-b171-4f2f-ab4c-0ba288968775'::uuid,
         ward_id = 'd50fcc80-798b-4fce-a162-7f9ee00cf18e'::uuid
   WHERE id = v_listing.id
   RETURNING * INTO v_updated_listing;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Correction không cập nhật được listing mục tiêu'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT
    'properties'::text,
    v_updated_property.id,
    v_updated_property.id,
    v_updated_property.city,
    v_updated_property.district,
    v_updated_property.ward,
    v_updated_property.area_id,
    v_updated_property.district_id,
    v_updated_property.ward_id,
    NULL::text,
    NULL::timestamptz
  UNION ALL
  SELECT
    'user_listings'::text,
    v_updated_listing.id,
    v_updated_listing.property_id,
    v_updated_listing.city,
    v_updated_listing.district,
    v_updated_listing.ward,
    v_updated_listing.area_id,
    v_updated_listing.district_id,
    v_updated_listing.ward_id,
    v_updated_listing.status,
    v_updated_listing.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_backfill_long_hoa_location() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_backfill_long_hoa_location() TO authenticated;

NOTIFY pgrst, 'reload schema';

-- Keep this one-time function until the authenticated admin call and postcheck pass.
-- Then remove it in a separately reviewed cleanup migration:
-- DROP FUNCTION public.admin_backfill_long_hoa_location();

COMMIT;
