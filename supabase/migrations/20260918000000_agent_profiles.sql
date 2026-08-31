-- P14: opt-in public agent identity, separate from internal profiles.role.
-- Production SQL is user-run only. This migration is additive and does not backfill
-- existing properties because contact-name/phone matching is ambiguous for 43 rows.

CREATE TABLE IF NOT EXISTS public.agent_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  slug text NOT NULL UNIQUE,
  display_name text NOT NULL,
  bio text,
  avatar_url text,
  public_phone text,
  public_zalo text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'disabled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_profiles_slug_format CHECK (length(slug) BETWEEN 1 AND 100 AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  CONSTRAINT agent_profiles_display_name_nonempty CHECK (length(btrim(display_name)) BETWEEN 1 AND 120),
  CONSTRAINT agent_profiles_bio_length CHECK (bio IS NULL OR length(bio) <= 2000),
  CONSTRAINT agent_profiles_public_phone_length CHECK (public_phone IS NULL OR length(public_phone) <= 40),
  CONSTRAINT agent_profiles_public_zalo_length CHECK (public_zalo IS NULL OR length(public_zalo) <= 120)
);

CREATE INDEX IF NOT EXISTS agent_profiles_public_idx
  ON public.agent_profiles (status, updated_at DESC)
  WHERE status = 'published';

ALTER TABLE public.agent_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_profiles_select_own ON public.agent_profiles;
CREATE POLICY agent_profiles_select_own ON public.agent_profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS agent_profiles_insert_own ON public.agent_profiles;
CREATE POLICY agent_profiles_insert_own ON public.agent_profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS agent_profiles_update_own ON public.agent_profiles;
CREATE POLICY agent_profiles_update_own ON public.agent_profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS agent_profiles_delete_own ON public.agent_profiles;
CREATE POLICY agent_profiles_delete_own ON public.agent_profiles
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

REVOKE ALL ON TABLE public.agent_profiles FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_profiles TO authenticated;

CREATE OR REPLACE FUNCTION public.save_my_agent_profile(
  p_slug text,
  p_display_name text,
  p_bio text DEFAULT NULL,
  p_avatar_url text DEFAULT NULL,
  p_public_phone text DEFAULT NULL,
  p_public_zalo text DEFAULT NULL,
  p_status text DEFAULT 'draft'
)
RETURNS public.agent_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.agent_profiles;
  v_slug text := lower(btrim(p_slug));
  v_name text := btrim(p_display_name);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR length(v_name) < 1 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Display name must be between 1 and 120 characters' USING ERRCODE = '22023';
  END IF;
  IF v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Invalid agent profile slug' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('draft', 'published', 'disabled') THEN
    RAISE EXCEPTION 'Invalid agent profile status' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor) THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = '23503';
  END IF;

  INSERT INTO public.agent_profiles (
    user_id, slug, display_name, bio, avatar_url, public_phone, public_zalo, status, updated_at
  ) VALUES (
    v_actor, v_slug, v_name, NULLIF(btrim(p_bio), ''), NULLIF(btrim(p_avatar_url), ''),
    NULLIF(btrim(p_public_phone), ''), NULLIF(btrim(p_public_zalo), ''), p_status, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    slug = EXCLUDED.slug,
    display_name = EXCLUDED.display_name,
    bio = EXCLUDED.bio,
    avatar_url = EXCLUDED.avatar_url,
    public_phone = EXCLUDED.public_phone,
    public_zalo = EXCLUDED.public_zalo,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_agent_profile(text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_agent_profile(text, text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_my_profile_and_agent_profile(
  p_display_name text,
  p_phone text,
  p_slug text,
  p_agent_display_name text,
  p_bio text DEFAULT NULL,
  p_public_phone text DEFAULT NULL,
  p_public_zalo text DEFAULT NULL,
  p_status text DEFAULT 'draft'
)
RETURNS public.agent_profiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_profile public.agent_profiles;
  v_slug text := lower(btrim(p_slug));
  v_name text := btrim(p_agent_display_name);
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor) THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = '23503';
  END IF;
  IF v_name IS NULL OR length(v_name) < 1 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Display name must be between 1 and 120 characters' USING ERRCODE = '22023';
  END IF;
  IF v_slug IS NULL OR length(v_slug) > 100 OR v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Invalid agent profile slug' USING ERRCODE = '22023';
  END IF;
  IF p_status NOT IN ('draft', 'published', 'disabled') THEN
    RAISE EXCEPTION 'Invalid agent profile status' USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
  SET display_name = NULLIF(btrim(p_display_name), ''),
      phone = NULLIF(btrim(p_phone), ''),
      updated_at = now()
  WHERE id = v_actor;

  INSERT INTO public.agent_profiles (
    user_id, slug, display_name, bio, avatar_url, public_phone, public_zalo, status, updated_at
  ) VALUES (
    v_actor, v_slug, v_name, NULLIF(btrim(p_bio), ''),
    (SELECT NULLIF(btrim(avatar_url), '') FROM public.profiles WHERE id = v_actor),
    NULLIF(btrim(p_public_phone), ''), NULLIF(btrim(p_public_zalo), ''), p_status, now()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    slug = EXCLUDED.slug,
    display_name = EXCLUDED.display_name,
    bio = EXCLUDED.bio,
    avatar_url = EXCLUDED.avatar_url,
    public_phone = EXCLUDED.public_phone,
    public_zalo = EXCLUDED.public_zalo,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING * INTO v_profile;

  RETURN v_profile;
END;
$$;

REVOKE ALL ON FUNCTION public.save_my_profile_and_agent_profile(text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_profile_and_agent_profile(text, text, text, text, text, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.public_get_property_agent(p_property_id uuid)
RETURNS TABLE (
  id uuid,
  slug text,
  display_name text,
  bio text,
  avatar_url text,
  public_phone text,
  public_zalo text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ap.id, ap.slug, ap.display_name, ap.bio, ap.avatar_url, ap.public_phone, ap.public_zalo
  FROM public.agent_profiles ap
  JOIN public.user_listings ul
    ON ul.user_id = ap.user_id
   AND ul.property_id = p_property_id
   AND ul.status = 'approved'
  JOIN public.properties pr
    ON pr.id = ul.property_id
   AND pr.is_active = true
  WHERE ap.status = 'published'
  ORDER BY ap.updated_at DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.public_get_property_agent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_property_agent(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
