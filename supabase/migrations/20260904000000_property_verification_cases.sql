-- =============================================================================
-- P7: evidence-backed property verification (additive, owner-MFA decisions)
-- =============================================================================
-- This migration does not infer evidence from historical properties.is_verified.
-- The legacy boolean remains a database-managed compatibility projection only.

BEGIN;

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verification_scope_codes text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_until timestamptz;

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_verification_status_check;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_verification_status_check
  CHECK (verification_status IN ('unverified', 'verified', 'revoked'));

ALTER TABLE public.properties
  ADD CONSTRAINT properties_verified_window_check
  CHECK (
    (verification_status = 'verified' AND verified_at IS NOT NULL AND verified_until IS NOT NULL AND verified_until > verified_at)
    OR (verification_status <> 'verified' AND verified_at IS NULL AND verified_until IS NULL)
  );

CREATE TABLE IF NOT EXISTS public.property_verification_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  user_listing_id uuid REFERENCES public.user_listings(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'submitted', 'verified', 'rejected', 'revoked', 'withdrawn', 'superseded'
  )),
  scope_codes text[] NOT NULL DEFAULT '{}'::text[] CHECK (cardinality(scope_codes) > 0 AND array_position(scope_codes, NULL) IS NULL),
  public_reason_codes text[] NOT NULL DEFAULT '{}'::text[] CHECK (array_position(public_reason_codes, NULL) IS NULL),
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  submitted_at timestamptz,
  reviewed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  verified_until timestamptz,
  decision_note_internal text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_verification_case_public_reasons_subset
    CHECK (public_reason_codes <@ scope_codes),
  CONSTRAINT property_verification_case_verified_fields
    CHECK (
      status <> 'verified'
      OR (reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL AND verified_until IS NOT NULL AND cardinality(public_reason_codes) > 0)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS property_verification_one_open_case_idx
  ON public.property_verification_cases(property_id)
  WHERE status IN ('draft', 'submitted', 'verified');
CREATE INDEX IF NOT EXISTS property_verification_cases_property_idx
  ON public.property_verification_cases(property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS property_verification_cases_queue_idx
  ON public.property_verification_cases(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.property_verification_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.property_verification_cases(id) ON DELETE RESTRICT,
  kind text NOT NULL CHECK (kind IN ('contact_confirmation', 'location_reference', 'media_reference', 'document_reference', 'other')),
  storage_path text NOT NULL UNIQUE,
  file_name text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 10485760),
  submitted_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_verification_evidence_private_path
    CHECK (storage_path ~ '^cases/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$')
);
CREATE INDEX IF NOT EXISTS property_verification_evidence_case_idx
  ON public.property_verification_evidence(case_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.property_verification_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id uuid NOT NULL REFERENCES public.property_verification_cases(id) ON DELETE RESTRICT,
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('opened', 'evidence_added', 'submitted', 'verified', 'rejected', 'revoked', 'withdrawn', 'superseded')),
  from_status text,
  to_status text,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('admin', 'system')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS property_verification_events_case_time_idx
  ON public.property_verification_events(case_id, occurred_at DESC);

ALTER TABLE public.property_verification_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_verification_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.property_verification_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "property_verification_cases_admin_select" ON public.property_verification_cases;
CREATE POLICY "property_verification_cases_admin_select" ON public.property_verification_cases
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "property_verification_evidence_admin_select" ON public.property_verification_evidence;
CREATE POLICY "property_verification_evidence_admin_select" ON public.property_verification_evidence
  FOR SELECT TO authenticated USING (public.is_admin());
DROP POLICY IF EXISTS "property_verification_events_admin_select" ON public.property_verification_events;
CREATE POLICY "property_verification_events_admin_select" ON public.property_verification_events
  FOR SELECT TO authenticated USING (public.is_admin());

REVOKE ALL ON TABLE public.property_verification_cases FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.property_verification_evidence FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.property_verification_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.property_verification_cases TO authenticated;
GRANT SELECT ON TABLE public.property_verification_evidence TO authenticated;
GRANT SELECT ON TABLE public.property_verification_events TO authenticated;

INSERT INTO storage.buckets (id, name, public)
VALUES ('verification-evidence', 'verification-evidence', false)
ON CONFLICT (id) DO UPDATE SET public = false;

DROP POLICY IF EXISTS "verification_evidence_owner_select" ON storage.objects;
DROP POLICY IF EXISTS "verification_evidence_owner_insert" ON storage.objects;
DROP POLICY IF EXISTS "verification_evidence_owner_delete" ON storage.objects;
CREATE POLICY "verification_evidence_owner_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'verification-evidence' AND public.is_owner_mfa());
CREATE POLICY "verification_evidence_owner_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'verification-evidence'
    AND public.is_owner_mfa()
    AND name ~ '^cases/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$'
    AND metadata ->> 'mimetype' IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp')
    AND (metadata ->> 'size') ~ '^[0-9]+$'
    AND (metadata ->> 'size')::integer > 0
    AND (metadata ->> 'size')::integer <= 10485760
  );
