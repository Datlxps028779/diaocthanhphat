-- =============================================================================
-- P3D: giữ nguyên public identity khi duyệt lại tin người dùng
--
-- P3A đã làm approval nguyên tử nhưng luôn INSERT property mới khi rejected/expired
-- được duyệt lại. Migration additive này tái sử dụng đúng inactive property đã liên
-- kết để giữ id/slug/public_code và mọi FK downstream. Listing chưa từng có property
-- vẫn đi qua INSERT như trước.
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
  v_prior_property_found boolean := false;
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

  IF v_listing.property_id IS NOT NULL THEN
    SELECT p.is_active
      INTO v_prior_property_active
      FROM public.properties p
     WHERE p.id = v_listing.property_id
     FOR UPDATE;
    v_prior_property_found := FOUND;

    IF v_listing.property_id IS NOT NULL AND NOT v_prior_property_found THEN
      RAISE EXCEPTION 'Property lịch sử liên kết không còn tồn tại; từ chối tạo identity thay thế'
        USING ERRCODE = 'P0001';
    END IF;

    IF v_prior_property_active THEN
      RAISE EXCEPTION 'Tin đăng còn property công khai liên kết; cần xử lý trạng thái hiện tại trước khi duyệt lại'
        USING ERRCODE = 'P0001';
    END IF;

    IF EXISTS (
      SELECT 1
        FROM public.user_listings other_listing
       WHERE other_listing.property_id = v_listing.property_id
         AND other_listing.id <> v_listing.id
    ) THEN
      RAISE EXCEPTION 'Property lịch sử đang được nhiều tin đăng tham chiếu; cần xử lý thủ công'
        USING ERRCODE = 'P0001';
    END IF;

    -- Chỉ đồng bộ field do user listing sở hữu. Không đổi id/slug/public_code,
    -- created_at/views hay trạng thái biên tập is_featured/is_hot/is_verified.
    UPDATE public.properties
       SET title = v_listing.title,
           description = v_listing.description,
           price = v_listing.price,
           price_unit = v_listing.price_unit,
           price_label = v_listing.price_label,
           price_per_month = v_listing.price_per_month,
           loan_support = v_listing.loan_support,
           listing_type = v_listing.listing_type,
           area_sqm = v_listing.area_sqm,
           address = v_listing.address,
           city = v_listing.city,
           district = v_listing.district,
           ward = v_listing.ward,
           area_id = v_listing.area_id,
           district_id = v_listing.district_id,
           neighborhood_slug = v_listing.neighborhood_slug,
           property_type_id = v_listing.property_type_id,
           image_url = v_listing.image_url,
           images = v_listing.images,
           legal_status = v_listing.legal_status,
           bedrooms = v_listing.bedrooms,
           bathrooms = v_listing.bathrooms,
           direction = v_listing.direction,
           contact_name = v_listing.contact_name,
           contact_phone = v_listing.contact_phone,
           contact_zalo = v_listing.contact_zalo,
           amenities = v_listing.amenities,
           tags = v_listing.tags,
           latitude = v_listing.latitude,
           longitude = v_listing.longitude,
           formatted_address = v_listing.formatted_address,
           vr_tour_url = v_listing.vr_tour_url,
           video_url = v_listing.video_url,
           meta_title = v_listing.meta_title,
           meta_description = v_listing.meta_description,
           focus_keywords = v_listing.focus_keywords,
           schema_markup = v_listing.schema_markup,
           faq = v_listing.faq,
           is_active = true,
           updated_at = v_now
     WHERE id = v_listing.property_id;

    v_property_id := v_listing.property_id;
  END IF;

  IF v_listing.property_id IS NULL THEN
    INSERT INTO public.properties (
      title, description,
      price, price_unit, price_label, price_per_month, loan_support, listing_type,
      area_sqm, address, city, district, ward,
      area_id, district_id, neighborhood_slug, property_type_id,
      image_url, images, legal_status,
      bedrooms, bathrooms, direction,
      contact_name, contact_phone, contact_zalo,
      amenities, tags, latitude, longitude, formatted_address, vr_tour_url, video_url,
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
      v_listing.amenities, v_listing.tags, v_listing.latitude, v_listing.longitude, v_listing.formatted_address, v_listing.vr_tour_url, v_listing.video_url,
      v_listing.meta_title, v_listing.meta_description, v_listing.focus_keywords, v_listing.schema_markup, v_listing.faq,
      true, false, false
    )
    RETURNING id INTO v_property_id;
  END IF;

  v_expires_at := CASE
    WHEN v_listing.expires_at IS NOT NULL AND v_listing.expires_at > v_now
      THEN v_listing.expires_at
    ELSE v_now + interval '60 days'
  END;

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
