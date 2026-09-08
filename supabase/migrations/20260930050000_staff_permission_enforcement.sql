-- Granular staff enforcement for row-level admin workflows.
-- Permission is an additional requirement; ownership, lifecycle and assignment guards remain active.

DROP POLICY IF EXISTS "properties_staff_permission_select" ON public.properties;
CREATE POLICY "properties_staff_permission_select" ON public.properties
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.has_staff_permission('properties', 'view', area_id, district_id, ward_id,
      (SELECT n.id FROM public.neighborhoods n WHERE n.slug = properties.neighborhood_slug LIMIT 1))
  );

DROP POLICY IF EXISTS "properties_staff_permission_insert" ON public.properties;
CREATE POLICY "properties_staff_permission_insert" ON public.properties
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.has_staff_permission('properties', 'create', area_id, district_id, ward_id,
      (SELECT n.id FROM public.neighborhoods n WHERE n.slug = properties.neighborhood_slug LIMIT 1))
  );

DROP POLICY IF EXISTS "properties_staff_permission_update" ON public.properties;
CREATE POLICY "properties_staff_permission_update" ON public.properties
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR public.has_staff_permission('properties', 'edit', area_id, district_id, ward_id,
      (SELECT n.id FROM public.neighborhoods n WHERE n.slug = properties.neighborhood_slug LIMIT 1))
  )
  WITH CHECK (
    public.is_admin()
    OR public.has_staff_permission('properties', 'edit', area_id, district_id, ward_id,
      (SELECT n.id FROM public.neighborhoods n WHERE n.slug = properties.neighborhood_slug LIMIT 1))
  );

DROP POLICY IF EXISTS "properties_staff_permission_delete" ON public.properties;
CREATE POLICY "properties_staff_permission_delete" ON public.properties
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR public.has_staff_permission('properties', 'delete', area_id, district_id, ward_id,
      (SELECT n.id FROM public.neighborhoods n WHERE n.slug = properties.neighborhood_slug LIMIT 1))
  );

DROP POLICY IF EXISTS "news_staff_permission_select" ON public.news;
CREATE POLICY "news_staff_permission_select" ON public.news
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR public.has_staff_permission('news', 'view', area_id, district_id, ward_id, neighborhood_id)
  );

DROP POLICY IF EXISTS "news_staff_permission_insert" ON public.news;
CREATE POLICY "news_staff_permission_insert" ON public.news
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin()
    OR public.has_staff_permission('news', 'create', area_id, district_id, ward_id, neighborhood_id)
  );

DROP POLICY IF EXISTS "news_staff_permission_update" ON public.news;
CREATE POLICY "news_staff_permission_update" ON public.news
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR public.has_staff_permission('news', 'edit', area_id, district_id, ward_id, neighborhood_id)
  )
  WITH CHECK (
    public.is_admin()
    OR public.has_staff_permission('news', 'edit', area_id, district_id, ward_id, neighborhood_id)
  );

DROP POLICY IF EXISTS "news_staff_permission_delete" ON public.news;
CREATE POLICY "news_staff_permission_delete" ON public.news
  FOR DELETE TO authenticated
  USING (
    public.is_admin()
    OR public.has_staff_permission('news', 'delete', area_id, district_id, ward_id, neighborhood_id)
  );

DROP POLICY IF EXISTS "user_listings_admin_select" ON public.user_listings;
CREATE POLICY "user_listings_admin_select" ON public.user_listings
  FOR SELECT TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_customer_member(user_id)
      AND public.has_staff_permission('user-listings', 'view', area_id, district_id, ward_id,
        (SELECT n.id FROM public.neighborhoods n WHERE n.slug = user_listings.neighborhood_slug LIMIT 1))
    )
  );

