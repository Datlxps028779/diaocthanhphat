-- Keep public user profiles synchronized when an account changes role.
-- Production execution is intentionally user-run after local verification.

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

REVOKE ALL ON FUNCTION public.provision_agent_profile_from_profile() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_profiles_provision_agent_profile ON public.profiles;
CREATE TRIGGER trg_profiles_provision_agent_profile
  AFTER INSERT OR UPDATE OF role ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.provision_agent_profile_from_profile();

-- Cover users whose role changed before this migration was installed.
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

NOTIFY pgrst, 'reload schema';
