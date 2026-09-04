-- P15: role-aware agent profile directory, workspace projections, and audit trail.
-- Production execution is user-run after read-only measurement.

CREATE TABLE IF NOT EXISTS public.agent_profile_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_profile_id uuid NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN ('created', 'updated', 'published', 'disabled', 'deleted')),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_profile_audit_profile_idx
  ON public.agent_profile_audit_events (agent_profile_id, created_at DESC, id DESC);

ALTER TABLE public.agent_profile_audit_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agent_profile_audit_events FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_agent_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_action text;
BEGIN
  v_action := CASE
    WHEN TG_OP = 'INSERT' THEN 'created'
    WHEN TG_OP = 'DELETE' THEN 'deleted'
    WHEN OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'published' THEN 'published'
    WHEN OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'disabled' THEN 'disabled'
    ELSE 'updated'
  END;

  INSERT INTO public.agent_profile_audit_events (
    agent_profile_id, actor_id, action, before_state, after_state
  ) VALUES (
    COALESCE(NEW.id, OLD.id), auth.uid(), v_action,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE ALL ON FUNCTION public.audit_agent_profile_change() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_agent_profile_audit ON public.agent_profiles;
CREATE TRIGGER trg_agent_profile_audit
  AFTER INSERT OR UPDATE OR DELETE ON public.agent_profiles
  FOR EACH ROW EXECUTE FUNCTION public.audit_agent_profile_change();

UPDATE public.agent_profiles ap
SET status = 'disabled', updated_at = now()
FROM public.profiles p
WHERE p.id = ap.user_id
  AND p.role <> 'user'
  AND ap.status <> 'disabled';

CREATE OR REPLACE FUNCTION public.get_agent_profile_directory(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  profile_id uuid,
  user_id uuid,
  slug text,
  display_name text,
  bio text,
  avatar_url text,
  public_phone text,
  public_zalo text,
  status text,
  profile_created_at timestamptz,
  profile_updated_at timestamptz,
  account_created_at timestamptz,
  last_seen_at timestamptz,
  owner_role text,
  listing_count integer,
  lead_count integer,
  completeness_score integer,
  missing_fields text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền xem directory hồ sơ' USING ERRCODE = '42501';
  END IF;
  IF p_limit < 1 OR p_limit > 100 OR p_offset < 0 OR p_offset > 100000 THEN
    RAISE EXCEPTION 'Phân trang không hợp lệ' USING ERRCODE = '22023';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('draft', 'published', 'disabled') THEN
    RAISE EXCEPTION 'Trạng thái hồ sơ không hợp lệ' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT ap.*, p.created_at AS account_created_at, p.last_seen_at, p.role AS owner_role,
      (SELECT COUNT(*)::integer
       FROM public.user_listings ul
       JOIN public.properties pr ON pr.id = ul.property_id
       WHERE ul.user_id = ap.user_id AND ul.status = 'approved' AND pr.is_active = true) AS listing_count,
      (SELECT COUNT(DISTINCT l.id)::integer
       FROM public.user_listings ul
       JOIN public.properties pr ON pr.id = ul.property_id AND pr.is_active = true
       JOIN public.leads l ON l.property_id = pr.id
       WHERE ul.user_id = ap.user_id AND ul.status = 'approved') AS lead_count
    FROM public.agent_profiles ap
    JOIN public.profiles p ON p.id = ap.user_id
    WHERE (public.is_admin() OR ap.user_id = auth.uid())
      AND (p_search IS NULL OR p_search = '' OR ap.display_name ILIKE '%' || p_search || '%' OR ap.slug ILIKE '%' || p_search || '%')
      AND (p_status IS NULL OR ap.status = p_status)
  ), scored AS (
    SELECT base.*,
      ARRAY_REMOVE(ARRAY[
        CASE WHEN NULLIF(btrim(base.display_name), '') IS NULL THEN 'display_name' END,
        CASE WHEN NULLIF(btrim(base.bio), '') IS NULL THEN 'bio' END,
        CASE WHEN NULLIF(btrim(base.avatar_url), '') IS NULL THEN 'avatar_url' END,
        CASE WHEN NULLIF(btrim(base.public_phone), '') IS NULL AND NULLIF(btrim(base.public_zalo), '') IS NULL THEN 'contact' END,
        CASE WHEN base.listing_count = 0 THEN 'approved_listing' END
      ], NULL)::text[] AS missing_fields
    FROM base
  )
  SELECT scored.id, scored.user_id, scored.slug, scored.display_name, scored.bio,
         scored.avatar_url, scored.public_phone, scored.public_zalo, scored.status,
         scored.created_at, scored.updated_at, scored.account_created_at, scored.last_seen_at,
         scored.owner_role, scored.listing_count, scored.lead_count,
         ((5 - cardinality(scored.missing_fields)) * 20)::integer,
         scored.missing_fields
  FROM scored
  ORDER BY scored.updated_at DESC, scored.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_agent_profile_directory(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_profile_directory(text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_agent_profile(
  p_profile_id uuid,
  p_patch jsonb
)
RETURNS public.agent_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_current public.agent_profiles;
  v_result public.agent_profiles;
  v_is_admin boolean := public.is_admin();
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền sửa hồ sơ' USING ERRCODE = '42501';
  END IF;
  IF p_patch IS NULL OR jsonb_typeof(p_patch) <> 'object' THEN
    RAISE EXCEPTION 'Dữ liệu hồ sơ không hợp lệ' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_patch) AS item(key)
    WHERE key NOT IN ('slug', 'display_name', 'bio', 'avatar_url', 'public_phone', 'public_zalo', 'status')
  ) THEN
    RAISE EXCEPTION 'Trường hồ sơ không được phép' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current
  FROM public.agent_profiles
  WHERE id = p_profile_id
    AND (v_is_admin OR user_id = auth.uid())
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy hồ sơ hoặc ngoài phạm vi phụ trách' USING ERRCODE = '42501';
  END IF;
  IF NOT v_is_admin AND p_patch ? 'status' THEN
    RAISE EXCEPTION 'Chỉ admin được thay đổi trạng thái xuất bản' USING ERRCODE = '42501';
  END IF;
  IF p_patch ? 'status' AND (p_patch->>'status') IS NULL THEN
    RAISE EXCEPTION 'Trạng thái hồ sơ không hợp lệ' USING ERRCODE = '22023';
  END IF;
  IF p_patch ? 'status' AND p_patch->>'status' NOT IN ('draft', 'published', 'disabled') THEN
    RAISE EXCEPTION 'Trạng thái hồ sơ không hợp lệ' USING ERRCODE = '22023';
  END IF;

  UPDATE public.agent_profiles
  SET slug = CASE WHEN p_patch ? 'slug' THEN lower(btrim(p_patch->>'slug')) ELSE v_current.slug END,
      display_name = CASE WHEN p_patch ? 'display_name' THEN btrim(p_patch->>'display_name') ELSE v_current.display_name END,
      bio = CASE WHEN p_patch ? 'bio' THEN NULLIF(btrim(p_patch->>'bio'), '') ELSE v_current.bio END,
      avatar_url = CASE WHEN p_patch ? 'avatar_url' THEN NULLIF(btrim(p_patch->>'avatar_url'), '') ELSE v_current.avatar_url END,
      public_phone = CASE WHEN p_patch ? 'public_phone' THEN NULLIF(btrim(p_patch->>'public_phone'), '') ELSE v_current.public_phone END,
      public_zalo = CASE WHEN p_patch ? 'public_zalo' THEN NULLIF(btrim(p_patch->>'public_zalo'), '') ELSE v_current.public_zalo END,
      status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE v_current.status END,
      updated_at = now()
  WHERE id = p_profile_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.update_agent_profile(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_agent_profile(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_agent_profile_audit(p_profile_id uuid)
RETURNS TABLE (
  id uuid,
  agent_profile_id uuid,
  actor_id uuid,
  action text,
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin_or_staff() THEN
    RAISE EXCEPTION 'Không có quyền xem lịch sử hồ sơ' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.agent_profiles ap
    WHERE ap.id = p_profile_id AND (public.is_admin() OR ap.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Hồ sơ ngoài phạm vi phụ trách' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.id, e.agent_profile_id, e.actor_id, e.action, e.before_state, e.after_state, e.created_at
  FROM public.agent_profile_audit_events e
  WHERE e.agent_profile_id = p_profile_id
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.get_agent_profile_audit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_profile_audit(uuid) TO authenticated;

-- A role change away from customer must not leave a public poster profile indexable.
CREATE OR REPLACE FUNCTION public.provision_agent_profile_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base text;
  v_slug text;
  v_display_name text := COALESCE(NULLIF(btrim(NEW.display_name), ''), 'Người đăng tin');
BEGIN
  IF NEW.role <> 'user' THEN
    UPDATE public.agent_profiles
    SET status = 'disabled', updated_at = now()
    WHERE user_id = NEW.id AND status <> 'disabled';
    RETURN NEW;
  END IF;

  v_base := regexp_replace(lower(btrim(COALESCE(NEW.display_name, ''))), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  IF v_base = '' THEN v_base := 'nguoi-dang-tin'; END IF;
  v_slug := left(v_base, 82) || '-' || substr(md5(NEW.id::text), 1, 16);

  INSERT INTO public.agent_profiles (user_id, slug, display_name, avatar_url, public_phone, status)
  VALUES (NEW.id, v_slug, v_display_name, NULLIF(btrim(NEW.avatar_url), ''), NULLIF(btrim(NEW.phone), ''), 'published')
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_agent_profile_from_profile() FROM PUBLIC, anon, authenticated;

-- Public profile must be a customer identity, not an internal staff identity.
CREATE OR REPLACE FUNCTION public.public_get_agent_profile(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', ap.id, 'slug', ap.slug, 'display_name', ap.display_name, 'bio', ap.bio,
    'avatar_url', ap.avatar_url, 'public_phone', ap.public_phone, 'public_zalo', ap.public_zalo,
    'account_created_at', p.created_at, 'last_login_at', au.last_sign_in_at,
    'is_online', COALESCE(p.last_seen_at > now() - interval '5 minutes', false), 'updated_at', ap.updated_at
  )
  FROM public.agent_profiles ap
  JOIN public.profiles p ON p.id = ap.user_id AND p.role = 'user'
  LEFT JOIN auth.users au ON au.id = ap.user_id
  WHERE ap.slug = lower(btrim(p_slug)) AND ap.status = 'published'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.public_get_agent_profile(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_agent_profile(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_get_agent_profile_listings(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', listing.id,
    'title', listing.title,
    'price', listing.price,
    'price_unit', listing.price_unit,
    'price_label', listing.price_label,
    'price_per_month', listing.price_per_month,
    'listing_type', listing.listing_type,
    'area_sqm', listing.area_sqm,
    'city', listing.city,
    'district', listing.district,
    'legal_status', listing.legal_status,
    'image_url', listing.image_url,
    'slug', listing.slug,
    'public_code', listing.public_code,
    'neighborhood_slug', listing.neighborhood_slug,
    'area_slug', listing.area_slug,
    'created_at', listing.created_at,
    'updated_at', listing.updated_at
  ) ORDER BY listing.created_at DESC, listing.id DESC), '[]'::jsonb)
  FROM (
    SELECT pr.id, pr.title, pr.price, pr.price_unit, pr.price_label, pr.price_per_month,
           pr.listing_type, pr.area_sqm, pr.city, pr.district, pr.legal_status,
           pr.image_url, pr.slug, pr.public_code, pr.neighborhood_slug,
           ar.slug AS area_slug, pr.created_at, pr.updated_at
    FROM public.agent_profiles ap
    JOIN public.profiles p ON p.id = ap.user_id AND p.role = 'user'
    JOIN public.user_listings ul
      ON ul.user_id = ap.user_id
     AND ul.status = 'approved'
    JOIN public.properties pr
      ON pr.id = ul.property_id
     AND pr.is_active = true
    LEFT JOIN public.areas ar ON ar.id = pr.area_id
    WHERE ap.slug = lower(btrim(p_slug))
      AND ap.status = 'published'
    ORDER BY pr.created_at DESC, pr.id DESC
    LIMIT 100
  ) AS listing;
$$;

REVOKE ALL ON FUNCTION public.public_get_agent_profile_listings(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_agent_profile_listings(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_list_indexable_agent_profiles()
RETURNS TABLE (slug text, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ap.slug, ap.updated_at
  FROM public.agent_profiles ap
  JOIN public.profiles p ON p.id = ap.user_id AND p.role = 'user'
  WHERE ap.status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.user_listings ul
      JOIN public.properties pr ON pr.id = ul.property_id
      WHERE ul.user_id = ap.user_id
        AND ul.status = 'approved'
        AND pr.is_active = true
    )
  ORDER BY ap.updated_at DESC, ap.slug ASC;
$$;

REVOKE ALL ON FUNCTION public.public_list_indexable_agent_profiles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_list_indexable_agent_profiles() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