DROP POLICY IF EXISTS "user_listings_admin_update" ON public.user_listings;
CREATE POLICY "user_listings_admin_update" ON public.user_listings
  FOR UPDATE TO authenticated
  USING (
    public.is_admin()
    OR (
      public.is_customer_member(user_id)
      AND (
        public.has_staff_permission('user-listings', 'edit', area_id, district_id, ward_id,
          (SELECT n.id FROM public.neighborhoods n WHERE n.slug = user_listings.neighborhood_slug LIMIT 1))
        OR public.has_staff_permission('user-listings', 'approve', area_id, district_id, ward_id,
          (SELECT n.id FROM public.neighborhoods n WHERE n.slug = user_listings.neighborhood_slug LIMIT 1))
        OR public.has_staff_permission('user-listings', 'reject', area_id, district_id, ward_id,
          (SELECT n.id FROM public.neighborhoods n WHERE n.slug = user_listings.neighborhood_slug LIMIT 1))
        OR public.has_staff_permission('user-listings', 'manage_seo', area_id, district_id, ward_id,
          (SELECT n.id FROM public.neighborhoods n WHERE n.slug = user_listings.neighborhood_slug LIMIT 1))
        OR public.has_staff_permission('user-listings', 'manage_media', area_id, district_id, ward_id,
          (SELECT n.id FROM public.neighborhoods n WHERE n.slug = user_listings.neighborhood_slug LIMIT 1))
      )
    )
  )
  WITH CHECK (
    public.is_admin()
    OR (
      public.is_customer_member(user_id)
      AND (
        public.has_staff_permission('user-listings', 'edit', area_id, district_id, ward_id,
          (SELECT n.id FROM public.neighborhoods n WHERE n.slug = user_listings.neighborhood_slug LIMIT 1))
        OR public.has_staff_permission('user-listings', 'approve', area_id, district_id, ward_id,
          (SELECT n.id FROM public.neighborhoods n WHERE n.slug = user_listings.neighborhood_slug LIMIT 1))
        OR public.has_staff_permission('user-listings', 'reject', area_id, district_id, ward_id,
          (SELECT n.id FROM public.neighborhoods n WHERE n.slug = user_listings.neighborhood_slug LIMIT 1))
        OR public.has_staff_permission('user-listings', 'manage_seo', area_id, district_id, ward_id,
          (SELECT n.id FROM public.neighborhoods n WHERE n.slug = user_listings.neighborhood_slug LIMIT 1))
        OR public.has_staff_permission('user-listings', 'manage_media', area_id, district_id, ward_id,
          (SELECT n.id FROM public.neighborhoods n WHERE n.slug = user_listings.neighborhood_slug LIMIT 1))
      )
    )
  );

