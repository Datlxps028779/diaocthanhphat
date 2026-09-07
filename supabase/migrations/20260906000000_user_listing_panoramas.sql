BEGIN;

CREATE TABLE IF NOT EXISTS public.user_listing_panoramas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_listing_id uuid NULL REFERENCES public.user_listings(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL,
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/webp')),
  size_bytes bigint NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 31457280),
  width integer NOT NULL CHECK (width >= 2000 AND width <= 16000),
  height integer NOT NULL CHECK (height >= 1000 AND height <= 8000),
  label text NOT NULL DEFAULT '' CHECK (char_length(label) <= 120),
  sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_listing_panoramas_ratio_check CHECK (width::numeric / NULLIF(height, 0) BETWEEN 1.8 AND 2.2),
  CONSTRAINT user_listing_panoramas_path_check CHECK (
    storage_path = 'user-listings/' || owner_user_id::text || '/' || draft_id::text || '/' || split_part(storage_path, '/', 4)
    AND storage_path ~ '^user-listings/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[^/]+[.](jpe?g|webp)$'
  )
);

CREATE INDEX IF NOT EXISTS user_listing_panoramas_owner_idx
  ON public.user_listing_panoramas(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS user_listing_panoramas_listing_idx
  ON public.user_listing_panoramas(user_listing_id, sort_order, created_at);

ALTER TABLE public.user_listing_panoramas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_listing_panoramas TO authenticated;

DROP POLICY IF EXISTS user_listing_panoramas_owner_select ON public.user_listing_panoramas;
CREATE POLICY user_listing_panoramas_owner_select
  ON public.user_listing_panoramas FOR SELECT TO authenticated
  USING (owner_user_id = auth.uid());

DROP POLICY IF EXISTS user_listing_panoramas_owner_insert ON public.user_listing_panoramas;
CREATE POLICY user_listing_panoramas_owner_insert
  ON public.user_listing_panoramas FOR INSERT TO authenticated
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (
      user_listing_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.user_listings l
        WHERE l.id = user_listing_panoramas.user_listing_id
          AND l.user_id = auth.uid()
          AND l.status IN ('pending', 'rejected', 'expired')
      )
    )
  );

DROP POLICY IF EXISTS user_listing_panoramas_owner_update ON public.user_listing_panoramas;
CREATE POLICY user_listing_panoramas_owner_update
  ON public.user_listing_panoramas FOR UPDATE TO authenticated
  USING (
    owner_user_id = auth.uid()
    AND (
      user_listing_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.user_listings l
        WHERE l.id = user_listing_panoramas.user_listing_id
          AND l.user_id = auth.uid()
          AND l.status IN ('pending', 'rejected', 'expired')
      )
    )
  )
  WITH CHECK (
    owner_user_id = auth.uid()
    AND (
      user_listing_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.user_listings l
        WHERE l.id = user_listing_panoramas.user_listing_id
          AND l.user_id = auth.uid()
          AND l.status IN ('pending', 'rejected', 'expired')
      )
    )
  );

DROP POLICY IF EXISTS user_listing_panoramas_owner_delete ON public.user_listing_panoramas;
CREATE POLICY user_listing_panoramas_owner_delete
  ON public.user_listing_panoramas FOR DELETE TO authenticated
  USING (
    owner_user_id = auth.uid()
    AND (
      user_listing_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.user_listings l
        WHERE l.id = user_listing_panoramas.user_listing_id
          AND l.user_id = auth.uid()
          AND l.status IN ('pending', 'rejected', 'expired')
      )
    )
  );

DROP POLICY IF EXISTS user_listing_panoramas_admin_select ON public.user_listing_panoramas;
CREATE POLICY user_listing_panoramas_admin_select
  ON public.user_listing_panoramas FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS user_listing_panoramas_admin_update ON public.user_listing_panoramas;
CREATE POLICY user_listing_panoramas_admin_update
  ON public.user_listing_panoramas FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS user_listing_panoramas_admin_delete ON public.user_listing_panoramas;
