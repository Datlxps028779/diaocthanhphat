-- One-time public agent profile slug change with permanent lock after confirmation.
-- Production execution is user-run after read-only dry-run verification.

ALTER TABLE public.agent_profiles
  ADD COLUMN IF NOT EXISTS slug_change_count integer NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.agent_profiles
    WHERE slug_change_count NOT IN (0, 1)
  ) THEN
    RAISE EXCEPTION 'slug_change_count phải nằm trong khoảng 0..1';
  END IF;
END $$;

ALTER TABLE public.agent_profiles
  DROP CONSTRAINT IF EXISTS agent_profiles_slug_change_count_check;
ALTER TABLE public.agent_profiles
  ADD CONSTRAINT agent_profiles_slug_change_count_check CHECK (slug_change_count BETWEEN 0 AND 1);

REVOKE INSERT, UPDATE, DELETE ON TABLE public.agent_profiles FROM authenticated;

DROP FUNCTION IF EXISTS public.get_agent_profile_directory(text, text, integer, integer);

CREATE FUNCTION public.get_agent_profile_directory(
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
  slug_change_count integer,
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
         scored.slug_change_count, scored.created_at, scored.updated_at,
         scored.account_created_at, scored.last_seen_at, scored.owner_role,
         scored.listing_count, scored.lead_count,
         ((5 - cardinality(scored.missing_fields)) * 20)::integer,
         scored.missing_fields
  FROM scored
  ORDER BY scored.updated_at DESC, scored.id DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_agent_profile_directory(text, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_profile_directory(text, text, integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_my_agent_profile(
  p_slug text,
  p_display_name text,
  p_bio text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_public_phone text DEFAULT NULL,
  p_public_zalo text DEFAULT NULL,
  p_status text DEFAULT 'published'
)
RETURNS public.agent_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.save_my_agent_profile(
    p_slug, p_display_name, false, p_bio, p_avatar_url,
    p_public_phone, p_public_zalo, p_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_my_agent_profile(
  p_slug text,
  p_display_name text,
  p_confirm_slug_change boolean,
  p_bio text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_public_phone text DEFAULT NULL,
  p_public_zalo text DEFAULT NULL,
  p_status text DEFAULT 'published'
)
RETURNS public.agent_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.agent_profiles;
  v_current public.agent_profiles;
  v_slug text;
  v_requested_slug text;
  v_name text := btrim(p_display_name);
  v_phone text;
  v_slug_changed boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor AND role = 'user') THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = '23503';
  END IF;
  IF v_name IS NULL OR length(v_name) < 1 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Display name must be between 1 and 120 characters' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('draft', 'published', 'disabled') THEN
    RAISE EXCEPTION 'Invalid agent profile status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current
  FROM public.agent_profiles
  WHERE user_id = v_actor
  FOR UPDATE;

  IF NOT FOUND THEN
    v_slug := public.allocate_agent_profile_slug(p_slug, v_name);
  ELSE
    IF NULLIF(btrim(p_slug), '') IS NULL THEN
      v_slug := v_current.slug;
    ELSE
      v_requested_slug := public.slugify_agent_profile_name(p_slug);
      IF v_requested_slug = v_current.slug THEN
        v_slug := v_current.slug;
      ELSE
        IF v_current.slug_change_count >= 1 THEN
          RAISE EXCEPTION 'Slug hồ sơ đã khóa vĩnh viễn sau lần đổi trước đó' USING ERRCODE = '42501';
        END IF;
        IF NOT p_confirm_slug_change THEN
          RAISE EXCEPTION 'Cần xác nhận rõ ràng trước khi đổi slug hồ sơ' USING ERRCODE = '22023';
        END IF;
        v_slug := public.allocate_agent_profile_slug(v_requested_slug, v_name);
        v_slug_changed := true;
      END IF;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_profiles
    WHERE slug = v_slug AND user_id <> v_actor
  ) OR EXISTS (
    SELECT 1
    FROM public.agent_profile_slug_aliases alias_row
    JOIN public.agent_profiles ap ON ap.id = alias_row.agent_profile_id
    WHERE alias_row.old_slug = v_slug AND ap.user_id <> v_actor
  ) THEN
    RAISE EXCEPTION 'Slug đã được sử dụng' USING ERRCODE = '23505';
  END IF;

  SELECT NULLIF(btrim(phone), '') INTO v_phone
  FROM public.profiles
  WHERE id = v_actor;

  INSERT INTO public.agent_profiles (
    user_id, slug, display_name, bio, avatar_url, public_phone, public_zalo,
    status, slug_change_count, updated_at
  ) VALUES (
    v_actor, v_slug, v_name, NULLIF(btrim(p_bio), ''), NULLIF(btrim(p_avatar_url), ''),
    COALESCE(NULLIF(btrim(p_public_phone), ''), v_phone), NULLIF(btrim(p_public_zalo), ''),
    'published', CASE WHEN v_slug_changed THEN 1 ELSE 0 END, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    slug = EXCLUDED.slug,
    display_name = EXCLUDED.display_name,
    bio = EXCLUDED.bio,
    avatar_url = EXCLUDED.avatar_url,
    public_phone = EXCLUDED.public_phone,
    public_zalo = EXCLUDED.public_zalo,
    status = CASE WHEN agent_profiles.status = 'disabled' THEN 'disabled' ELSE 'published' END,
    slug_change_count = CASE WHEN v_slug_changed THEN 1 ELSE agent_profiles.slug_change_count END,
    updated_at = now()
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.save_my_profile_and_agent_profile(
  p_display_name text,
  p_phone text,
  p_slug text,
  p_agent_display_name text,
  p_bio text DEFAULT NULL,
  p_public_phone text DEFAULT NULL,
  p_public_zalo text DEFAULT NULL,
  p_status text DEFAULT 'published'
)
RETURNS public.agent_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.save_my_profile_and_agent_profile(
    p_display_name, p_phone, p_slug, p_agent_display_name, false,
    p_bio, p_public_phone, p_public_zalo, p_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_my_profile_and_agent_profile(
  p_display_name text,
  p_phone text,
  p_slug text,
  p_agent_display_name text,
  p_confirm_slug_change boolean,
  p_bio text DEFAULT NULL,
  p_public_phone text DEFAULT NULL,
  p_public_zalo text DEFAULT NULL,
  p_status text DEFAULT 'published'
)
RETURNS public.agent_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.agent_profiles;
  v_current public.agent_profiles;
  v_slug text;
  v_requested_slug text;
  v_name text := btrim(p_agent_display_name);
  v_phone text := NULLIF(btrim(p_phone), '');
  v_slug_changed boolean := false;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor AND role = 'user') THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = '23503';
  END IF;
  IF v_name IS NULL OR length(v_name) < 1 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Display name must be between 1 and 120 characters' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('draft', 'published', 'disabled') THEN
    RAISE EXCEPTION 'Invalid agent profile status' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_current
  FROM public.agent_profiles
  WHERE user_id = v_actor
  FOR UPDATE;

  IF NOT FOUND THEN
    v_slug := public.allocate_agent_profile_slug(p_slug, v_name);
  ELSE
    IF NULLIF(btrim(p_slug), '') IS NULL THEN
      v_slug := v_current.slug;
    ELSE
      v_requested_slug := public.slugify_agent_profile_name(p_slug);
      IF v_requested_slug = v_current.slug THEN
        v_slug := v_current.slug;
      ELSE
        IF v_current.slug_change_count >= 1 THEN
          RAISE EXCEPTION 'Slug hồ sơ đã khóa vĩnh viễn sau lần đổi trước đó' USING ERRCODE = '42501';
        END IF;
        IF NOT p_confirm_slug_change THEN
          RAISE EXCEPTION 'Cần xác nhận rõ ràng trước khi đổi slug hồ sơ' USING ERRCODE = '22023';
        END IF;
        v_slug := public.allocate_agent_profile_slug(v_requested_slug, v_name);
        v_slug_changed := true;
      END IF;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_profiles
    WHERE slug = v_slug AND user_id <> v_actor
  ) OR EXISTS (
    SELECT 1
    FROM public.agent_profile_slug_aliases alias_row
    JOIN public.agent_profiles ap ON ap.id = alias_row.agent_profile_id
    WHERE alias_row.old_slug = v_slug AND ap.user_id <> v_actor
  ) THEN
    RAISE EXCEPTION 'Slug đã được sử dụng' USING ERRCODE = '23505';
  END IF;

  UPDATE public.profiles
  SET display_name = NULLIF(btrim(p_display_name), ''), phone = v_phone, updated_at = now()
  WHERE id = v_actor;

  INSERT INTO public.agent_profiles (
    user_id, slug, display_name, bio, avatar_url, public_phone, public_zalo,
    status, slug_change_count, updated_at
  ) VALUES (
    v_actor, v_slug, v_name, NULLIF(btrim(p_bio), ''),
    (SELECT NULLIF(btrim(avatar_url), '') FROM public.profiles WHERE id = v_actor),
    v_phone, NULLIF(btrim(p_public_zalo), ''), 'published',
    CASE WHEN v_slug_changed THEN 1 ELSE 0 END, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    slug = EXCLUDED.slug,
    display_name = EXCLUDED.display_name,
    bio = EXCLUDED.bio,
    avatar_url = EXCLUDED.avatar_url,
    public_phone = EXCLUDED.public_phone,
    public_zalo = EXCLUDED.public_zalo,
    status = CASE WHEN agent_profiles.status = 'disabled' THEN 'disabled' ELSE 'published' END,
    slug_change_count = CASE WHEN v_slug_changed THEN 1 ELSE agent_profiles.slug_change_count END,
    updated_at = now()
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agent_profile(
  p_profile_id uuid,
  p_patch jsonb
)
RETURNS public.agent_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  RETURN public.update_agent_profile(p_profile_id, p_patch, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.update_agent_profile(
  p_profile_id uuid,
  p_patch jsonb,
  p_confirm_slug_change boolean
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
  v_slug text;
  v_requested_slug text;
  v_name text;
  v_slug_changed boolean := false;
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
  IF p_patch ? 'slug' AND NULLIF(btrim(p_patch->>'slug'), '') IS NULL THEN
    RAISE EXCEPTION 'Slug hồ sơ không được để trống' USING ERRCODE = '22023';
  END IF;

  v_name := CASE WHEN p_patch ? 'display_name' THEN btrim(p_patch->>'display_name') ELSE v_current.display_name END;
  IF v_name IS NULL OR length(v_name) < 1 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Display name must be between 1 and 120 characters' USING ERRCODE = '22023';
  END IF;

  IF p_patch ? 'slug' THEN
    v_requested_slug := public.slugify_agent_profile_name(p_patch->>'slug');
    IF v_requested_slug = v_current.slug THEN
      v_slug := v_current.slug;
    ELSE
      IF v_current.slug_change_count >= 1 THEN
        RAISE EXCEPTION 'Slug hồ sơ đã khóa vĩnh viễn sau lần đổi trước đó' USING ERRCODE = '42501';
      END IF;
      IF NOT p_confirm_slug_change THEN
        RAISE EXCEPTION 'Cần xác nhận rõ ràng trước khi đổi slug hồ sơ' USING ERRCODE = '22023';
      END IF;
      v_slug := public.allocate_agent_profile_slug(v_requested_slug, v_name);
      v_slug_changed := true;
    END IF;
  ELSE
    v_slug := v_current.slug;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_profiles WHERE slug = v_slug AND id <> p_profile_id
  ) OR EXISTS (
    SELECT 1
    FROM public.agent_profile_slug_aliases alias_row
    WHERE alias_row.old_slug = v_slug AND alias_row.agent_profile_id <> p_profile_id
  ) THEN
    RAISE EXCEPTION 'Slug đã được sử dụng' USING ERRCODE = '23505';
  END IF;

  UPDATE public.agent_profiles
  SET slug = v_slug,
      display_name = v_name,
      bio = CASE WHEN p_patch ? 'bio' THEN NULLIF(btrim(p_patch->>'bio'), '') ELSE v_current.bio END,
      avatar_url = CASE WHEN p_patch ? 'avatar_url' THEN NULLIF(btrim(p_patch->>'avatar_url'), '') ELSE v_current.avatar_url END,
      public_phone = CASE WHEN p_patch ? 'public_phone' THEN NULLIF(btrim(p_patch->>'public_phone'), '') ELSE v_current.public_phone END,
      public_zalo = CASE WHEN p_patch ? 'public_zalo' THEN NULLIF(btrim(p_patch->>'public_zalo'), '') ELSE v_current.public_zalo END,
      status = CASE WHEN p_patch ? 'status' THEN p_patch->>'status' ELSE v_current.status END,
      slug_change_count = CASE WHEN v_slug_changed THEN 1 ELSE v_current.slug_change_count END,
      updated_at = now()
  WHERE id = p_profile_id
  RETURNING * INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_agent_profile(text, text, boolean, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_agent_profile(text, text, boolean, text, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.save_my_profile_and_agent_profile(text, text, text, text, boolean, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_profile_and_agent_profile(text, text, text, text, boolean, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.update_agent_profile(uuid, jsonb, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_agent_profile(uuid, jsonb, boolean) TO authenticated;

NOTIFY pgrst, 'reload schema';
