-- =============================================================================
-- P3A: duyệt tin người dùng trong một transaction nguyên tử
--
-- Vấn đề: client trước đây INSERT properties rồi UPDATE user_listings ở hai câu
-- độc lập. Dù có compensating delete, hai admin/retry đồng thời vẫn có thể sinh
-- property trùng hoặc property mồ côi. RPC này khóa listing và thực hiện hai bước
-- trong cùng một transaction PostgreSQL.
--
-- Không thay đổi URL, field tương thích hay trigger hiện có:
-- - trg_hide_property_on_unpublish vẫn ẩn property khi listing rời approved/xóa.
-- - trg_*_location_integrity tiếp tục kiểm các field location khi INSERT property.
-- - property slug vẫn do trigger set_property_slug() hiện có sinh từ title.
-- =============================================================================

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
  v_listing public.user_listings%ROWTYPE;
  v_property_id uuid;
  v_expires_at timestamptz;
  v_prior_property_active boolean;
  v_now timestamptz := now();
BEGIN
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền duyệt tin đăng'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
    INTO v_listing
    FROM public.user_listings
   WHERE id = p_listing_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tin đăng'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_listing.status = 'approved' THEN
    RAISE EXCEPTION 'Tin đăng đã được duyệt; không thể duyệt trùng'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_listing.status NOT IN ('pending', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'Trạng thái tin đăng không thể duyệt: %', v_listing.status
      USING ERRCODE = 'P0001';
  END IF;

  -- Rejected/expired listing có thể giữ property lịch sử đã bị trigger ẩn. Nếu
  -- property đó vẫn public thì fail closed thay vì tạo thêm một bản công khai.
  IF v_listing.property_id IS NOT NULL THEN
    SELECT p.is_active
      INTO v_prior_property_active
      FROM public.properties p
     WHERE p.id = v_listing.property_id
     FOR UPDATE;

    IF COALESCE(v_prior_property_active, false) THEN
      RAISE EXCEPTION 'Tin đăng còn property công khai liên kết; cần xử lý trạng thái hiện tại trước khi duyệt lại'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_expires_at := CASE
    WHEN v_listing.expires_at IS NOT NULL AND v_listing.expires_at > v_now
      THEN v_listing.expires_at
    ELSE v_now + interval '60 days'
  END;

  INSERT INTO public.properties (
    title, description,
    price, price_unit, price_label, price_per_month, loan_support, listing_type,
    area_sqm, address, city, district, ward,
    area_id, district_id, neighborhood_slug, property_type_id,
    image_url, images, legal_status,
    bedrooms, bathrooms, direction,
    contact_name, contact_phone, contact_zalo,
    amenities, latitude, longitude, formatted_address, vr_tour_url, video_url,
    meta_title, meta_description, focus_keywords, schema_markup, faq,
    is_active, is_featured, is_hot
  ) VALUES (
    v_listing.title, v_listing.description,
    v_listing.price, v_listing.price_unit, v_listing.price_label, v_listing.price_per_month, v_listing.loan_support, v_listing.listing_type,
    v_listing.area_sqm, v_listing.address, v_listing.city, v_listing.district, v_listing.ward,
    v_listing.area_id, v_listing.district_id, v_listing.neighborhood_slug, v_listing.property_type_id,
    v_listing.image_url, v_listing.images, v_listing.legal_status,
    v_listing.bedrooms, v_listing.bathrooms, v_listing.direction,
    v_listing.contact_name, v_listing.contact_phone, v_listing.contact_zalo,
    v_listing.amenities, v_listing.latitude, v_listing.longitude, v_listing.formatted_address, v_listing.vr_tour_url, v_listing.video_url,
    v_listing.meta_title, v_listing.meta_description, v_listing.focus_keywords, v_listing.schema_markup, v_listing.faq,
    true, false, false
  )
  RETURNING id INTO v_property_id;

  UPDATE public.user_listings
     SET status = 'approved',
         property_id = v_property_id,
         expires_at = v_expires_at,
         reject_reason = NULL
   WHERE id = v_listing.id;

  RETURN QUERY
  SELECT
    v_property_id,
    v_listing.title,
    v_listing.description,
    v_listing.city,
    v_listing.district,
    v_listing.listing_type,
    v_listing.price,
    v_listing.price_unit,
    v_listing.area_sqm;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_user_listing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_user_listing(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