CREATE POLICY "verification_evidence_owner_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'verification-evidence' AND public.is_owner_mfa());

CREATE OR REPLACE FUNCTION public.property_verification_actor_role()
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.is_admin() THEN RETURN 'admin'; END IF;
  RAISE EXCEPTION 'Chỉ chủ hệ thống đã xác thực MFA được thao tác hồ sơ xác minh'
    USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.property_verification_actor_role() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.property_verification_internal_write_enabled()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT current_setting('app.property_verification_write', true) = 'true'
$$;
REVOKE ALL ON FUNCTION public.property_verification_internal_write_enabled() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.guard_property_verification_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF public.property_verification_internal_write_enabled() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' AND (NEW.is_verified OR NEW.verification_status <> 'unverified' OR cardinality(NEW.verification_scope_codes) > 0 OR NEW.verified_at IS NOT NULL OR NEW.verified_until IS NOT NULL) THEN
    RAISE EXCEPTION 'Trạng thái xác minh chỉ được thay đổi qua quy trình hồ sơ xác minh'
      USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'UPDATE' AND (
    NEW.is_verified IS DISTINCT FROM OLD.is_verified
    OR NEW.verification_status IS DISTINCT FROM OLD.verification_status
    OR NEW.verification_scope_codes IS DISTINCT FROM OLD.verification_scope_codes
    OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
    OR NEW.verified_until IS DISTINCT FROM OLD.verified_until
  ) THEN
    RAISE EXCEPTION 'Trạng thái xác minh chỉ được thay đổi qua quy trình hồ sơ xác minh'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_property_verification_projection() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_property_verification_projection ON public.properties;
CREATE TRIGGER trg_guard_property_verification_projection
  BEFORE INSERT OR UPDATE ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.guard_property_verification_projection();

CREATE OR REPLACE FUNCTION public.guard_property_verification_history()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Lịch sử hồ sơ xác minh là bất biến'
    USING ERRCODE = '42501';
END;
$$;
REVOKE ALL ON FUNCTION public.guard_property_verification_history() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_property_verification_evidence_history ON public.property_verification_evidence;
CREATE TRIGGER trg_guard_property_verification_evidence_history
  BEFORE UPDATE OR DELETE ON public.property_verification_evidence
  FOR EACH ROW EXECUTE FUNCTION public.guard_property_verification_history();

DROP TRIGGER IF EXISTS trg_guard_property_verification_events_history ON public.property_verification_events;
CREATE TRIGGER trg_guard_property_verification_events_history
  BEFORE UPDATE OR DELETE ON public.property_verification_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_property_verification_history();

