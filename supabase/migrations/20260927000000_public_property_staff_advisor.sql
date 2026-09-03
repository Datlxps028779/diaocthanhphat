-- Public advisor projection for staff-owned approved listings.
-- Staff advisors are public-safe identity only; they are not user poster profiles.

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
  WITH candidates AS (
    SELECT
      ap.id,
      ap.slug,
      ap.display_name,
      ap.bio,
      ap.avatar_url,
      NULL::text AS public_phone,
      ap.public_zalo,
      1 AS priority
    FROM public.agent_profiles ap
    JOIN public.user_listings ul
      ON ul.user_id = ap.user_id
     AND ul.property_id = p_property_id
     AND ul.status = 'approved'
    JOIN public.profiles owner_profile
      ON owner_profile.id = ul.user_id
     AND owner_profile.role = 'user'
    JOIN public.properties pr
      ON pr.id = ul.property_id
     AND pr.is_active = true
    WHERE ap.status = 'published'

    UNION ALL

    SELECT
      NULL::uuid AS id,
      NULL::text AS slug,
      COALESCE(NULLIF(btrim(owner_profile.display_name), ''), 'Nhân viên tư vấn') AS display_name,
      NULL::text AS bio,
      NULLIF(btrim(owner_profile.avatar_url), '') AS avatar_url,
      NULL::text AS public_phone,
      NULL::text AS public_zalo,
      2 AS priority
    FROM public.user_listings ul
    JOIN public.profiles owner_profile
      ON owner_profile.id = ul.user_id
     AND owner_profile.role = 'staff'
    JOIN public.properties pr
      ON pr.id = ul.property_id
     AND pr.is_active = true
    WHERE ul.property_id = p_property_id
      AND ul.status = 'approved'
  )
  SELECT id, slug, display_name, bio, avatar_url, public_phone, public_zalo
  FROM candidates
  ORDER BY priority
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.public_get_property_agent(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_property_agent(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
