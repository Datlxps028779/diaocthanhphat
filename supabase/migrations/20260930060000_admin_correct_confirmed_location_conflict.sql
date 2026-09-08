-- One-time admin RPC for the confirmed property/listing location conflict.
-- Install this definition from the SQL Editor, then call the RPC through an
-- authenticated admin browser session so auth.uid() is available to triggers.

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_correct_confirmed_location_conflict()
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
  v_property public.properties%ROWTYPE;
  v_listing public.user_listings%ROWTYPE;
  v_updated public.user_listings%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin đã đăng nhập mới được sửa correction này'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_property
  FROM public.properties
  WHERE id = 'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy property correction mục tiêu'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_listing
  FROM public.user_listings
  WHERE id = '087b078e-a678-49aa-822f-ba26f038012a'::uuid
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy listing correction mục tiêu'
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

  IF v_property.city IS DISTINCT FROM 'Bình Dương'
     OR v_property.district IS DISTINCT FROM 'Dầu Tiếng'
     OR v_property.ward IS DISTINCT FROM 'Long Hòa'
     OR v_property.area_id IS DISTINCT FROM '5123a414-294d-4738-b152-744bedacb448'::uuid
     OR v_property.district_id IS DISTINCT FROM '06514619-4f00-49b6-b80b-b4d6d131746d'::uuid
     OR v_property.ward_id IS DISTINCT FROM 'a18aa409-a2d5-468d-b9aa-dc2fbd56b5f3'::uuid
     OR v_property.latitude IS NULL
     OR v_property.longitude IS NULL
     OR NOT public.taxonomy_geo_covers_point('ward', v_property.ward_id, v_property.latitude, v_property.longitude)
  THEN
    RAISE EXCEPTION 'Correction bị hủy: snapshot hoặc tọa độ property đã thay đổi'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_listing.city IS DISTINCT FROM 'TP. Hồ Chí Minh'
     OR v_listing.district IS DISTINCT FROM 'Cần Giờ'
     OR v_listing.ward IS DISTINCT FROM 'Long Hòa'
     OR v_listing.area_id IS DISTINCT FROM '37cad24c-afa9-47e7-a0b9-d1351c74f1fc'::uuid
     OR v_listing.district_id IS DISTINCT FROM 'acf04041-b171-4f2f-ab4c-0ba288968775'::uuid
     OR v_listing.ward_id IS DISTINCT FROM 'd50fcc80-798b-4fce-a162-7f9ee00cf18e'::uuid
     OR v_listing.neighborhood_slug IS NOT NULL
     OR v_listing.latitude IS NOT NULL
     OR v_listing.longitude IS NOT NULL
     OR public.taxonomy_geo_covers_point('ward', v_listing.ward_id, v_property.latitude, v_property.longitude)
  THEN
    RAISE EXCEPTION 'Correction bị hủy: snapshot listing hoặc conflict evidence đã thay đổi'
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

  RETURN QUERY SELECT
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

REVOKE ALL ON FUNCTION public.admin_correct_confirmed_location_conflict() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_correct_confirmed_location_conflict() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