CREATE POLICY user_listing_panoramas_admin_delete
  ON public.user_listing_panoramas FOR DELETE TO authenticated
  USING (public.is_admin());

CREATE OR REPLACE FUNCTION public.set_user_listing_panoramas_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_listing_panoramas_updated_at ON public.user_listing_panoramas;
CREATE TRIGGER trg_user_listing_panoramas_updated_at
  BEFORE UPDATE ON public.user_listing_panoramas
  FOR EACH ROW EXECUTE FUNCTION public.set_user_listing_panoramas_updated_at();
REVOKE ALL ON FUNCTION public.set_user_listing_panoramas_updated_at() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.attach_user_listing_panoramas(
  p_listing_id uuid,
  p_draft_id uuid,
  p_panorama_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_expected integer := COALESCE(cardinality(p_panorama_ids), 0);
  v_matched integer;
  v_updated integer;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập để gắn ảnh 360.' USING ERRCODE = '42501';
  END IF;
  IF v_expected > 20 THEN
    RAISE EXCEPTION 'Mỗi tin chỉ được gắn tối đa 20 ảnh 360.' USING ERRCODE = '22023';
  END IF;

  PERFORM 1
    FROM public.user_listings l
   WHERE l.id = p_listing_id
     AND l.user_id = v_user_id
     AND l.status IN ('pending', 'rejected', 'expired')
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Tin đăng không tồn tại hoặc không thể chỉnh sửa.' USING ERRCODE = '42501';
  END IF;

  SELECT count(*)::integer
    INTO v_matched
    FROM public.user_listing_panoramas p
   WHERE p.id = ANY(COALESCE(p_panorama_ids, ARRAY[]::uuid[]))
     AND p.owner_user_id = v_user_id
     AND (p.user_listing_id IS NULL OR p.user_listing_id = p_listing_id)
     AND (p.user_listing_id = p_listing_id OR p.draft_id = p_draft_id);
  IF v_matched <> v_expected THEN
    RAISE EXCEPTION 'Danh sách ảnh 360 không hợp lệ hoặc không thuộc tài khoản.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.user_listing_panoramas
     SET user_listing_id = NULL,
         updated_at = now()
   WHERE user_listing_id = p_listing_id
     AND owner_user_id = v_user_id
     AND NOT (id = ANY(COALESCE(p_panorama_ids, ARRAY[]::uuid[])));

  UPDATE public.user_listing_panoramas
     SET user_listing_id = p_listing_id,
         updated_at = now()
   WHERE id = ANY(COALESCE(p_panorama_ids, ARRAY[]::uuid[]))
     AND owner_user_id = v_user_id
     AND (user_listing_id IS NULL OR user_listing_id = p_listing_id)
     AND (user_listing_id = p_listing_id OR draft_id = p_draft_id);
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.attach_user_listing_panoramas(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.attach_user_listing_panoramas(uuid, uuid, uuid[]) TO authenticated;

DROP POLICY IF EXISTS property_360_user_select ON storage.objects;
CREATE POLICY property_360_user_select ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'property-360'
    AND name ~ ('^user-listings/' || auth.uid()::text || '/[0-9a-fA-F-]{36}/[^/]+[.](jpe?g|webp)$')
  );

DROP POLICY IF EXISTS property_360_user_insert ON storage.objects;
CREATE POLICY property_360_user_insert ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'property-360'
    AND name ~ ('^user-listings/' || auth.uid()::text || '/[0-9a-fA-F-]{36}/[^/]+[.](jpe?g|webp)$')
  );

