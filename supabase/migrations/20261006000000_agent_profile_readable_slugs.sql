-- Readable, collision-safe slugs for public agent profiles.
-- Production execution is user-run after read-only dry-run verification.

CREATE TABLE IF NOT EXISTS public.agent_profile_slug_aliases (
  old_slug text PRIMARY KEY,
  agent_profile_id uuid NOT NULL REFERENCES public.agent_profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_profile_slug_aliases_format CHECK (
    length(old_slug) BETWEEN 1 AND 100
    AND old_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  )
);

CREATE INDEX IF NOT EXISTS agent_profile_slug_aliases_profile_idx
  ON public.agent_profile_slug_aliases (agent_profile_id);

ALTER TABLE public.agent_profile_slug_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.agent_profile_slug_aliases FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.slugify_agent_profile_name(p_text text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(
    NULLIF(
      trim(both '-' FROM regexp_replace(
        regexp_replace(
          translate(
            lower(btrim(COALESCE(p_text, ''))),
            'áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ',
            'aaaaaaaaaaaaaaaaadeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyy'
          ),
          '[^a-z0-9]+', '-', 'g'
        ),
        '-+', '-', 'g'
      )),
      ''
    ),
    'nguoi-dang-tin'
  );
$$;

CREATE OR REPLACE FUNCTION public.allocate_agent_profile_slug(
  p_requested_slug text,
  p_display_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_base text;
  v_candidate text;
  v_suffix integer := 1;
BEGIN
  v_base := public.slugify_agent_profile_name(
    COALESCE(NULLIF(btrim(p_requested_slug), ''), p_display_name)
  );
  PERFORM pg_advisory_xact_lock(hashtextextended('agent-profile-slug:' || v_base, 0));
  v_candidate := left(v_base, 100);

  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1
      FROM public.agent_profiles ap
      WHERE ap.slug = v_candidate
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.agent_profile_slug_aliases alias_row
      WHERE alias_row.old_slug = v_candidate
    );

    v_suffix := v_suffix + 1;
    v_candidate := left(v_base, 100 - length('-' || v_suffix::text)) || '-' || v_suffix::text;
  END LOOP;

  RETURN v_candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.slugify_agent_profile_name(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.allocate_agent_profile_slug(text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.audit_agent_profile_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_action text;
  v_actor_id uuid := auth.uid();
BEGIN
  IF v_actor_id IS NULL THEN
    BEGIN
      v_actor_id := NULLIF(current_setting('app.agent_profile_audit_actor', true), '')::uuid;
    EXCEPTION WHEN invalid_text_representation THEN
      v_actor_id := NULL;
    END;
  END IF;

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
    COALESCE(NEW.id, OLD.id), v_actor_id, v_action,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE to_jsonb(OLD) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE to_jsonb(NEW) END
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.remember_agent_profile_slug_alias()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.slug IS DISTINCT FROM NEW.slug THEN
    INSERT INTO public.agent_profile_slug_aliases (old_slug, agent_profile_id)
    VALUES (OLD.slug, NEW.id)
    ON CONFLICT (old_slug) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_agent_profile_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.remember_agent_profile_slug_alias() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_agent_profile_slug_alias ON public.agent_profiles;
CREATE TRIGGER trg_agent_profile_slug_alias
  AFTER UPDATE OF slug ON public.agent_profiles
  FOR EACH ROW EXECUTE FUNCTION public.remember_agent_profile_slug_alias();

CREATE OR REPLACE FUNCTION public.provision_agent_profile_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_display_name text := COALESCE(NULLIF(btrim(NEW.display_name), ''), 'Người đăng tin');
  v_slug text;
BEGIN
  IF NEW.role <> 'user' THEN
    UPDATE public.agent_profiles
    SET status = 'disabled', updated_at = now()
    WHERE user_id = NEW.id AND status <> 'disabled';
    RETURN NEW;
  END IF;

  v_slug := public.allocate_agent_profile_slug(NULL, v_display_name);
  INSERT INTO public.agent_profiles (
    user_id, slug, display_name, avatar_url, public_phone, status
  ) VALUES (
    NEW.id, v_slug, v_display_name, NULLIF(btrim(NEW.avatar_url), ''),
    NULLIF(btrim(NEW.phone), ''), 'published'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_agent_profile_from_profile() FROM PUBLIC, anon, authenticated;

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
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.agent_profiles;
  v_existing_slug text;
  v_slug text;
  v_name text := btrim(p_display_name);
  v_phone text;
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

  SELECT slug INTO v_existing_slug
  FROM public.agent_profiles
  WHERE user_id = v_actor
  FOR UPDATE;

  IF v_existing_slug IS NULL THEN
    v_slug := public.allocate_agent_profile_slug(p_slug, v_name);
  ELSE
    v_slug := CASE
      WHEN NULLIF(btrim(p_slug), '') IS NULL THEN v_existing_slug
      ELSE public.slugify_agent_profile_name(p_slug)
    END;
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
    user_id, slug, display_name, bio, avatar_url, public_phone, public_zalo, status, updated_at
  ) VALUES (
    v_actor, v_slug, v_name, NULLIF(btrim(p_bio), ''), NULLIF(btrim(p_avatar_url), ''),
    COALESCE(NULLIF(btrim(p_public_phone), ''), v_phone), NULLIF(btrim(p_public_zalo), ''),
    'published', now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    slug = EXCLUDED.slug,
    display_name = EXCLUDED.display_name,
    bio = EXCLUDED.bio,
    avatar_url = EXCLUDED.avatar_url,
    public_phone = EXCLUDED.public_phone,
    public_zalo = EXCLUDED.public_zalo,
    status = CASE WHEN agent_profiles.status = 'disabled' THEN 'disabled' ELSE 'published' END,
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
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.agent_profiles;
  v_existing_slug text;
  v_slug text;
  v_name text := btrim(p_agent_display_name);
  v_phone text := NULLIF(btrim(p_phone), '');
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

  SELECT slug INTO v_existing_slug
  FROM public.agent_profiles
  WHERE user_id = v_actor
  FOR UPDATE;

  IF v_existing_slug IS NULL THEN
    v_slug := public.allocate_agent_profile_slug(p_slug, v_name);
  ELSE
    v_slug := CASE
      WHEN NULLIF(btrim(p_slug), '') IS NULL THEN v_existing_slug
      ELSE public.slugify_agent_profile_name(p_slug)
    END;
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
  SET display_name = NULLIF(btrim(p_display_name), ''),
      phone = v_phone,
      updated_at = now()
  WHERE id = v_actor;

  INSERT INTO public.agent_profiles (
    user_id, slug, display_name, bio, avatar_url, public_phone, public_zalo, status, updated_at
  ) VALUES (
    v_actor, v_slug, v_name, NULLIF(btrim(p_bio), ''),
    (SELECT NULLIF(btrim(avatar_url), '') FROM public.profiles WHERE id = v_actor),
    v_phone, NULLIF(btrim(p_public_zalo), ''), 'published', now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    slug = EXCLUDED.slug,
    display_name = EXCLUDED.display_name,
    bio = EXCLUDED.bio,
    avatar_url = EXCLUDED.avatar_url,
    public_phone = EXCLUDED.public_phone,
    public_zalo = EXCLUDED.public_zalo,
    status = CASE WHEN agent_profiles.status = 'disabled' THEN 'disabled' ELSE 'published' END,
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
DECLARE
  v_current public.agent_profiles;
  v_result public.agent_profiles;
  v_is_admin boolean := public.is_admin();
  v_slug text;
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

  v_slug := CASE
    WHEN p_patch ? 'slug' THEN public.slugify_agent_profile_name(p_patch->>'slug')
    ELSE v_current.slug
  END;

  IF EXISTS (
    SELECT 1 FROM public.agent_profiles
    WHERE slug = v_slug AND id <> p_profile_id
  ) OR EXISTS (
    SELECT 1
    FROM public.agent_profile_slug_aliases alias_row
    WHERE alias_row.old_slug = v_slug AND alias_row.agent_profile_id <> p_profile_id
  ) THEN
    RAISE EXCEPTION 'Slug đã được sử dụng' USING ERRCODE = '23505';
  END IF;

  UPDATE public.agent_profiles
  SET slug = v_slug,
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

CREATE OR REPLACE FUNCTION public.public_get_agent_profile(p_slug text)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', ap.id,
    'slug', ap.slug,
    'display_name', ap.display_name,
    'bio', ap.bio,
    'avatar_url', ap.avatar_url,
    'public_phone', ap.public_phone,
    'public_zalo', ap.public_zalo
  )
  FROM public.agent_profiles ap
  JOIN public.profiles p ON p.id = ap.user_id AND p.role = 'user'
  WHERE (ap.slug = lower(btrim(p_slug)) OR EXISTS (
    SELECT 1
    FROM public.agent_profile_slug_aliases alias_row
    WHERE alias_row.old_slug = lower(btrim(p_slug))
      AND alias_row.agent_profile_id = ap.id
  ))
    AND ap.status = 'published'
  LIMIT 1;
$$;

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
    JOIN public.user_listings ul ON ul.user_id = ap.user_id AND ul.status = 'approved'
    JOIN public.properties pr ON pr.id = ul.property_id AND pr.is_active = true
    LEFT JOIN public.areas ar ON ar.id = pr.area_id
    WHERE (ap.slug = lower(btrim(p_slug)) OR EXISTS (
      SELECT 1
      FROM public.agent_profile_slug_aliases alias_row
      WHERE alias_row.old_slug = lower(btrim(p_slug))
        AND alias_row.agent_profile_id = ap.id
    ))
      AND ap.status = 'published'
    ORDER BY pr.created_at DESC, pr.id DESC
    LIMIT 100
  ) AS listing;
$$;

CREATE OR REPLACE FUNCTION public.public_list_indexable_agent_profiles()
RETURNS TABLE (slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ap.slug
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
  ORDER BY ap.slug ASC;
$$;

REVOKE ALL ON FUNCTION public.save_my_agent_profile(text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_agent_profile(text, text, text, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.save_my_profile_and_agent_profile(text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_profile_and_agent_profile(text, text, text, text, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.update_agent_profile(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_agent_profile(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.public_get_agent_profile(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_agent_profile(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.public_get_agent_profile_listings(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_agent_profile_listings(text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.public_list_indexable_agent_profiles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_list_indexable_agent_profiles() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