CREATE OR REPLACE FUNCTION public.assert_user_listing_mutation_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_neighborhood_id uuid;
  v_new_neighborhood_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Chưa xác thực' USING ERRCODE = '42501';
  END IF;
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Không được thay đổi chủ sở hữu tin đăng' USING ERRCODE = '42501';
  END IF;
  IF auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;
  SELECT n.id INTO v_neighborhood_id
  FROM public.neighborhoods n
  WHERE n.slug = OLD.neighborhood_slug
  LIMIT 1;
  SELECT n.id INTO v_new_neighborhood_id
  FROM public.neighborhoods n
  WHERE n.slug = NEW.neighborhood_slug
  LIMIT 1;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_customer_member(OLD.user_id) THEN
    RAISE EXCEPTION 'Tin đăng ngoài phạm vi customer được phân công' USING ERRCODE = '42501';
  END IF;
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF OLD.area_id IS DISTINCT FROM NEW.area_id
       OR OLD.district_id IS DISTINCT FROM NEW.district_id
       OR OLD.ward_id IS DISTINCT FROM NEW.ward_id
       OR OLD.neighborhood_slug IS DISTINCT FROM NEW.neighborhood_slug THEN
      RAISE EXCEPTION 'Staff không được đổi khu vực khi duyệt hoặc từ chối tin đăng' USING ERRCODE = '42501';
    END IF;
    IF NEW.status = 'approved' THEN
      IF NOT public.has_staff_permission('user-listings', 'approve', OLD.area_id, OLD.district_id, OLD.ward_id, v_neighborhood_id) THEN
        RAISE EXCEPTION 'Không có quyền duyệt tin đăng trong phạm vi này' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.status = 'rejected' THEN
      IF NOT public.has_staff_permission('user-listings', 'reject', OLD.area_id, OLD.district_id, OLD.ward_id, v_neighborhood_id) THEN
        RAISE EXCEPTION 'Không có quyền từ chối tin đăng trong phạm vi này' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'Staff không được thay đổi trạng thái này' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF OLD.area_id IS DISTINCT FROM NEW.area_id
       OR OLD.district_id IS DISTINCT FROM NEW.district_id
       OR OLD.ward_id IS DISTINCT FROM NEW.ward_id
       OR OLD.neighborhood_slug IS DISTINCT FROM NEW.neighborhood_slug THEN
      IF NOT public.has_staff_permission('user-listings', 'edit', OLD.area_id, OLD.district_id, OLD.ward_id, v_neighborhood_id)
         OR NOT public.has_staff_permission('user-listings', 'edit', NEW.area_id, NEW.district_id, NEW.ward_id, v_new_neighborhood_id) THEN
        RAISE EXCEPTION 'Không có quyền chuyển tin đăng giữa các phạm vi này' USING ERRCODE = '42501';
      END IF;
    END IF;

    IF public.has_staff_permission('user-listings', 'edit', OLD.area_id, OLD.district_id, OLD.ward_id, v_neighborhood_id) THEN
      RETURN NEW;
    END IF;

    IF public.has_staff_permission('user-listings', 'manage_media', OLD.area_id, OLD.district_id, OLD.ward_id, v_neighborhood_id)
       AND (to_jsonb(NEW) - ARRAY[
         'id', 'user_id', 'property_id', 'status', 'reject_reason', 'created_at', 'updated_at',
         'title', 'description', 'price', 'price_unit', 'price_label', 'listing_type',
         'price_per_month', 'loan_support', 'area_sqm', 'address', 'city', 'district', 'ward',
         'neighborhood_slug', 'area_id', 'district_id', 'property_type_id', 'legal_status',
         'bedrooms', 'bathrooms', 'direction', 'contact_name', 'contact_phone', 'contact_zalo',
         'amenities', 'latitude', 'longitude', 'formatted_address', 'meta_title',
         'meta_description', 'focus_keywords', 'schema_markup', 'faq', 'tags', 'ai_provenance',
         'ai_seo_draft'
       ]) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY[
         'id', 'user_id', 'property_id', 'status', 'reject_reason', 'created_at', 'updated_at',
         'title', 'description', 'price', 'price_unit', 'price_label', 'listing_type',
         'price_per_month', 'loan_support', 'area_sqm', 'address', 'city', 'district', 'ward',
         'neighborhood_slug', 'area_id', 'district_id', 'property_type_id', 'legal_status',
         'bedrooms', 'bathrooms', 'direction', 'contact_name', 'contact_phone', 'contact_zalo',
         'amenities', 'latitude', 'longitude', 'formatted_address', 'meta_title',
         'meta_description', 'focus_keywords', 'schema_markup', 'faq', 'tags', 'ai_provenance',
         'ai_seo_draft'
       ]) THEN
      RETURN NEW;
    END IF;

    IF public.has_staff_permission('user-listings', 'manage_seo', OLD.area_id, OLD.district_id, OLD.ward_id, v_neighborhood_id)
       AND (to_jsonb(NEW) - ARRAY[
         'id', 'user_id', 'property_id', 'status', 'reject_reason', 'created_at', 'updated_at',
         'title', 'description', 'price', 'price_unit', 'price_label', 'listing_type',
         'price_per_month', 'loan_support', 'area_sqm', 'address', 'city', 'district', 'ward',
         'neighborhood_slug', 'area_id', 'district_id', 'property_type_id', 'image_url', 'images',
         'vr_tour_url', 'video_url', 'legal_status', 'bedrooms', 'bathrooms', 'direction',
         'contact_name', 'contact_phone', 'contact_zalo', 'amenities', 'latitude', 'longitude',
         'formatted_address', 'tags', 'ai_provenance', 'ai_seo_draft'
       ]) IS NOT DISTINCT FROM (to_jsonb(OLD) - ARRAY[
         'id', 'user_id', 'property_id', 'status', 'reject_reason', 'created_at', 'updated_at',
         'title', 'description', 'price', 'price_unit', 'price_label', 'listing_type',
         'price_per_month', 'loan_support', 'area_sqm', 'address', 'city', 'district', 'ward',
         'neighborhood_slug', 'area_id', 'district_id', 'property_type_id', 'image_url', 'images',
         'vr_tour_url', 'video_url', 'legal_status', 'bedrooms', 'bathrooms', 'direction',
         'contact_name', 'contact_phone', 'contact_zalo', 'amenities', 'latitude', 'longitude',
         'formatted_address', 'tags', 'ai_provenance', 'ai_seo_draft'
       ]) THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Không có quyền chỉnh trường dữ liệu này trong phạm vi này' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_user_listing(p_listing_id uuid)
