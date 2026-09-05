-- Fix nullable requested slug in the deterministic agent profile slug helper.
-- The dry-run intentionally passes NULL to use display_name as the readable base.
-- Production execution is user-run after read-only verification.

CREATE OR REPLACE FUNCTION public.agent_profile_slug_for_id(
  p_requested_slug text,
  p_display_name text,
  p_profile_id uuid
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT left(
    public.slugify_agent_profile_name(
      COALESCE(NULLIF(btrim(p_requested_slug), ''), p_display_name)
    ),
    91
  ) || '-' || public.agent_profile_slug_id(p_profile_id);
$$;

REVOKE ALL ON FUNCTION public.agent_profile_slug_for_id(text, text, uuid) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
