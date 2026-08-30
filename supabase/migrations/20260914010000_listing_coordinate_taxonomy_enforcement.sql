-- Fail-closed hierarchy and point-in-polygon enforcement.
-- Run only after polygon seed, foundation, repair dry-run, any approved repair,
-- and deployment of the ward_id-aware frontend.

-- Close the rollout window safely: old frontend instances may create rows after
-- foundation with canonical district/ward text but no ward_id. Backfill only a
-- unique parent-scoped match, and only preserve coordinates when the point is
-- already covered by that exact ward polygon.
UPDATE public.user_listings listing
SET ward_id = ward.id
FROM public.wards ward
WHERE listing.ward_id IS NULL
  AND listing.district_id = ward.district_id
  AND public.normalize_location_label(listing.ward) = public.normalize_location_label(ward.name)
  AND 1 = (
    SELECT count(*) FROM public.wards candidate
    WHERE candidate.district_id = listing.district_id
      AND public.normalize_location_label(candidate.name) = public.normalize_location_label(listing.ward)
  )
  AND (
    (listing.latitude IS NULL AND listing.longitude IS NULL)
    OR (listing.latitude IS NOT NULL AND listing.longitude IS NOT NULL
      AND public.taxonomy_geo_covers_point('ward', ward.id, listing.latitude, listing.longitude))
  );

UPDATE public.properties property
SET ward_id = ward.id
FROM public.wards ward
WHERE property.ward_id IS NULL
  AND property.district_id = ward.district_id
  AND public.normalize_location_label(property.ward) = public.normalize_location_label(ward.name)
  AND 1 = (
    SELECT count(*) FROM public.wards candidate
    WHERE candidate.district_id = property.district_id
      AND public.normalize_location_label(candidate.name) = public.normalize_location_label(property.ward)
  )
  AND (
    (property.latitude IS NULL AND property.longitude IS NULL)
    OR (property.latitude IS NOT NULL AND property.longitude IS NOT NULL
      AND public.taxonomy_geo_covers_point('ward', ward.id, property.latitude, property.longitude))
  );

DO $$
DECLARE
  v_invalid bigint;
BEGIN
  SELECT count(*) INTO v_invalid
  FROM (
    SELECT listing.ward_id, listing.latitude, listing.longitude
    FROM public.user_listings listing
    WHERE listing.latitude IS NOT NULL OR listing.longitude IS NOT NULL
    UNION ALL
    SELECT property.ward_id, property.latitude, property.longitude
    FROM public.properties property
    WHERE property.latitude IS NOT NULL OR property.longitude IS NOT NULL
  ) row
  WHERE row.latitude IS NULL OR row.longitude IS NULL
     OR row.ward_id IS NULL
     OR NOT public.taxonomy_geo_covers_point('ward', row.ward_id, row.latitude, row.longitude);

  IF v_invalid > 0 THEN
    RAISE EXCEPTION 'Không thể bật coordinate enforcement: còn % dòng tọa độ lịch sử chưa hợp lệ. Chạy repair dry-run và xử lý trước.', v_invalid;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.validate_listing_location_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  selected_area public.areas%ROWTYPE;
  selected_district public.districts%ROWTYPE;
  selected_ward public.wards%ROWTYPE;
  selected_neighborhood public.neighborhoods%ROWTYPE;
  neighborhood_ward public.wards%ROWTYPE;
  effective_district_id uuid;
  effective_area_id uuid;
  district_match_count integer;
  ward_match_count integer;
  neighborhood_area_id uuid;
  neighborhood_district_id uuid;
