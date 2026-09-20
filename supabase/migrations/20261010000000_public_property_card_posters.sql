-- User-run only, after the read-only audit and dry run.
BEGIN;

CREATE OR REPLACE FUNCTION public.public_get_property_card_posters(p_property_ids uuid[])
RETURNS TABLE (
  property_id uuid,
  display_name text,
  avatar_url text,
  profile_slug text,
  attribution_kind text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_ids uuid[];
BEGIN
  -- Bound raw input before deduplication, including repeated or NULL elements.
  IF coalesce(cardinality(p_property_ids), 0) > 100 THEN
    RAISE EXCEPTION 'At most 100 property ids are allowed' USING ERRCODE = '22023';
  END IF;
  v_ids := ARRAY(SELECT DISTINCT id FROM unnest(p_property_ids) AS input(id) WHERE id IS NOT NULL);

  RETURN QUERY
  WITH author_counts AS (
    -- Count all owners before filtering publication, so private owners cannot be displaced.
    SELECT ul.property_id, count(DISTINCT ul.user_id) AS owner_count
    FROM public.user_listings ul
    WHERE ul.property_id = ANY(v_ids)
    GROUP BY ul.property_id
  ), unique_author AS (
    SELECT DISTINCT ul.property_id, ul.user_id
    FROM public.user_listings ul
    JOIN author_counts ac ON ac.property_id = ul.property_id AND ac.owner_count = 1
  )
  SELECT pp.id, btrim(ap.display_name), nullif(btrim(ap.avatar_url), ''),
         nullif(btrim(ap.slug), ''), 'published-profile'::text
  FROM public.public_properties pp
  JOIN unique_author ua ON ua.property_id = pp.id
  JOIN public.profiles owner_profile ON owner_profile.id = ua.user_id AND owner_profile.role = 'user'
  JOIN public.agent_profiles ap ON ap.user_id = ua.user_id AND ap.status = 'published'
  WHERE pp.id = ANY(v_ids)
    AND pp.is_active = true
    AND btrim(ap.display_name) <> ''
    AND EXISTS (
      SELECT 1 FROM public.user_listings approved
      WHERE approved.property_id = pp.id AND approved.user_id = ua.user_id AND approved.status = 'approved'
    )
  ORDER BY pp.id;
END;
$$;

REVOKE ALL ON FUNCTION public.public_get_property_card_posters(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_property_card_posters(uuid[]) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
