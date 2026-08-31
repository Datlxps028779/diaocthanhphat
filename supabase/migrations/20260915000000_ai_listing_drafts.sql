-- P10: lưu bản nháp SEO AI tách khỏi dữ liệu public.
-- Bản nháp chỉ được tạo cho user listing đang pending; apply/reject là thao tác
-- admin/staff riêng trước khi approve_user_listing() có thể xuất bản listing.

ALTER TABLE public.user_listings
  ADD COLUMN IF NOT EXISTS ai_provenance jsonb,
  ADD COLUMN IF NOT EXISTS ai_seo_draft jsonb;

ALTER TABLE public.user_listings
  DROP CONSTRAINT IF EXISTS user_listings_ai_provenance_array,
  DROP CONSTRAINT IF EXISTS user_listings_ai_seo_draft_object;
ALTER TABLE public.user_listings
  ADD CONSTRAINT user_listings_ai_provenance_array CHECK (
    ai_provenance IS NULL OR jsonb_typeof(ai_provenance) = 'array'
  ) NOT VALID,
  ADD CONSTRAINT user_listings_ai_seo_draft_object CHECK (
    ai_seo_draft IS NULL OR jsonb_typeof(ai_seo_draft) = 'object'
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.admin_apply_user_listing_ai_seo(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing public.user_listings%ROWTYPE;
  v_draft jsonb;
  v_provenance jsonb;
  v_next_provenance jsonb;
  v_tags text[];
  v_meta_title text;
  v_meta_description text;
BEGIN
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền áp dụng SEO AI' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_listing
    FROM public.user_listings
   WHERE id = p_listing_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tin đăng' USING ERRCODE = 'P0002';
  END IF;
  IF v_listing.status <> 'pending' THEN
    RAISE EXCEPTION 'Chỉ được áp dụng SEO AI cho tin đang chờ duyệt' USING ERRCODE = 'P0001';
  END IF;

  v_draft := v_listing.ai_seo_draft;
  IF v_draft IS NULL OR jsonb_typeof(v_draft) <> 'object'
     OR jsonb_typeof(v_draft->'provenance') <> 'object'
     OR v_draft->'provenance'->>'kind' <> 'seo'
     OR v_draft->'provenance'->>'contract_version' <> 'p10-v1'
     OR (v_draft->'provenance'->>'output_fingerprint') !~ '^[0-9a-f]{8}$' THEN
    RAISE EXCEPTION 'Bản nháp SEO AI không hợp lệ' USING ERRCODE = '22023';
  END IF;

  IF jsonb_typeof(v_draft->'tags') <> 'array'
     OR jsonb_array_length(v_draft->'tags') > 8 THEN
    RAISE EXCEPTION 'Danh sách tag SEO AI không hợp lệ' USING ERRCODE = '22023';
  END IF;

  v_tags := ARRAY(
    SELECT btrim(value)
      FROM jsonb_array_elements_text(v_draft->'tags') AS item(value)
     WHERE NULLIF(btrim(value), '') IS NOT NULL
     LIMIT 8
  );
  v_meta_title := NULLIF(btrim(v_draft->>'meta_title'), '');
  v_meta_description := NULLIF(btrim(v_draft->>'meta_description'), '');
  IF v_meta_title IS NOT NULL AND char_length(v_meta_title) > 65 THEN
    RAISE EXCEPTION 'Meta title SEO AI vượt quá 65 ký tự' USING ERRCODE = '22023';
  END IF;
  IF v_meta_description IS NOT NULL AND char_length(v_meta_description) > 160 THEN
    RAISE EXCEPTION 'Meta description SEO AI vượt quá 160 ký tự' USING ERRCODE = '22023';
  END IF;

  v_provenance := jsonb_set(v_draft->'provenance', '{status}', to_jsonb('accepted'::text));
  SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
    INTO v_next_provenance
    FROM jsonb_array_elements(COALESCE(v_listing.ai_provenance, '[]'::jsonb)) AS items(item)
   WHERE item->>'kind' <> 'seo';
  v_next_provenance := v_next_provenance || jsonb_build_array(v_provenance);

  UPDATE public.user_listings
     SET tags = COALESCE(v_tags, '{}'::text[]),
         meta_title = v_meta_title,
         meta_description = v_meta_description,
         ai_provenance = v_next_provenance,
         ai_seo_draft = NULL,
         updated_at = now()
   WHERE id = p_listing_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_user_listing_ai_seo(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing public.user_listings%ROWTYPE;
  v_next_provenance jsonb;
  v_rejected jsonb;
BEGIN
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền bỏ SEO AI' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_listing
    FROM public.user_listings
   WHERE id = p_listing_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tin đăng' USING ERRCODE = 'P0002';
  END IF;
  IF v_listing.status <> 'pending' THEN
    RAISE EXCEPTION 'Chỉ được bỏ SEO AI của tin đang chờ duyệt' USING ERRCODE = 'P0001';
  END IF;

  SELECT item
    INTO v_rejected
    FROM jsonb_array_elements(COALESCE(v_listing.ai_provenance, '[]'::jsonb)) AS items(item)
   WHERE item->>'kind' = 'seo'
   LIMIT 1;
  IF v_rejected IS NOT NULL THEN
    v_rejected := jsonb_set(v_rejected, '{status}', to_jsonb('rejected'::text));
    SELECT COALESCE(jsonb_agg(item), '[]'::jsonb)
      INTO v_next_provenance
      FROM jsonb_array_elements(COALESCE(v_listing.ai_provenance, '[]'::jsonb)) AS items(item)
     WHERE item->>'kind' <> 'seo';
    v_next_provenance := v_next_provenance || jsonb_build_array(v_rejected);
  ELSE
    v_next_provenance := v_listing.ai_provenance;
  END IF;

  UPDATE public.user_listings
     SET ai_provenance = v_next_provenance,
         ai_seo_draft = NULL,
         updated_at = now()
   WHERE id = p_listing_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_user_listing_ai_seo(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.admin_reject_user_listing_ai_seo(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_user_listing_ai_seo(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reject_user_listing_ai_seo(uuid) TO authenticated;

-- approve_user_listing() được định nghĩa lại ở cuối migration để chặn bản nháp SEO
-- chưa xử lý và giữ nguyên identity property khi duyệt lại.

-- Admin edit whitelist: tags/provenance là metadata đã có trong user_listings;
-- bản nháp riêng luôn bị xóa khi nội dung được chỉnh bằng form.
CREATE OR REPLACE FUNCTION public.admin_update_pending_user_listing(
  p_listing_id uuid,
  p_patch jsonb
)
RETURNS public.user_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing public.user_listings%ROWTYPE;
  v_next public.user_listings%ROWTYPE;
  v_allowed jsonb;
BEGIN
  IF NOT public.is_admin_or_staff() THEN RAISE EXCEPTION 'Không có quyền chỉnh tin chờ duyệt' USING ERRCODE = '42501'; END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN RAISE EXCEPTION 'Dữ liệu chỉnh sửa không hợp lệ' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_listing FROM public.user_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tin đăng' USING ERRCODE = 'P0002'; END IF;
  IF v_listing.status <> 'pending' THEN RAISE EXCEPTION 'Chỉ được chỉnh tin đang chờ duyệt' USING ERRCODE = 'P0001'; END IF;

  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb) INTO v_allowed
    FROM jsonb_each(p_patch)
   WHERE key IN (
     'title', 'description', 'price', 'price_unit', 'price_label', 'listing_type', 'price_per_month',
     'loan_support', 'area_sqm', 'address', 'city', 'district', 'ward', 'neighborhood_slug', 'area_id',
     'district_id', 'property_type_id', 'image_url', 'images', 'legal_status', 'bedrooms', 'bathrooms',
     'direction', 'contact_name', 'contact_phone', 'contact_zalo', 'amenities', 'latitude', 'longitude',
     'formatted_address', 'vr_tour_url', 'video_url', 'tags', 'ai_provenance', 'meta_title',
     'meta_description', 'focus_keywords', 'schema_markup', 'faq'
   );
  v_next := jsonb_populate_record(v_listing, v_allowed);

  UPDATE public.user_listings SET
    title = v_next.title, description = v_next.description, price = v_next.price, price_unit = v_next.price_unit,
    price_label = v_next.price_label, listing_type = v_next.listing_type, price_per_month = v_next.price_per_month,
    loan_support = v_next.loan_support, area_sqm = v_next.area_sqm, address = v_next.address, city = v_next.city,
    district = v_next.district, ward = v_next.ward, neighborhood_slug = v_next.neighborhood_slug,
    area_id = v_next.area_id, district_id = v_next.district_id, property_type_id = v_next.property_type_id,
    image_url = v_next.image_url, images = v_next.images, legal_status = v_next.legal_status,
    bedrooms = v_next.bedrooms, bathrooms = v_next.bathrooms, direction = v_next.direction,
    contact_name = v_next.contact_name, contact_phone = v_next.contact_phone, contact_zalo = v_next.contact_zalo,
    amenities = v_next.amenities, latitude = v_next.latitude, longitude = v_next.longitude,
    formatted_address = v_next.formatted_address, vr_tour_url = v_next.vr_tour_url, video_url = v_next.video_url,
    tags = v_next.tags, ai_provenance = v_next.ai_provenance, ai_seo_draft = NULL,
    meta_title = v_next.meta_title, meta_description = v_next.meta_description,
    focus_keywords = v_next.focus_keywords, schema_markup = v_next.schema_markup, faq = v_next.faq,
    reject_reason = NULL, updated_at = now()
   WHERE id = p_listing_id
   RETURNING * INTO v_next;
  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_pending_user_listing(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_pending_user_listing(uuid, jsonb) TO authenticated;

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
  IF NOT public.is_admin_or_staff() THEN RAISE EXCEPTION 'Không có quyền duyệt tin đăng' USING ERRCODE = '42501'; END IF;
  SELECT * INTO v_listing FROM public.user_listings WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tin đăng' USING ERRCODE = 'P0002'; END IF;
  IF v_listing.status = 'approved' THEN RAISE EXCEPTION 'Tin đăng đã được duyệt; không thể duyệt trùng' USING ERRCODE = 'P0001'; END IF;
  IF v_listing.status NOT IN ('pending', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'Trạng thái tin đăng không thể duyệt: %', v_listing.status USING ERRCODE = 'P0001';
  END IF;
  IF v_listing.ai_seo_draft IS NOT NULL THEN
    RAISE EXCEPTION 'Cần áp dụng hoặc bỏ bản nháp SEO AI trước khi duyệt' USING ERRCODE = 'P0001';
  END IF;

  IF v_listing.property_id IS NOT NULL THEN
    SELECT p.is_active INTO v_prior_property_active
      FROM public.properties p WHERE p.id = v_listing.property_id FOR UPDATE;
    v_prior_property_found := FOUND;
    IF NOT v_prior_property_found THEN
      RAISE EXCEPTION 'Property lịch sử liên kết không còn tồn tại; từ chối tạo identity thay thế' USING ERRCODE = 'P0001';
    END IF;
    IF v_prior_property_active THEN
      RAISE EXCEPTION 'Tin đăng còn property công khai liên kết; cần xử lý trạng thái hiện tại trước khi duyệt lại' USING ERRCODE = 'P0001';
    END IF;
    IF EXISTS (
      SELECT 1 FROM public.user_listings other_listing
       WHERE other_listing.property_id = v_listing.property_id AND other_listing.id <> v_listing.id
    ) THEN
      RAISE EXCEPTION 'Property lịch sử đang được nhiều tin đăng tham chiếu; cần xử lý thủ công' USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.properties SET
      title = v_listing.title, description = v_listing.description, price = v_listing.price,
      price_unit = v_listing.price_unit, price_label = v_listing.price_label,
      price_per_month = v_listing.price_per_month, loan_support = v_listing.loan_support,
      listing_type = v_listing.listing_type, area_sqm = v_listing.area_sqm, address = v_listing.address,
      city = v_listing.city, district = v_listing.district, ward = v_listing.ward,
      area_id = v_listing.area_id, district_id = v_listing.district_id,
      neighborhood_slug = v_listing.neighborhood_slug, property_type_id = v_listing.property_type_id,
      image_url = v_listing.image_url, images = v_listing.images, legal_status = v_listing.legal_status,
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
  END IF;

  IF v_listing.property_id IS NULL THEN
    INSERT INTO public.properties (
      title, description, price, price_unit, price_label, price_per_month, loan_support, listing_type,
      area_sqm, address, city, district, ward, area_id, district_id, neighborhood_slug, property_type_id,
      image_url, images, legal_status, bedrooms, bathrooms, direction, contact_name, contact_phone,
      contact_zalo, amenities, tags, latitude, longitude, formatted_address, vr_tour_url, video_url,
      meta_title, meta_description, focus_keywords, schema_markup, faq, is_active, is_featured, is_hot
    ) VALUES (
      v_listing.title, v_listing.description, v_listing.price, v_listing.price_unit, v_listing.price_label,
      v_listing.price_per_month, v_listing.loan_support, v_listing.listing_type, v_listing.area_sqm,
      v_listing.address, v_listing.city, v_listing.district, v_listing.ward, v_listing.area_id,
      v_listing.district_id, v_listing.neighborhood_slug, v_listing.property_type_id, v_listing.image_url,
      v_listing.images, v_listing.legal_status, v_listing.bedrooms, v_listing.bathrooms, v_listing.direction,
      v_listing.contact_name, v_listing.contact_phone, v_listing.contact_zalo, v_listing.amenities,
      v_listing.tags, v_listing.latitude, v_listing.longitude, v_listing.formatted_address,
      v_listing.vr_tour_url, v_listing.video_url, v_listing.meta_title, v_listing.meta_description,
      v_listing.focus_keywords, v_listing.schema_markup, v_listing.faq, true, false, false
    ) RETURNING id INTO v_property_id;
  END IF;

  v_expires_at := CASE WHEN v_listing.expires_at IS NOT NULL AND v_listing.expires_at > v_now
    THEN v_listing.expires_at ELSE v_now + interval '60 days' END;
  UPDATE public.user_listings SET status = 'approved', property_id = v_property_id,
    expires_at = v_expires_at, reject_reason = NULL WHERE id = v_listing.id;

  RETURN QUERY SELECT v_property_id, v_listing.title, v_listing.description, v_listing.city,
    v_listing.district, v_listing.listing_type, v_listing.price, v_listing.price_unit, v_listing.area_sqm;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_user_listing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_user_listing(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