CREATE OR REPLACE FUNCTION public.property_verification_scope_changed(
  p_property_id uuid,
  p_previous jsonb,
  p_current jsonb
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.property_verification_cases c
    WHERE c.property_id = p_property_id
      AND c.status = 'verified'
      AND (
        (
          'contact_confirmed' = ANY(c.scope_codes)
          AND (
            p_previous ->> 'contact_name' IS DISTINCT FROM p_current ->> 'contact_name'
            OR p_previous ->> 'contact_phone' IS DISTINCT FROM p_current ->> 'contact_phone'
            OR p_previous ->> 'contact_zalo' IS DISTINCT FROM p_current ->> 'contact_zalo'
          )
        )
        OR (
          'location_info_reviewed' = ANY(c.scope_codes)
          AND (
            p_previous ->> 'address' IS DISTINCT FROM p_current ->> 'address'
            OR p_previous ->> 'city' IS DISTINCT FROM p_current ->> 'city'
            OR p_previous ->> 'district' IS DISTINCT FROM p_current ->> 'district'
            OR p_previous ->> 'ward' IS DISTINCT FROM p_current ->> 'ward'
            OR p_previous ->> 'area_id' IS DISTINCT FROM p_current ->> 'area_id'
            OR p_previous ->> 'district_id' IS DISTINCT FROM p_current ->> 'district_id'
            OR p_previous ->> 'neighborhood_slug' IS DISTINCT FROM p_current ->> 'neighborhood_slug'
            OR p_previous ->> 'latitude' IS DISTINCT FROM p_current ->> 'latitude'
            OR p_previous ->> 'longitude' IS DISTINCT FROM p_current ->> 'longitude'
            OR p_previous ->> 'formatted_address' IS DISTINCT FROM p_current ->> 'formatted_address'
          )
        )
        OR (
          'media_reviewed' = ANY(c.scope_codes)
          AND (
            p_previous ->> 'image_url' IS DISTINCT FROM p_current ->> 'image_url'
            OR p_previous -> 'images' IS DISTINCT FROM p_current -> 'images'
            OR p_previous ->> 'video_url' IS DISTINCT FROM p_current ->> 'video_url'
            OR p_previous ->> 'vr_tour_url' IS DISTINCT FROM p_current ->> 'vr_tour_url'
          )
        )
        OR (
          'listing_details_reviewed' = ANY(c.scope_codes)
          AND (
            p_previous ->> 'title' IS DISTINCT FROM p_current ->> 'title'
            OR p_previous ->> 'description' IS DISTINCT FROM p_current ->> 'description'
            OR p_previous ->> 'price' IS DISTINCT FROM p_current ->> 'price'
            OR p_previous ->> 'price_unit' IS DISTINCT FROM p_current ->> 'price_unit'
            OR p_previous ->> 'price_label' IS DISTINCT FROM p_current ->> 'price_label'
            OR p_previous ->> 'price_per_month' IS DISTINCT FROM p_current ->> 'price_per_month'
            OR p_previous ->> 'loan_support' IS DISTINCT FROM p_current ->> 'loan_support'
            OR p_previous ->> 'listing_type' IS DISTINCT FROM p_current ->> 'listing_type'
            OR p_previous ->> 'area_sqm' IS DISTINCT FROM p_current ->> 'area_sqm'
            OR p_previous ->> 'property_type_id' IS DISTINCT FROM p_current ->> 'property_type_id'
            OR p_previous ->> 'legal_status' IS DISTINCT FROM p_current ->> 'legal_status'
            OR p_previous ->> 'bedrooms' IS DISTINCT FROM p_current ->> 'bedrooms'
            OR p_previous ->> 'bathrooms' IS DISTINCT FROM p_current ->> 'bathrooms'
            OR p_previous ->> 'direction' IS DISTINCT FROM p_current ->> 'direction'
            OR p_previous -> 'amenities' IS DISTINCT FROM p_current -> 'amenities'
          )
        )
        OR ('document_reference_reviewed' = ANY(c.scope_codes))
      )
  );
