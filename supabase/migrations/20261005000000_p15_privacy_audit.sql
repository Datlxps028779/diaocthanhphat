-- P15 remediation: public profile privacy, sitemap projection, and safe audit details.
-- Production execution is user-run after review; this migration is not run by the app.

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
  JOIN public.profiles p
    ON p.id = ap.user_id
   AND p.role = 'user'
  WHERE ap.slug = lower(btrim(p_slug))
    AND ap.status = 'published'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.public_get_agent_profile(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_agent_profile(text) TO anon, authenticated;

DROP FUNCTION IF EXISTS public.public_list_indexable_agent_profiles();
CREATE FUNCTION public.public_list_indexable_agent_profiles()
RETURNS TABLE (slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ap.slug
  FROM public.agent_profiles ap
  JOIN public.profiles p
    ON p.id = ap.user_id
   AND p.role = 'user'
  WHERE ap.status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.user_listings ul
      JOIN public.properties pr
        ON pr.id = ul.property_id
       AND pr.is_active = true
      WHERE ul.user_id = ap.user_id
        AND ul.status = 'approved'
    )
  ORDER BY ap.slug ASC;
$$;

REVOKE ALL ON FUNCTION public.public_list_indexable_agent_profiles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_list_indexable_agent_profiles() TO anon, authenticated;

DROP FUNCTION IF EXISTS public.get_agent_profile_audit(uuid);
CREATE FUNCTION public.get_agent_profile_audit(p_profile_id uuid)
RETURNS TABLE (
  id uuid,
  agent_profile_id uuid,
  actor_id uuid,
  actor_display_name text,
  actor_role text,
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
    SELECT 1
    FROM public.agent_profiles ap
    WHERE ap.id = p_profile_id
      AND (public.is_admin() OR ap.user_id = auth.uid())
  ) THEN
    RAISE EXCEPTION 'Hồ sơ ngoài phạm vi phụ trách' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.agent_profile_id,
    e.actor_id,
    actor.display_name,
    actor.role,
    e.action,
    jsonb_build_object(
      'slug', e.before_state->>'slug',
      'display_name', e.before_state->>'display_name',
      'bio', e.before_state->>'bio',
      'avatar_url', e.before_state->>'avatar_url',
      'public_phone', e.before_state->>'public_phone',
      'public_zalo', e.before_state->>'public_zalo',
      'status', e.before_state->>'status'
    ),
    jsonb_build_object(
      'slug', e.after_state->>'slug',
      'display_name', e.after_state->>'display_name',
      'bio', e.after_state->>'bio',
      'avatar_url', e.after_state->>'avatar_url',
      'public_phone', e.after_state->>'public_phone',
      'public_zalo', e.after_state->>'public_zalo',
      'status', e.after_state->>'status'
    ),
    e.created_at
  FROM public.agent_profile_audit_events e
  LEFT JOIN public.profiles actor ON actor.id = e.actor_id
  WHERE e.agent_profile_id = p_profile_id
  ORDER BY e.created_at DESC, e.id DESC
  LIMIT 100;
END;
$$;

REVOKE ALL ON FUNCTION public.get_agent_profile_audit(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_profile_audit(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
