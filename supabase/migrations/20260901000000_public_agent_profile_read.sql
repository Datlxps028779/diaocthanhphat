-- P15: public agent profile read contracts.
-- Public clients must use these SECURITY DEFINER RPCs; agent_profiles remains closed to direct table reads.

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
    'public_zalo', ap.public_zalo,
    'updated_at', ap.updated_at
  )
  FROM public.agent_profiles ap
  WHERE ap.slug = lower(btrim(p_slug))
    AND ap.status = 'published'
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.public_get_agent_profile(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_agent_profile(text) TO anon, authenticated;

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
    JOIN public.user_listings ul
      ON ul.user_id = ap.user_id
     AND ul.status = 'approved'
    JOIN public.properties pr
      ON pr.id = ul.property_id
     AND pr.is_active = true
    LEFT JOIN public.areas ar ON ar.id = pr.area_id
    WHERE ap.slug = lower(btrim(p_slug))
      AND ap.status = 'published'
    ORDER BY pr.created_at DESC, pr.id DESC
    LIMIT 100
  ) AS listing;
$$;

REVOKE ALL ON FUNCTION public.public_get_agent_profile_listings(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_agent_profile_listings(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.public_list_indexable_agent_profiles()
RETURNS TABLE (slug text, updated_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ap.slug, ap.updated_at
  FROM public.agent_profiles ap
  WHERE ap.status = 'published'
    AND EXISTS (
      SELECT 1
      FROM public.user_listings ul
      JOIN public.properties pr ON pr.id = ul.property_id
      WHERE ul.user_id = ap.user_id
        AND ul.status = 'approved'
        AND pr.is_active = true
    )
  ORDER BY ap.updated_at DESC, ap.slug ASC;
$$;

REVOKE ALL ON FUNCTION public.public_list_indexable_agent_profiles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_list_indexable_agent_profiles() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