RETURNS TABLE (
  property_id uuid, title text, description text, city text, district text,
  listing_type text, price numeric, price_unit text, area_sqm numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing public.user_listings%ROWTYPE;
  v_neighborhood_id uuid;
BEGIN
  SELECT * INTO v_listing FROM public.user_listings WHERE id = p_listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tin đăng' USING ERRCODE = 'P0002'; END IF;
  SELECT n.id INTO v_neighborhood_id FROM public.neighborhoods n WHERE n.slug = v_listing.neighborhood_slug LIMIT 1;
  IF auth.uid() IS NULL OR (
    NOT public.is_admin()
    AND (
      NOT public.is_customer_member(v_listing.user_id)
      OR NOT public.has_staff_permission('user-listings', 'approve', v_listing.area_id, v_listing.district_id, v_listing.ward_id, v_neighborhood_id)
    )
  ) THEN
    RAISE EXCEPTION 'Không có quyền duyệt tin đăng trong phạm vi này' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT * FROM public.approve_user_listing_legacy(p_listing_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_pending_user_listing(p_listing_id uuid, p_patch jsonb)
RETURNS public.user_listings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing public.user_listings%ROWTYPE;
  v_neighborhood_id uuid;
BEGIN
  SELECT * INTO v_listing FROM public.user_listings WHERE id = p_listing_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Không tìm thấy tin đăng' USING ERRCODE = 'P0002'; END IF;
  SELECT n.id INTO v_neighborhood_id FROM public.neighborhoods n WHERE n.slug = v_listing.neighborhood_slug LIMIT 1;
  IF auth.uid() IS NULL OR (
    NOT public.is_admin()
    AND (
      NOT public.is_customer_member(v_listing.user_id)
      OR NOT public.has_staff_permission('user-listings', 'edit', v_listing.area_id, v_listing.district_id, v_listing.ward_id, v_neighborhood_id)
    )
  ) THEN
    RAISE EXCEPTION 'Không có quyền chỉnh tin chờ duyệt trong phạm vi này' USING ERRCODE = '42501';
  END IF;
  RETURN public.admin_update_pending_user_listing_legacy(p_listing_id, p_patch);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_apply_user_listing_ai_seo(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_listing public.user_listings%ROWTYPE; v_neighborhood_id uuid;
BEGIN
  SELECT * INTO v_listing FROM public.user_listings WHERE id = p_listing_id;
  SELECT n.id INTO v_neighborhood_id FROM public.neighborhoods n WHERE n.slug = v_listing.neighborhood_slug LIMIT 1;
  IF auth.uid() IS NULL OR (
    NOT public.is_admin()
    AND (
      NOT public.is_customer_member(v_listing.user_id)
      OR NOT public.has_staff_permission('user-listings', 'manage_seo', v_listing.area_id, v_listing.district_id, v_listing.ward_id, v_neighborhood_id)
    )
  ) THEN
    RAISE EXCEPTION 'Không có quyền quản lý SEO tin đăng trong phạm vi này' USING ERRCODE = '42501';
  END IF;
  PERFORM public.admin_apply_user_listing_ai_seo_legacy(p_listing_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_reject_user_listing_ai_seo(p_listing_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_listing public.user_listings%ROWTYPE; v_neighborhood_id uuid;
BEGIN
  SELECT * INTO v_listing FROM public.user_listings WHERE id = p_listing_id;
  SELECT n.id INTO v_neighborhood_id FROM public.neighborhoods n WHERE n.slug = v_listing.neighborhood_slug LIMIT 1;
  IF auth.uid() IS NULL OR (
    NOT public.is_admin()
    AND (
      NOT public.is_customer_member(v_listing.user_id)
      OR NOT public.has_staff_permission('user-listings', 'manage_seo', v_listing.area_id, v_listing.district_id, v_listing.ward_id, v_neighborhood_id)
    )
  ) THEN
    RAISE EXCEPTION 'Không có quyền quản lý SEO tin đăng trong phạm vi này' USING ERRCODE = '42501';
  END IF;
  PERFORM public.admin_reject_user_listing_ai_seo_legacy(p_listing_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_staff_content_permission()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_neighborhood_id uuid;
  v_module text;
  v_area_id uuid;
  v_district_id uuid;
  v_ward_id uuid;
  v_is_published boolean;
BEGIN
  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  v_module := TG_ARGV[0];
  IF TG_TABLE_NAME = 'properties' THEN
    v_area_id := NEW.area_id;
    v_district_id := NEW.district_id;
    v_ward_id := NEW.ward_id;
    SELECT n.id INTO v_neighborhood_id FROM public.neighborhoods n WHERE n.slug = NEW.neighborhood_slug LIMIT 1;
    v_is_published := NEW.is_active;
  ELSE
    v_area_id := NEW.area_id;
    v_district_id := NEW.district_id;
    v_ward_id := NEW.ward_id;
    v_neighborhood_id := NEW.neighborhood_id;
    v_is_published := NEW.is_published;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NOT public.has_staff_permission(v_module, 'create', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền tạo dữ liệu trong phạm vi này' USING ERRCODE = '42501';
    END IF;
    IF v_is_published AND NOT public.has_staff_permission(v_module, 'publish', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền đăng/xuất bản trong phạm vi này' USING ERRCODE = '42501';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NOT public.has_staff_permission(v_module, 'edit', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền chỉnh sửa trong phạm vi này' USING ERRCODE = '42501';
    END IF;
    IF TG_TABLE_NAME = 'properties'
       AND v_is_published IS DISTINCT FROM (to_jsonb(OLD)->>'is_active')::boolean
       AND v_is_published
       AND NOT public.has_staff_permission(v_module, 'publish', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền đăng/xuất bản trong phạm vi này' USING ERRCODE = '42501';
    END IF;
    IF TG_TABLE_NAME = 'news'
       AND v_is_published IS DISTINCT FROM (to_jsonb(OLD)->>'is_published')::boolean
       AND v_is_published
       AND NOT public.has_staff_permission(v_module, 'publish', v_area_id, v_district_id, v_ward_id, v_neighborhood_id) THEN
      RAISE EXCEPTION 'Không có quyền đăng/xuất bản trong phạm vi này' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_properties_permission ON public.properties;
CREATE TRIGGER trg_staff_properties_permission
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_content_permission('properties');

DROP TRIGGER IF EXISTS trg_staff_news_permission ON public.news;
CREATE TRIGGER trg_staff_news_permission
  BEFORE INSERT OR UPDATE ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.enforce_staff_content_permission('news');

REVOKE ALL ON FUNCTION public.enforce_staff_content_permission() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