$$;
REVOKE ALL ON FUNCTION public.property_verification_scope_changed(uuid, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.supersede_property_verification_for_changed_scope(
  p_property_id uuid,
  p_previous jsonb,
  p_current jsonb,
  p_reason text DEFAULT 'verified_scope_changed'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_case public.property_verification_cases;
  v_actor uuid := auth.uid();
BEGIN
  IF NOT public.property_verification_scope_changed(p_property_id, p_previous, p_current) THEN
    RETURN false;
  END IF;

  SELECT * INTO v_case
  FROM public.property_verification_cases
  WHERE property_id = p_property_id AND status = 'verified'
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  PERFORM set_config('app.property_verification_write', 'true', true);
  UPDATE public.properties
  SET
    is_verified = false,
    verification_status = 'unverified',
    verification_scope_codes = '{}'::text[],
    verified_at = NULL,
    verified_until = NULL,
    updated_at = now()
  WHERE id = p_property_id;

  UPDATE public.property_verification_cases
  SET status = 'superseded', updated_at = now()
  WHERE id = v_case.id;

  INSERT INTO public.property_verification_events(case_id, property_id, event_type, from_status, to_status, actor_id, actor_role, metadata)
  VALUES (
    v_case.id,
    p_property_id,
    'superseded',
    'verified',
    'superseded',
    v_actor,
    CASE WHEN v_actor IS NULL THEN 'system' ELSE 'admin' END,
    jsonb_build_object('reason', p_reason)
  );

  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.supersede_property_verification_for_changed_scope(uuid, jsonb, jsonb, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.trg_supersede_property_verification_on_scope_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.supersede_property_verification_for_changed_scope(
    NEW.id,
    to_jsonb(OLD),
    to_jsonb(NEW),
    'property_fields_changed'
  );
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.trg_supersede_property_verification_on_scope_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_supersede_property_verification_on_scope_change ON public.properties;
CREATE TRIGGER trg_supersede_property_verification_on_scope_change
  AFTER UPDATE OF
    contact_name, contact_phone, contact_zalo,
    address, city, district, ward, area_id, district_id, neighborhood_slug,
    latitude, longitude, formatted_address,
    image_url, images, video_url, vr_tour_url,
    title, description, price, price_unit, price_label, price_per_month,
    loan_support, listing_type, area_sqm, property_type_id, legal_status,
    bedrooms, bathrooms, direction, amenities
  ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.trg_supersede_property_verification_on_scope_change();

CREATE OR REPLACE FUNCTION public.open_property_verification_case(
  p_property_id uuid,
  p_scope_codes text[],
  p_public_reason_codes text[] DEFAULT '{}'::text[],
  p_user_listing_id uuid DEFAULT NULL
)
RETURNS public.property_verification_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_case public.property_verification_cases;
  v_actor uuid := auth.uid();
  v_allowed text[] := ARRAY['contact_confirmed', 'location_info_reviewed', 'media_reviewed', 'listing_details_reviewed', 'document_reference_reviewed'];
BEGIN
  PERFORM public.property_verification_actor_role();
  IF p_scope_codes IS NULL
     OR cardinality(p_scope_codes) = 0
     OR array_position(p_scope_codes, NULL) IS NOT NULL
     OR NOT (p_scope_codes <@ v_allowed)
     OR array_position(coalesce(p_public_reason_codes, '{}'::text[]), NULL) IS NOT NULL
     OR NOT (coalesce(p_public_reason_codes, '{}'::text[]) <@ p_scope_codes) THEN
    RAISE EXCEPTION 'Phạm vi hoặc lý do công khai không hợp lệ' USING ERRCODE = '22023';
  END IF;
  PERFORM 1 FROM public.properties WHERE id = p_property_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tin không tồn tại hoặc không còn hiển thị' USING ERRCODE = 'P0002'; END IF;
  IF EXISTS (SELECT 1 FROM public.property_verification_cases WHERE property_id = p_property_id AND status IN ('draft', 'submitted', 'verified')) THEN
    RAISE EXCEPTION 'Tin đã có hồ sơ xác minh đang hiệu lực hoặc đang xử lý' USING ERRCODE = '23505';
  END IF;
  INSERT INTO public.property_verification_cases(property_id, user_listing_id, scope_codes, public_reason_codes, submitted_by)
  VALUES (p_property_id, p_user_listing_id, array(SELECT DISTINCT unnest(p_scope_codes) ORDER BY 1), array(SELECT DISTINCT unnest(coalesce(p_public_reason_codes, '{}'::text[])) ORDER BY 1), v_actor)
  RETURNING * INTO v_case;
  INSERT INTO public.property_verification_events(case_id, property_id, event_type, to_status, actor_id, actor_role, metadata)
  VALUES (v_case.id, v_case.property_id, 'opened', 'draft', v_actor, 'admin', jsonb_build_object('scope_codes', v_case.scope_codes, 'public_reason_codes', v_case.public_reason_codes));
  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_property_verification_evidence(
  p_case_id uuid,
  p_kind text,
  p_storage_path text,
  p_file_name text,
  p_mime_type text,
  p_size_bytes integer
)
RETURNS public.property_verification_evidence
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_case public.property_verification_cases;
  v_evidence public.property_verification_evidence;
  v_object_metadata jsonb;
  v_actor uuid := auth.uid();
BEGIN
  PERFORM public.property_verification_actor_role();
  SELECT * INTO v_case FROM public.property_verification_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND OR v_case.status <> 'draft' THEN RAISE EXCEPTION 'Chỉ được thêm bằng chứng cho hồ sơ nháp' USING ERRCODE = '22023'; END IF;
  IF p_storage_path !~ ('^cases/' || v_case.id::text || '/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$') THEN
    RAISE EXCEPTION 'Đường dẫn bằng chứng không thuộc hồ sơ' USING ERRCODE = '22023';
  END IF;
  SELECT metadata INTO v_object_metadata
  FROM storage.objects
  WHERE bucket_id = 'verification-evidence' AND name = p_storage_path
  FOR UPDATE;
  IF NOT FOUND
     OR v_object_metadata ->> 'mimetype' <> p_mime_type
     OR coalesce((v_object_metadata ->> 'size')::integer, -1) <> p_size_bytes THEN
    RAISE EXCEPTION 'Bằng chứng trong kho không khớp metadata đã khai báo' USING ERRCODE = '23514';
  END IF;
  INSERT INTO public.property_verification_evidence(case_id, kind, storage_path, file_name, mime_type, size_bytes, submitted_by)
  VALUES (p_case_id, p_kind, p_storage_path, p_file_name, p_mime_type, p_size_bytes, v_actor)
  RETURNING * INTO v_evidence;
  INSERT INTO public.property_verification_events(case_id, property_id, event_type, from_status, to_status, actor_id, actor_role, metadata)
  VALUES (v_case.id, v_case.property_id, 'evidence_added', 'draft', 'draft', v_actor, 'admin', jsonb_build_object('evidence_id', v_evidence.id, 'kind', v_evidence.kind));
  RETURN v_evidence;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_property_verification_case(p_case_id uuid)
RETURNS public.property_verification_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_case public.property_verification_cases; v_actor uuid := auth.uid();
BEGIN
  PERFORM public.property_verification_actor_role();
  SELECT * INTO v_case FROM public.property_verification_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND OR v_case.status <> 'draft' THEN RAISE EXCEPTION 'Hồ sơ không ở trạng thái nháp' USING ERRCODE = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.property_verification_evidence WHERE case_id = p_case_id) THEN RAISE EXCEPTION 'Cần ít nhất một bằng chứng trước khi gửi duyệt' USING ERRCODE = '23514'; END IF;
  UPDATE public.property_verification_cases SET status = 'submitted', submitted_at = now(), submitted_by = v_actor, updated_at = now() WHERE id = p_case_id RETURNING * INTO v_case;
  INSERT INTO public.property_verification_events(case_id, property_id, event_type, from_status, to_status, actor_id, actor_role)
  VALUES (v_case.id, v_case.property_id, 'submitted', 'draft', 'submitted', v_actor, 'admin');
  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_property_verification_case(
  p_case_id uuid,
  p_decision text,
  p_public_reason_codes text[] DEFAULT NULL,
  p_verified_until timestamptz DEFAULT NULL,
  p_decision_note_internal text DEFAULT NULL
)
RETURNS public.property_verification_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_case public.property_verification_cases; v_actor uuid := auth.uid(); v_next text;
BEGIN
  PERFORM public.property_verification_actor_role();
  IF p_decision NOT IN ('verified', 'rejected') THEN RAISE EXCEPTION 'Quyết định không hợp lệ' USING ERRCODE = '22023'; END IF;
  SELECT * INTO v_case FROM public.property_verification_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND OR v_case.status <> 'submitted' THEN RAISE EXCEPTION 'Chỉ hồ sơ đã gửi mới được quyết định' USING ERRCODE = '22023'; END IF;
  PERFORM 1 FROM public.properties WHERE id = v_case.property_id AND is_active = true FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tin không còn hiển thị để xác minh' USING ERRCODE = 'P0002'; END IF;
  v_next := p_decision;
  IF v_next = 'verified' THEN
    IF p_verified_until IS NULL
       OR p_verified_until <= now()
       OR array_position(coalesce(p_public_reason_codes, v_case.public_reason_codes), NULL) IS NOT NULL
       OR NOT (coalesce(p_public_reason_codes, v_case.public_reason_codes) <@ v_case.scope_codes)
       OR cardinality(coalesce(p_public_reason_codes, v_case.public_reason_codes)) = 0 THEN
      RAISE EXCEPTION 'Hồ sơ đã xác minh cần lý do công khai hợp lệ và thời hạn còn hiệu lực' USING ERRCODE = '23514';
    END IF;
    PERFORM set_config('app.property_verification_write', 'true', true);
    UPDATE public.properties SET is_verified = true, verification_status = 'verified', verification_scope_codes = array(SELECT DISTINCT unnest(coalesce(p_public_reason_codes, v_case.public_reason_codes)) ORDER BY 1), verified_at = now(), verified_until = p_verified_until, updated_at = now() WHERE id = v_case.property_id;
  ELSE
    PERFORM set_config('app.property_verification_write', 'true', true);
    UPDATE public.properties SET is_verified = false, verification_status = 'unverified', verification_scope_codes = '{}'::text[], verified_at = NULL, verified_until = NULL, updated_at = now() WHERE id = v_case.property_id;
  END IF;
  UPDATE public.property_verification_cases SET status = v_next, public_reason_codes = coalesce(p_public_reason_codes, public_reason_codes), reviewed_by = v_actor, reviewed_at = now(), verified_until = CASE WHEN v_next = 'verified' THEN p_verified_until ELSE NULL END, decision_note_internal = NULLIF(btrim(p_decision_note_internal), ''), updated_at = now() WHERE id = p_case_id RETURNING * INTO v_case;
  INSERT INTO public.property_verification_events(case_id, property_id, event_type, from_status, to_status, actor_id, actor_role, metadata)
  VALUES (v_case.id, v_case.property_id, v_next, 'submitted', v_next, v_actor, 'admin', jsonb_build_object('public_reason_codes', v_case.public_reason_codes, 'verified_until', v_case.verified_until));
  RETURN v_case;
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_property_verification_cases()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_case record;
  v_count integer := 0;
  v_actor_role text := CASE WHEN auth.uid() IS NULL THEN 'system' ELSE 'admin' END;
BEGIN
  -- pg_cron runs without a JWT; a manual invocation must still be owner-MFA.
  IF auth.uid() IS NOT NULL AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ chủ hệ thống đã xác thực MFA được hết hạn hồ sơ xác minh'
      USING ERRCODE = '42501';
  END IF;

  FOR v_case IN
    SELECT c.id, c.property_id
    FROM public.property_verification_cases c
    JOIN public.properties p ON p.id = c.property_id
    WHERE c.status = 'verified'
      AND c.verified_until <= now()
      AND p.verification_status = 'verified'
      AND p.verified_until <= now()
    FOR UPDATE OF c, p
  LOOP
    PERFORM set_config('app.property_verification_write', 'true', true);
    UPDATE public.properties
    SET
      is_verified = false,
      verification_status = 'unverified',
      verification_scope_codes = '{}'::text[],
      verified_at = NULL,
      verified_until = NULL,
      updated_at = now()
    WHERE id = v_case.property_id;

    UPDATE public.property_verification_cases
    SET status = 'superseded', updated_at = now()
    WHERE id = v_case.id;

    INSERT INTO public.property_verification_events(case_id, property_id, event_type, from_status, to_status, actor_id, actor_role, metadata)
    VALUES (v_case.id, v_case.property_id, 'superseded', 'verified', 'superseded', auth.uid(), v_actor_role, jsonb_build_object('reason', 'expired'));

    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_property_verification_cases() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.expire_property_verification_cases() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule('expire-property-verification-cases')
      WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'expire-property-verification-cases');
    PERFORM cron.schedule('expire-property-verification-cases', '13 * * * *', 'SELECT public.expire_property_verification_cases();');
  ELSE
    RAISE NOTICE 'pg_cron chưa bật — trạng thái công khai vẫn fail-closed theo verified_until; cần bật pg_cron để dọn projection và ghi audit hết hạn.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_property_verification_case(p_case_id uuid, p_note_internal text DEFAULT NULL)
RETURNS public.property_verification_cases
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_case public.property_verification_cases; v_actor uuid := auth.uid();
BEGIN
  PERFORM public.property_verification_actor_role();
  SELECT * INTO v_case FROM public.property_verification_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND OR v_case.status <> 'verified' THEN RAISE EXCEPTION 'Chỉ hồ sơ đã xác minh mới được thu hồi' USING ERRCODE = '22023'; END IF;
  PERFORM set_config('app.property_verification_write', 'true', true);
  UPDATE public.properties SET is_verified = false, verification_status = 'revoked', verification_scope_codes = '{}'::text[], verified_at = NULL, verified_until = NULL, updated_at = now() WHERE id = v_case.property_id;
  UPDATE public.property_verification_cases SET status = 'revoked', decision_note_internal = NULLIF(btrim(p_note_internal), ''), updated_at = now() WHERE id = p_case_id RETURNING * INTO v_case;
  INSERT INTO public.property_verification_events(case_id, property_id, event_type, from_status, to_status, actor_id, actor_role)
  VALUES (v_case.id, v_case.property_id, 'revoked', 'verified', 'revoked', v_actor, 'admin');
  RETURN v_case;
END;
$$;

REVOKE ALL ON FUNCTION public.open_property_verification_case(uuid, text[], text[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_property_verification_evidence(uuid, text, text, text, text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.submit_property_verification_case(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_property_verification_case(uuid, text, text[], timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_property_verification_case(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_property_verification_case(uuid, text[], text[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_property_verification_evidence(uuid, text, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_property_verification_case(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_property_verification_case(uuid, text, text[], timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_property_verification_case(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
