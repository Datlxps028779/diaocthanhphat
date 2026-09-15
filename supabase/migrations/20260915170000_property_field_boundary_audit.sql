-- Listing property field boundary and immutable change audit.
-- Production execution is user-run after local verification.
-- This migration does not mutate existing property rows.

BEGIN;

CREATE TABLE IF NOT EXISTS public.property_change_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES public.properties(id) ON DELETE RESTRICT,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_role text,
  changed_fields text[] NOT NULL,
  before_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  after_state jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT property_change_audit_events_fields_nonempty
    CHECK (cardinality(changed_fields) > 0),
  CONSTRAINT property_change_audit_events_states_object
    CHECK (jsonb_typeof(before_state) = 'object' AND jsonb_typeof(after_state) = 'object')
);

CREATE INDEX IF NOT EXISTS property_change_audit_events_property_created_idx
  ON public.property_change_audit_events (property_id, created_at DESC, id DESC);

REVOKE ALL ON TABLE public.property_change_audit_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_property_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_changed text[];
  v_sensitive text[] := ARRAY[
    'id', 'public_code', 'slug', 'created_at', 'updated_at',
    'is_verified', 'verification_status', 'verified_at', 'verified_until',
    'verification_scope_codes', 'views',
    'contact_name', 'contact_phone', 'contact_zalo'
  ];
BEGIN
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  v_before := to_jsonb(OLD);
  v_after := to_jsonb(NEW);
  v_changed := ARRAY(
    SELECT key
    FROM jsonb_object_keys(v_after) AS keys(key)
    WHERE v_after -> key IS DISTINCT FROM v_before -> key
      AND NOT (key = ANY(v_sensitive))
    ORDER BY key
  );

  IF cardinality(v_changed) IS NULL OR cardinality(v_changed) = 0 THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.property_change_audit_events (
    property_id,
    actor_id,
    actor_role,
    changed_fields,
    before_state,
    after_state
  )
  VALUES (
    NEW.id,
    auth.uid(),
    NULLIF(current_setting('request.jwt.claim.role', true), ''),
    v_changed,
    v_before - v_sensitive,
    v_after - v_sensitive
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_staff_property_field_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_neighborhood_id uuid;
  v_changed text[];
  v_edit_fields text[] := ARRAY[
    'title', 'description', 'price', 'price_unit', 'price_label',
    'price_per_month', 'area_sqm', 'legal_status', 'bedrooms', 'bathrooms',
    'direction', 'frontage', 'floor_number', 'floor_count', 'road_width',
    'address', 'city', 'district', 'ward', 'area_id', 'district_id',
    'ward_id', 'neighborhood_slug', 'property_type_id', 'latitude',
    'longitude', 'formatted_address', 'loan_support'
  ];
  v_seo_fields text[] := ARRAY[
    'meta_title', 'meta_description', 'focus_keywords', 'faq', 'schema_markup'
  ];
  v_media_fields text[] := ARRAY[
    'image_url', 'images', 'video_url', 'vr_tour_url'
  ];
  v_publish_fields text[] := ARRAY['is_active'];
  v_disallowed text[];
BEGIN
  IF TG_OP <> 'UPDATE' OR public.is_admin() THEN
    RETURN NEW;
  END IF;

  SELECT n.id
  INTO v_neighborhood_id
  FROM public.neighborhoods AS n
  WHERE n.slug = NEW.neighborhood_slug
  LIMIT 1;

  IF NOT public.has_staff_permission(
    'properties',
    'edit',
    NEW.area_id,
    NEW.district_id,
    NEW.ward_id,
    v_neighborhood_id
  ) THEN
    RAISE EXCEPTION 'Không có quyền chỉnh sửa bất động sản trong phạm vi này'
      USING ERRCODE = '42501';
  END IF;

  v_changed := ARRAY(
    SELECT key
    FROM jsonb_object_keys(to_jsonb(NEW)) AS keys(key)
    WHERE to_jsonb(NEW) -> key IS DISTINCT FROM to_jsonb(OLD) -> key
      AND key <> 'updated_at'
    ORDER BY key
  );

  v_disallowed := ARRAY(
    SELECT field
    FROM unnest(v_changed) AS changed(field)
    WHERE field NOT IN (
      SELECT allowed_field
      FROM unnest(v_edit_fields || v_seo_fields || v_media_fields || v_publish_fields)
        AS allowed(allowed_field)
    )
  );

  IF cardinality(v_disallowed) > 0 THEN
    RAISE EXCEPTION 'Staff không được sửa các field: %', array_to_string(v_disallowed, ', ')
      USING ERRCODE = '42501';
  END IF;

  IF v_changed && v_seo_fields
     AND NOT public.has_staff_permission(
       'properties', 'manage_seo', NEW.area_id, NEW.district_id,
       NEW.ward_id, v_neighborhood_id
     ) THEN
    RAISE EXCEPTION 'Không có quyền quản lý SEO bất động sản trong phạm vi này'
      USING ERRCODE = '42501';
  END IF;

  IF v_changed && v_media_fields
     AND NOT public.has_staff_permission(
       'properties', 'manage_media', NEW.area_id, NEW.district_id,
       NEW.ward_id, v_neighborhood_id
     ) THEN
    RAISE EXCEPTION 'Không có quyền quản lý media bất động sản trong phạm vi này'
      USING ERRCODE = '42501';
  END IF;

  IF v_changed && v_publish_fields
     AND NEW.is_active IS DISTINCT FROM OLD.is_active
     AND NOT public.has_staff_permission(
       'properties', 'publish', NEW.area_id, NEW.district_id,
       NEW.ward_id, v_neighborhood_id
     ) THEN
    RAISE EXCEPTION 'Không có quyền đăng/xuất bản bất động sản trong phạm vi này'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_staff_property_field_escalation
  ON public.properties;
CREATE TRIGGER trg_prevent_staff_property_field_escalation
  BEFORE UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_staff_property_field_escalation();

DROP TRIGGER IF EXISTS trg_audit_property_change
  ON public.properties;
CREATE TRIGGER trg_audit_property_change
  AFTER UPDATE ON public.properties
  FOR EACH ROW
  EXECUTE FUNCTION public.audit_property_change();

REVOKE ALL ON FUNCTION public.audit_property_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.prevent_staff_property_field_escalation() FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Rollback manually, only after review:
-- DROP TRIGGER IF EXISTS trg_audit_property_change ON public.properties;
-- DROP TRIGGER IF EXISTS trg_prevent_staff_property_field_escalation ON public.properties;
-- DROP FUNCTION IF EXISTS public.audit_property_change();
-- DROP FUNCTION IF EXISTS public.prevent_staff_property_field_escalation();
-- DROP TABLE IF EXISTS public.property_change_audit_events;