BEGIN
  IF NEW.area_id IS NOT NULL THEN
    SELECT * INTO selected_area FROM public.areas WHERE id = NEW.area_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tỉnh/thành phố đã chọn không còn tồn tại trong taxonomy.' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(btrim(NEW.city), '') IS NOT NULL
       AND public.normalize_location_label(NEW.city) <> public.normalize_location_label(selected_area.name) THEN
      RAISE EXCEPTION 'Tên tỉnh/thành phố không khớp với mã tỉnh/thành đã chọn.' USING ERRCODE = '22023';
    END IF;
    NEW.city := selected_area.name;
  END IF;

  IF NEW.district_id IS NOT NULL THEN
    SELECT * INTO selected_district FROM public.districts WHERE id = NEW.district_id;
    IF NOT FOUND OR selected_district.area_id IS NULL THEN
      RAISE EXCEPTION 'Quận/huyện đã chọn không có hierarchy tỉnh/thành hợp lệ.' USING ERRCODE = '22023';
    END IF;
    effective_district_id := selected_district.id;
    effective_area_id := selected_district.area_id;

    IF NEW.area_id IS NOT NULL AND selected_district.area_id <> NEW.area_id THEN
      RAISE EXCEPTION 'Quận/huyện đã chọn không thuộc tỉnh/thành phố đã chọn.' USING ERRCODE = '22023';
    END IF;
    IF public.normalize_location_label(NEW.district) IS NOT NULL
       AND public.normalize_location_label(NEW.district) <> public.normalize_location_label(selected_district.name) THEN
      RAISE EXCEPTION 'Tên quận/huyện không khớp với quận/huyện đã chọn.' USING ERRCODE = '22023';
    END IF;
    NEW.district := selected_district.name;
  ELSIF NEW.area_id IS NOT NULL AND public.normalize_location_label(NEW.district) IS NOT NULL THEN
    SELECT count(*) INTO district_match_count
    FROM public.districts district_row
    WHERE district_row.area_id = NEW.area_id
      AND public.normalize_location_label(district_row.name) = public.normalize_location_label(NEW.district);
    IF district_match_count > 1 THEN
      RAISE EXCEPTION 'Tên quận/huyện khớp nhiều taxonomy trong tỉnh/thành đã chọn.' USING ERRCODE = '22023';
    ELSIF district_match_count = 1 THEN
      SELECT * INTO selected_district
      FROM public.districts district_row
      WHERE district_row.area_id = NEW.area_id
        AND public.normalize_location_label(district_row.name) = public.normalize_location_label(NEW.district);
      NEW.district_id := selected_district.id;
      NEW.district := selected_district.name;
      effective_district_id := selected_district.id;
      effective_area_id := selected_district.area_id;
    END IF;
  END IF;

  IF NEW.ward_id IS NOT NULL THEN
    SELECT * INTO selected_ward FROM public.wards WHERE id = NEW.ward_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Xã/phường đã chọn không còn tồn tại trong taxonomy.' USING ERRCODE = '22023';
    END IF;
    IF effective_district_id IS NULL THEN
      SELECT * INTO selected_district FROM public.districts WHERE id = selected_ward.district_id;
      IF NOT FOUND OR selected_district.area_id IS NULL THEN
        RAISE EXCEPTION 'Xã/phường đã chọn không có hierarchy quận/huyện và tỉnh/thành hợp lệ.' USING ERRCODE = '22023';
      END IF;
      effective_district_id := selected_district.id;
      effective_area_id := selected_district.area_id;
      NEW.district_id := selected_district.id;
      NEW.district := selected_district.name;
    ELSIF selected_ward.district_id <> effective_district_id THEN
      RAISE EXCEPTION 'Xã/phường đã chọn không thuộc quận/huyện đã chọn.' USING ERRCODE = '22023';
    END IF;
    IF NEW.area_id IS NOT NULL AND effective_area_id <> NEW.area_id THEN
      RAISE EXCEPTION 'Xã/phường đã chọn không thuộc tỉnh/thành phố đã chọn.' USING ERRCODE = '22023';
    END IF;
    IF public.normalize_location_label(NEW.ward) IS NOT NULL
       AND public.normalize_location_label(NEW.ward) <> public.normalize_location_label(selected_ward.name) THEN
      RAISE EXCEPTION 'Tên xã/phường không khớp với mã xã/phường đã chọn.' USING ERRCODE = '22023';
    END IF;
    NEW.ward := selected_ward.name;
  ELSIF effective_district_id IS NOT NULL AND public.normalize_location_label(NEW.ward) IS NOT NULL THEN
    SELECT count(*) INTO ward_match_count
    FROM public.wards ward_row
    WHERE ward_row.district_id = effective_district_id
      AND public.normalize_location_label(ward_row.name) = public.normalize_location_label(NEW.ward);
    IF ward_match_count > 1 THEN
      RAISE EXCEPTION 'Tên xã/phường khớp nhiều taxonomy trong quận/huyện đã chọn.' USING ERRCODE = '22023';
    ELSIF ward_match_count = 1 THEN
      SELECT * INTO selected_ward
      FROM public.wards ward_row
      WHERE ward_row.district_id = effective_district_id
        AND public.normalize_location_label(ward_row.name) = public.normalize_location_label(NEW.ward);
      NEW.ward_id := selected_ward.id;
      NEW.ward := selected_ward.name;
    END IF;
  END IF;

  IF NEW.area_id IS NULL AND effective_area_id IS NOT NULL THEN
    NEW.area_id := effective_area_id;
    SELECT * INTO selected_area FROM public.areas WHERE id = effective_area_id;
    NEW.city := selected_area.name;
  END IF;

  IF NEW.neighborhood_slug IS NOT NULL AND btrim(NEW.neighborhood_slug) <> '' THEN
    SELECT * INTO selected_neighborhood
    FROM public.neighborhoods WHERE slug = NEW.neighborhood_slug;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Khu dân cư đã chọn không còn tồn tại.' USING ERRCODE = '22023';
    END IF;
    IF selected_neighborhood.ward_id IS NOT NULL THEN
      SELECT * INTO neighborhood_ward FROM public.wards WHERE id = selected_neighborhood.ward_id;
    END IF;
    neighborhood_district_id := COALESCE(selected_neighborhood.district_id, neighborhood_ward.district_id);
    neighborhood_area_id := selected_neighborhood.area_id;
    IF neighborhood_area_id IS NULL AND neighborhood_district_id IS NOT NULL THEN
      SELECT area_id INTO neighborhood_area_id FROM public.districts WHERE id = neighborhood_district_id;
    END IF;
    IF NEW.area_id IS NOT NULL AND neighborhood_area_id IS NOT NULL AND neighborhood_area_id <> NEW.area_id THEN
      RAISE EXCEPTION 'Khu dân cư đã chọn không thuộc tỉnh/thành phố đã chọn.' USING ERRCODE = '22023';
    END IF;
    IF effective_district_id IS NOT NULL AND neighborhood_district_id IS NOT NULL AND neighborhood_district_id <> effective_district_id THEN
      RAISE EXCEPTION 'Khu dân cư đã chọn không thuộc quận/huyện đã chọn.' USING ERRCODE = '22023';
    END IF;
    IF NEW.ward_id IS NOT NULL AND selected_neighborhood.ward_id IS NOT NULL AND selected_neighborhood.ward_id <> NEW.ward_id THEN
      RAISE EXCEPTION 'Khu dân cư đã chọn không thuộc xã/phường đã chọn.' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF (NEW.latitude IS NULL) <> (NEW.longitude IS NULL) THEN
    RAISE EXCEPTION 'Vị trí bản đồ phải có đủ vĩ độ và kinh độ.' USING ERRCODE = '22023';
  END IF;
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    IF NEW.ward_id IS NULL THEN
      RAISE EXCEPTION 'Phải chọn mã xã/phường trước khi lưu tọa độ.' USING ERRCODE = '22023';
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.taxonomy_geo geo
      WHERE geo.entity_type = 'ward'
        AND geo.entity_id = NEW.ward_id
        AND geo.is_published
        AND geo.administrative_vintage = 'legacy_pre_merger'
        AND geo.geojson IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'Xã/phường đã chọn chưa có polygon xác minh; không được lưu tọa độ ước lượng.' USING ERRCODE = '22023';
    END IF;
    IF NOT public.taxonomy_geo_covers_point('ward', NEW.ward_id, NEW.latitude, NEW.longitude) THEN
      RAISE EXCEPTION 'Tọa độ nằm ngoài ranh giới xã/phường đã chọn.' USING ERRCODE = '22023';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.validate_listing_location_integrity()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_properties_location_integrity ON public.properties;
