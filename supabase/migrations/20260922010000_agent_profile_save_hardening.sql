-- Preserve an existing public-profile avatar when saving personal fields.
-- The combined save RPC has no avatar input, so an account edit must not clear it.

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

NOTIFY pgrst, 'reload schema';