DROP POLICY IF EXISTS property_360_user_update ON storage.objects;
CREATE POLICY property_360_user_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'property-360'
    AND name ~ ('^user-listings/' || auth.uid()::text || '/[0-9a-fA-F-]{36}/[^/]+[.](jpe?g|webp)$')
    AND EXISTS (
      SELECT 1 FROM public.user_listing_panoramas p
      WHERE p.storage_path = storage.objects.name
        AND p.owner_user_id = auth.uid()
        AND (
          p.user_listing_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.user_listings l
            WHERE l.id = p.user_listing_id
              AND l.user_id = auth.uid()
              AND l.status IN ('pending', 'rejected', 'expired')
          )
        )
    )
  )
  WITH CHECK (
    bucket_id = 'property-360'
    AND name ~ ('^user-listings/' || auth.uid()::text || '/[0-9a-fA-F-]{36}/[^/]+[.](jpe?g|webp)$')
  );

DROP POLICY IF EXISTS property_360_user_delete ON storage.objects;
CREATE POLICY property_360_user_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'property-360'
    AND name ~ ('^user-listings/' || auth.uid()::text || '/[0-9a-fA-F-]{36}/[^/]+[.](jpe?g|webp)$')
    AND EXISTS (
      SELECT 1 FROM public.user_listing_panoramas p
      WHERE p.storage_path = storage.objects.name
        AND p.owner_user_id = auth.uid()
        AND (
          p.user_listing_id IS NULL
          OR EXISTS (
            SELECT 1 FROM public.user_listings l
            WHERE l.id = p.user_listing_id
              AND l.user_id = auth.uid()
              AND l.status IN ('pending', 'rejected', 'expired')
          )
        )
    )
  );

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
    RAISE EXCEPTION 'Không có quyền duyệt tin đăng' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_listing
    FROM public.user_listings
   WHERE id = p_listing_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tin đăng' USING ERRCODE = 'P0002';
  END IF;
  IF v_listing.status = 'approved' THEN
    RAISE EXCEPTION 'Tin đăng đã được duyệt; không thể duyệt trùng' USING ERRCODE = 'P0001';
  END IF;
  IF v_listing.status NOT IN ('pending', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'Trạng thái tin đăng không thể duyệt: %', v_listing.status USING ERRCODE = 'P0001';
  END IF;

  IF v_listing.property_id IS NOT NULL THEN
    SELECT p.is_active INTO v_prior_property_active
      FROM public.properties p
     WHERE p.id = v_listing.property_id
     FOR UPDATE;
    IF COALESCE(v_prior_property_active, false) THEN
      RAISE EXCEPTION 'Tin đăng còn property công khai liên kết; cần xử lý trạng thái hiện tại trước khi duyệt lại' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_expires_at := CASE
    WHEN v_listing.expires_at IS NOT NULL AND v_listing.expires_at > v_now THEN v_listing.expires_at
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
  ) RETURNING id INTO v_property_id;

  DELETE FROM public.property_panoramas
   WHERE property_id = v_listing.property_id
      OR storage_path IN (
        SELECT p.storage_path
          FROM public.user_listing_panoramas p
         WHERE p.user_listing_id = v_listing.id
           AND p.owner_user_id = v_listing.user_id
      );

  INSERT INTO public.property_panoramas (
    property_id, storage_path, original_filename, mime_type, size_bytes,
    width, height, label, sort_order, is_active
  )
  SELECT
    v_property_id, p.storage_path, p.original_filename, p.mime_type, p.size_bytes,
    p.width, p.height, p.label, p.sort_order, p.is_active
    FROM public.user_listing_panoramas p
   WHERE p.user_listing_id = v_listing.id
     AND p.owner_user_id = v_listing.user_id
   ORDER BY p.sort_order, p.created_at;

  UPDATE public.user_listings
     SET status = 'approved', property_id = v_property_id, expires_at = v_expires_at, reject_reason = NULL
   WHERE id = v_listing.id;

  RETURN QUERY SELECT v_property_id, v_listing.title, v_listing.description, v_listing.city,
    v_listing.district, v_listing.listing_type, v_listing.price, v_listing.price_unit, v_listing.area_sqm;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_user_listing(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_user_listing(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