CREATE TRIGGER trg_properties_location_integrity
  BEFORE INSERT OR UPDATE OF area_id, district_id, ward_id, district, ward, neighborhood_slug, latitude, longitude
  ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.validate_listing_location_integrity();

DROP TRIGGER IF EXISTS trg_user_listings_location_integrity ON public.user_listings;
CREATE TRIGGER trg_user_listings_location_integrity
  BEFORE INSERT OR UPDATE OF area_id, district_id, ward_id, district, ward, neighborhood_slug, latitude, longitude
  ON public.user_listings
  FOR EACH ROW EXECUTE FUNCTION public.validate_listing_location_integrity();

CREATE OR REPLACE FUNCTION public.guard_pending_user_listing_quality()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    IF NULLIF(btrim(NEW.title), '') IS NULL OR char_length(NEW.title) > 120 THEN
      RAISE EXCEPTION 'Tiêu đề tin bắt buộc và tối đa 120 ký tự' USING ERRCODE = '22023';
    END IF;
    IF NEW.listing_type = 'mua_ban' AND (NEW.price IS NULL OR NEW.price <= 0) THEN
      RAISE EXCEPTION 'Giá bán phải lớn hơn 0' USING ERRCODE = '22023';
    END IF;
    IF NEW.listing_type = 'cho_thue' AND COALESCE(NEW.price_per_month, NEW.price) <= 0 THEN
      RAISE EXCEPTION 'Giá thuê phải lớn hơn 0' USING ERRCODE = '22023';
    END IF;
    IF NEW.listing_type = 'cho_thue' AND NEW.loan_support IS NOT NULL THEN
      RAISE EXCEPTION 'Tin cho thuê không được có khoản vay' USING ERRCODE = '22023';
    END IF;
    IF NEW.listing_type = 'mua_ban' AND NEW.loan_support IS NOT NULL AND (NEW.loan_support <= 0 OR NEW.loan_support >= NEW.price) THEN
      RAISE EXCEPTION 'Khoản vay phải lớn hơn 0 và nhỏ hơn giá bán' USING ERRCODE = '22023';
    END IF;
    IF NEW.image_url IS NULL AND COALESCE(array_length(NEW.images, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Tin đăng cần ít nhất một ảnh' USING ERRCODE = '22023';
    END IF;
    IF length(public.listing_plain_text(NEW.description)) < 80 THEN
      RAISE EXCEPTION 'Mô tả tin đăng cần ít nhất 80 ký tự có nội dung' USING ERRCODE = '22023';
    END IF;
    IF NEW.area_id IS NULL OR NEW.district_id IS NULL OR NEW.ward_id IS NULL THEN
      RAISE EXCEPTION 'Cần chọn đủ tỉnh/thành, quận/huyện và xã/phường từ taxonomy' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(btrim(NEW.city), '') IS NULL OR ((NULLIF(btrim(NEW.address), '') IS NULL) AND (NEW.latitude IS NULL OR NEW.longitude IS NULL)) THEN
      RAISE EXCEPTION 'Cần có tỉnh/thành và địa chỉ hoặc vị trí bản đồ hợp lệ' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_user_listing_quality() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_pending_user_listing_quality ON public.user_listings;
CREATE TRIGGER trg_guard_pending_user_listing_quality
BEFORE INSERT OR UPDATE OF status, title, description, image_url, images, listing_type, price, price_per_month, loan_support, city, address, area_id, district_id, ward_id, latitude, longitude
ON public.user_listings
FOR EACH ROW EXECUTE FUNCTION public.guard_pending_user_listing_quality();

CREATE OR REPLACE FUNCTION public.admin_update_pending_user_listing(
  p_listing_id uuid,
  p_patch jsonb
)
RETURNS public.user_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_listing public.user_listings%ROWTYPE;
  v_next public.user_listings%ROWTYPE;
  v_allowed jsonb;
BEGIN
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền chỉnh tin chờ duyệt' USING ERRCODE = '42501';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Dữ liệu chỉnh sửa không hợp lệ' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_listing FROM public.user_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tin đăng' USING ERRCODE = 'P0002'; END IF;
  IF v_listing.status <> 'pending' THEN RAISE EXCEPTION 'Chỉ được chỉnh tin đang chờ duyệt' USING ERRCODE = 'P0001'; END IF;

  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
  INTO v_allowed
  FROM jsonb_each(p_patch)
  WHERE key IN (
    'title', 'description', 'price', 'price_unit', 'price_label', 'listing_type',
    'price_per_month', 'loan_support', 'area_sqm', 'address', 'city', 'district',
    'ward', 'neighborhood_slug', 'area_id', 'district_id', 'ward_id', 'property_type_id',
    'image_url', 'images', 'legal_status', 'bedrooms', 'bathrooms', 'direction',
    'contact_name', 'contact_phone', 'contact_zalo', 'amenities', 'latitude',
    'longitude', 'formatted_address', 'vr_tour_url', 'video_url', 'meta_title',
    'meta_description', 'focus_keywords', 'schema_markup', 'faq'
  );
  v_next := jsonb_populate_record(v_listing, v_allowed);

  UPDATE public.user_listings
  SET title = v_next.title, description = v_next.description,
      price = v_next.price, price_unit = v_next.price_unit, price_label = v_next.price_label,
      listing_type = v_next.listing_type, price_per_month = v_next.price_per_month,
      loan_support = v_next.loan_support, area_sqm = v_next.area_sqm,
      address = v_next.address, city = v_next.city, district = v_next.district,
      ward = v_next.ward, neighborhood_slug = v_next.neighborhood_slug,
      area_id = v_next.area_id, district_id = v_next.district_id, ward_id = v_next.ward_id,
      property_type_id = v_next.property_type_id, image_url = v_next.image_url,
      images = v_next.images, legal_status = v_next.legal_status,
      bedrooms = v_next.bedrooms, bathrooms = v_next.bathrooms, direction = v_next.direction,
      contact_name = v_next.contact_name, contact_phone = v_next.contact_phone,
      contact_zalo = v_next.contact_zalo, amenities = v_next.amenities,
      latitude = v_next.latitude, longitude = v_next.longitude,
      formatted_address = v_next.formatted_address, vr_tour_url = v_next.vr_tour_url,
      video_url = v_next.video_url, meta_title = v_next.meta_title,
      meta_description = v_next.meta_description, focus_keywords = v_next.focus_keywords,
      schema_markup = v_next.schema_markup, faq = v_next.faq,
      reject_reason = NULL, updated_at = now()
  WHERE id = p_listing_id
  RETURNING * INTO v_next;
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_pending_user_listing(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_pending_user_listing(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.approve_user_listing(p_listing_id uuid)
RETURNS TABLE (
  property_id uuid, title text, description text, city text, district text,
  listing_type text, price numeric, price_unit text, area_sqm numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
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
    RAISE EXCEPTION 'Không có quyền duyệt tin đăng' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_listing FROM public.user_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tin đăng' USING ERRCODE = 'P0002'; END IF;
  IF v_listing.status = 'approved' THEN RAISE EXCEPTION 'Tin đăng đã được duyệt; không thể duyệt trùng' USING ERRCODE = 'P0001'; END IF;
  IF v_listing.status NOT IN ('pending', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'Trạng thái tin đăng không thể duyệt: %', v_listing.status USING ERRCODE = 'P0001';
  END IF;
  IF v_listing.area_id IS NULL OR v_listing.district_id IS NULL OR v_listing.ward_id IS NULL THEN
    RAISE EXCEPTION 'Tin đăng chưa có đủ mã tỉnh/thành, quận/huyện và xã/phường để duyệt' USING ERRCODE = '22023';
  END IF;
  IF v_listing.latitude IS NOT NULL AND NOT public.taxonomy_geo_covers_point(
    'ward', v_listing.ward_id, v_listing.latitude, v_listing.longitude
  ) THEN
    RAISE EXCEPTION 'Tọa độ tin đăng nằm ngoài ranh giới xã/phường đã chọn' USING ERRCODE = '22023';
  END IF;

  IF v_listing.property_id IS NOT NULL THEN
    SELECT property.is_active INTO v_prior_property_active
    FROM public.properties property WHERE property.id = v_listing.property_id FOR UPDATE;
    v_prior_property_found := FOUND;
    IF NOT v_prior_property_found THEN
      RAISE EXCEPTION 'Property lịch sử liên kết không còn tồn tại; từ chối tạo identity thay thế' USING ERRCODE = 'P0001';
    END IF;
    IF v_prior_property_active THEN
      RAISE EXCEPTION 'Tin đăng còn property công khai liên kết; cần xử lý trạng thái hiện tại trước khi duyệt lại' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (SELECT 1 FROM public.user_listings other WHERE other.property_id = v_listing.property_id AND other.id <> v_listing.id) THEN
      RAISE EXCEPTION 'Property lịch sử đang được nhiều tin đăng tham chiếu; cần xử lý thủ công' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.properties
    SET title = v_listing.title, description = v_listing.description,
        price = v_listing.price, price_unit = v_listing.price_unit, price_label = v_listing.price_label,
        price_per_month = v_listing.price_per_month, loan_support = v_listing.loan_support,
        listing_type = v_listing.listing_type, area_sqm = v_listing.area_sqm,
        address = v_listing.address, city = v_listing.city, district = v_listing.district,
        ward = v_listing.ward, area_id = v_listing.area_id, district_id = v_listing.district_id,
        ward_id = v_listing.ward_id, neighborhood_slug = v_listing.neighborhood_slug,
        property_type_id = v_listing.property_type_id, image_url = v_listing.image_url,
        images = v_listing.images, legal_status = v_listing.legal_status,
        bedrooms = v_listing.bedrooms, bathrooms = v_listing.bathrooms, direction = v_listing.direction,
        contact_name = v_listing.contact_name, contact_phone = v_listing.contact_phone,
        contact_zalo = v_listing.contact_zalo, amenities = v_listing.amenities, tags = v_listing.tags,
        latitude = v_listing.latitude, longitude = v_listing.longitude,
        formatted_address = v_listing.formatted_address, vr_tour_url = v_listing.vr_tour_url,
        video_url = v_listing.video_url, meta_title = v_listing.meta_title,
        meta_description = v_listing.meta_description, focus_keywords = v_listing.focus_keywords,
        schema_markup = v_listing.schema_markup, faq = v_listing.faq,
        is_active = true, updated_at = v_now
    WHERE id = v_listing.property_id;
    v_property_id := v_listing.property_id;
  ELSE
    INSERT INTO public.properties (
      title, description, price, price_unit, price_label, price_per_month, loan_support,
      listing_type, area_sqm, address, city, district, ward, area_id, district_id, ward_id,
      neighborhood_slug, property_type_id, image_url, images, legal_status,
      bedrooms, bathrooms, direction, contact_name, contact_phone, contact_zalo,
      amenities, tags, latitude, longitude, formatted_address, vr_tour_url, video_url,
      meta_title, meta_description, focus_keywords, schema_markup, faq,
      is_active, is_featured, is_hot
    ) VALUES (
      v_listing.title, v_listing.description, v_listing.price, v_listing.price_unit,
      v_listing.price_label, v_listing.price_per_month, v_listing.loan_support,
      v_listing.listing_type, v_listing.area_sqm, v_listing.address, v_listing.city,
      v_listing.district, v_listing.ward, v_listing.area_id, v_listing.district_id,
      v_listing.ward_id, v_listing.neighborhood_slug, v_listing.property_type_id,
      v_listing.image_url, v_listing.images, v_listing.legal_status,
      v_listing.bedrooms, v_listing.bathrooms, v_listing.direction,
      v_listing.contact_name, v_listing.contact_phone, v_listing.contact_zalo,
      v_listing.amenities, v_listing.tags, v_listing.latitude, v_listing.longitude,
      v_listing.formatted_address, v_listing.vr_tour_url, v_listing.video_url,
      v_listing.meta_title, v_listing.meta_description, v_listing.focus_keywords,
      v_listing.schema_markup, v_listing.faq, true, false, false
    ) RETURNING id INTO v_property_id;
  END IF;

  v_expires_at := CASE
    WHEN v_listing.expires_at IS NOT NULL AND v_listing.expires_at > v_now THEN v_listing.expires_at
    ELSE v_now + interval '60 days'
  END;
  UPDATE public.user_listings
  SET status = 'approved', property_id = v_property_id, expires_at = v_expires_at, reject_reason = NULL
  WHERE id = v_listing.id;

  RETURN QUERY SELECT v_property_id, v_listing.title, v_listing.description, v_listing.city,
    v_listing.district, v_listing.listing_type, v_listing.price, v_listing.price_unit, v_listing.area_sqm;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_user_listing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_user_listing(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.protect_referenced_ward_location()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.name IS NOT DISTINCT FROM OLD.name AND NEW.district_id IS NOT DISTINCT FROM OLD.district_id THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.properties property
    WHERE property.ward_id = OLD.id
      AND (property.district_id IS DISTINCT FROM NEW.district_id
        OR public.normalize_location_label(property.ward) IS DISTINCT FROM public.normalize_location_label(NEW.name))
  ) OR EXISTS (
    SELECT 1 FROM public.user_listings listing
    WHERE listing.ward_id = OLD.id
      AND (listing.district_id IS DISTINCT FROM NEW.district_id
        OR public.normalize_location_label(listing.ward) IS DISTINCT FROM public.normalize_location_label(NEW.name))
  ) THEN
    RAISE EXCEPTION 'Không thể đổi tên hoặc chuyển huyện của xã/phường đang được tin đăng tham chiếu; hãy dùng migration cascade có kiểm soát.';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_referenced_ward_location() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_wards_protect_referenced_location ON public.wards;
CREATE TRIGGER trg_wards_protect_referenced_location
BEFORE UPDATE OF name, district_id ON public.wards
FOR EACH ROW EXECUTE FUNCTION public.protect_referenced_ward_location();

DROP TRIGGER IF EXISTS trg_admin_user_listing_edit ON public.user_listings;
CREATE TRIGGER trg_admin_user_listing_edit
AFTER UPDATE ON public.user_listings
FOR EACH ROW
WHEN (
  OLD.status = 'pending' AND NEW.status = 'pending' AND (
    OLD.title IS DISTINCT FROM NEW.title OR OLD.description IS DISTINCT FROM NEW.description
    OR OLD.price IS DISTINCT FROM NEW.price OR OLD.price_unit IS DISTINCT FROM NEW.price_unit
    OR OLD.image_url IS DISTINCT FROM NEW.image_url OR OLD.images IS DISTINCT FROM NEW.images
    OR OLD.city IS DISTINCT FROM NEW.city OR OLD.district_id IS DISTINCT FROM NEW.district_id
    OR OLD.ward_id IS DISTINCT FROM NEW.ward_id OR OLD.latitude IS DISTINCT FROM NEW.latitude
    OR OLD.longitude IS DISTINCT FROM NEW.longitude OR OLD.meta_title IS DISTINCT FROM NEW.meta_title
    OR OLD.meta_description IS DISTINCT FROM NEW.meta_description
  )
)
EXECUTE FUNCTION public.capture_admin_user_listing_edit();

NOTIFY pgrst, 'reload schema';
