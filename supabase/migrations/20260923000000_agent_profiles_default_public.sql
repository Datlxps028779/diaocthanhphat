-- Default-public customer profiles.
-- Production SQL is user-run only. Legacy properties without an explicit
-- user_listings owner association remain unlinked.

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
    RETURN NEW;
  END IF;

  v_base := regexp_replace(lower(btrim(COALESCE(NEW.display_name, ''))), '[^a-z0-9]+', '-', 'g');
  v_base := trim(both '-' from v_base);
  IF v_base = '' THEN
    v_base := 'nguoi-dang-tin';
  END IF;
  v_slug := left(v_base, 82) || '-' || substr(md5(NEW.id::text), 1, 16);

  INSERT INTO public.agent_profiles (
    user_id, slug, display_name, avatar_url, public_phone, status
  ) VALUES (
    NEW.id, v_slug, v_display_name, NULLIF(btrim(NEW.avatar_url), ''),
    NULLIF(btrim(NEW.phone), ''), 'published'
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_profiles_provision_agent_profile ON public.profiles;
CREATE TRIGGER trg_profiles_provision_agent_profile
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_agent_profile_from_profile();

DROP TRIGGER IF EXISTS trg_profiles_sync_agent_contact ON public.profiles;

CREATE OR REPLACE FUNCTION public.sync_agent_profile_contact_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.agent_profiles
  SET avatar_url = NULLIF(btrim(NEW.avatar_url), ''),
      public_phone = NULLIF(btrim(NEW.phone), ''),
      updated_at = now()
  WHERE user_id = NEW.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_sync_agent_contact
  AFTER UPDATE OF phone, avatar_url ON public.profiles
  FOR EACH ROW
  WHEN (OLD.phone IS DISTINCT FROM NEW.phone OR OLD.avatar_url IS DISTINCT FROM NEW.avatar_url)
  EXECUTE FUNCTION public.sync_agent_profile_contact_from_profile();

INSERT INTO public.agent_profiles (
  user_id, slug, display_name, avatar_url, public_phone, status
)
SELECT
  p.id,
  left(
    COALESCE(NULLIF(trim(both '-' FROM regexp_replace(lower(btrim(p.display_name)), '[^a-z0-9]+', '-', 'g')), ''), 'nguoi-dang-tin'),
    82
  ) || '-' || substr(md5(p.id::text), 1, 16),
  COALESCE(NULLIF(btrim(p.display_name), ''), 'Người đăng tin'),
  NULLIF(btrim(p.avatar_url), ''),
  NULLIF(btrim(p.phone), ''),
  'published'
FROM public.profiles p
WHERE p.role = 'user'
  AND NOT EXISTS (
    SELECT 1 FROM public.agent_profiles ap WHERE ap.user_id = p.id
  )
ON CONFLICT DO NOTHING;

UPDATE public.agent_profiles ap
SET status = 'published',
    public_phone = COALESCE(NULLIF(btrim(ap.public_phone), ''), NULLIF(btrim(p.phone), '')),
    updated_at = now()
FROM public.profiles p
WHERE p.id = ap.user_id
  AND p.role = 'user'
  AND ap.status <> 'disabled';

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
  v_slug text := lower(btrim(p_slug));
  v_name text := btrim(p_display_name);
  v_phone text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF v_name IS NULL OR length(v_name) < 1 OR length(v_name) > 120 THEN
    RAISE EXCEPTION 'Display name must be between 1 and 120 characters' USING ERRCODE = '22023';
  END IF;
  IF v_slug IS NULL OR length(v_slug) > 100 OR v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Invalid agent profile slug' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_actor AND role = 'user') THEN
    RAISE EXCEPTION 'Profile not found' USING ERRCODE = '23503';
  END IF;

  SELECT NULLIF(btrim(phone), '') INTO v_phone
  FROM public.profiles
  WHERE id = v_actor;

  INSERT INTO public.agent_profiles (
    user_id, slug, display_name, bio, avatar_url, public_phone, public_zalo, status, updated_at
  ) VALUES (
    v_actor, v_slug, v_name, NULLIF(btrim(p_bio), ''), NULLIF(btrim(p_avatar_url), ''),
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
  v_slug text := lower(btrim(p_slug));
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
  IF v_slug IS NULL OR length(v_slug) > 100 OR v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN
    RAISE EXCEPTION 'Invalid agent profile slug' USING ERRCODE = '22023';
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

REVOKE ALL ON FUNCTION public.save_my_agent_profile(text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_agent_profile(text, text, text, text, text, text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.save_my_profile_and_agent_profile(text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_my_profile_and_agent_profile(text, text, text, text, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
