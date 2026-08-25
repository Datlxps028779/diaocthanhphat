-- =============================================================================
-- Admin/staff review editor for pending user listings
-- =============================================================================
-- Review edits stay in user_listings. Publication remains exclusively owned by
-- approve_user_listing(), so an editor cannot create or mutate a public property.

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
  IF NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền chỉnh tin chờ duyệt' USING ERRCODE = '42501';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Dữ liệu chỉnh sửa không hợp lệ' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_listing
    FROM public.user_listings
   WHERE id = p_listing_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tin đăng' USING ERRCODE = 'P0002';
  END IF;
  IF v_listing.status <> 'pending' THEN
    RAISE EXCEPTION 'Chỉ được chỉnh tin đang chờ duyệt' USING ERRCODE = 'P0001';
  END IF;

  -- Filter before populating the composite row. Identity, ownership and
  -- lifecycle columns never enter the candidate row, even if a compromised
  -- client sends them in the JSON payload.
  SELECT COALESCE(jsonb_object_agg(key, value), '{}'::jsonb)
    INTO v_allowed
    FROM jsonb_each(p_patch)
   WHERE key IN (
     'title', 'description', 'price', 'price_unit', 'price_label', 'listing_type',
     'price_per_month', 'loan_support', 'area_sqm', 'address', 'city', 'district',
     'ward', 'neighborhood_slug', 'area_id', 'district_id', 'property_type_id',
     'image_url', 'images', 'legal_status', 'bedrooms', 'bathrooms', 'direction',
     'contact_name', 'contact_phone', 'contact_zalo', 'amenities', 'latitude',
     'longitude', 'formatted_address', 'vr_tour_url', 'video_url', 'meta_title',
     'meta_description', 'focus_keywords', 'schema_markup', 'faq'
   );
  v_next := jsonb_populate_record(v_listing, v_allowed);

  UPDATE public.user_listings
     SET title = v_next.title,
         description = v_next.description,
         price = v_next.price,
         price_unit = v_next.price_unit,
         price_label = v_next.price_label,
         listing_type = v_next.listing_type,
         price_per_month = v_next.price_per_month,
         loan_support = v_next.loan_support,
         area_sqm = v_next.area_sqm,
         address = v_next.address,
         city = v_next.city,
         district = v_next.district,
         ward = v_next.ward,
         neighborhood_slug = v_next.neighborhood_slug,
         area_id = v_next.area_id,
         district_id = v_next.district_id,
         property_type_id = v_next.property_type_id,
         image_url = v_next.image_url,
         images = v_next.images,
         legal_status = v_next.legal_status,
         bedrooms = v_next.bedrooms,
         bathrooms = v_next.bathrooms,
         direction = v_next.direction,
         contact_name = v_next.contact_name,
         contact_phone = v_next.contact_phone,
         contact_zalo = v_next.contact_zalo,
         amenities = v_next.amenities,
         latitude = v_next.latitude,
         longitude = v_next.longitude,
         formatted_address = v_next.formatted_address,
         vr_tour_url = v_next.vr_tour_url,
         video_url = v_next.video_url,
         meta_title = v_next.meta_title,
         meta_description = v_next.meta_description,
         focus_keywords = v_next.focus_keywords,
         schema_markup = v_next.schema_markup,
         faq = v_next.faq,
         reject_reason = NULL,
         updated_at = now()
   WHERE id = p_listing_id
   RETURNING * INTO v_next;

  RETURN v_next;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_pending_user_listing(uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_pending_user_listing(uuid, jsonb)
  TO authenticated;

-- Extend the immutable event vocabulary before the audit trigger can emit it.
ALTER TABLE public.user_listing_lifecycle_events
  DROP CONSTRAINT IF EXISTS user_listing_lifecycle_events_event_type_check;
ALTER TABLE public.user_listing_lifecycle_events
  ADD CONSTRAINT user_listing_lifecycle_events_event_type_check CHECK (event_type IN (
    'submitted', 'approved', 'rejected', 'resubmitted', 'renewed', 'expired',
    'expiry_changed', 'deleted', 'admin_edited'
  ));

-- Content-only admin edits are auditable without changing lifecycle status.
CREATE OR REPLACE FUNCTION public.capture_admin_user_listing_edit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_role text;
BEGIN
  IF OLD.status <> 'pending' OR NEW.status <> 'pending' THEN RETURN NEW; END IF;
  IF OLD IS NOT DISTINCT FROM NEW THEN RETURN NEW; END IF;
  IF NOT public.is_admin_or_staff() OR v_actor IS NULL THEN RETURN NEW; END IF;
  SELECT CASE WHEN p.role = 'admin' THEN 'admin' ELSE 'staff' END INTO v_role
    FROM public.profiles p WHERE p.id = v_actor;
  IF v_role IS NULL THEN RETURN NEW; END IF; /* fail closed if profile lookup is incomplete */
  INSERT INTO public.user_listing_lifecycle_events (
    listing_id, listing_owner_id, property_id, event_type,
    from_status, to_status, actor_id, actor_role, metadata
  ) VALUES (
    NEW.id, NEW.user_id, NEW.property_id, 'admin_edited',
    OLD.status, NEW.status, v_actor, v_role,
    jsonb_build_object('edited_at', now())
  );
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_admin_user_listing_edit() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_admin_user_listing_edit ON public.user_listings;
CREATE TRIGGER trg_admin_user_listing_edit
  AFTER UPDATE ON public.user_listings
  FOR EACH ROW
  WHEN (
    OLD.status = 'pending' AND NEW.status = 'pending' AND (
      OLD.title IS DISTINCT FROM NEW.title
      OR OLD.description IS DISTINCT FROM NEW.description
      OR OLD.price IS DISTINCT FROM NEW.price
      OR OLD.price_unit IS DISTINCT FROM NEW.price_unit
      OR OLD.image_url IS DISTINCT FROM NEW.image_url
      OR OLD.images IS DISTINCT FROM NEW.images
      OR OLD.city IS DISTINCT FROM NEW.city
      OR OLD.district IS DISTINCT FROM NEW.district
      OR OLD.ward IS DISTINCT FROM NEW.ward
      OR OLD.meta_title IS DISTINCT FROM NEW.meta_title
      OR OLD.meta_description IS DISTINCT FROM NEW.meta_description
    )
  )
  EXECUTE FUNCTION public.capture_admin_user_listing_edit();

NOTIFY pgrst, 'reload schema';
