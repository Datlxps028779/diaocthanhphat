-- Public profile activity and listing taxonomy projection.
-- Production SQL is user-run only; this migration does not infer listing ownership.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

CREATE OR REPLACE FUNCTION public.touch_my_presence()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
  SET last_seen_at = now()
  WHERE id = v_actor
    AND role = 'user';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found' USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_my_presence() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.touch_my_presence() TO authenticated;

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
    'account_created_at', p.created_at,
    'last_login_at', au.last_sign_in_at,
    'is_online', COALESCE(p.last_seen_at > now() - interval '5 minutes', false),
    'updated_at', ap.updated_at
  )
  FROM public.agent_profiles ap
  JOIN public.profiles p ON p.id = ap.user_id
  LEFT JOIN auth.users au ON au.id = ap.user_id
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
    'property_type_name', listing.property_type_name,
    'property_type_slug', listing.property_type_slug,
    'area_sqm', listing.area_sqm,
    'city', listing.city,
    'district', listing.district,
    'legal_status', listing.legal_status,
    'image_url', listing.image_url,
    'images', listing.images,
    'slug', listing.slug,
    'public_code', listing.public_code,
    'neighborhood_slug', listing.neighborhood_slug,
    'area_slug', listing.area_slug,
    'created_at', listing.created_at,
    'updated_at', listing.updated_at
  ) ORDER BY listing.created_at DESC, listing.id DESC), '[]'::jsonb)
  FROM (
    SELECT pr.id, pr.title, pr.price, pr.price_unit, pr.price_label, pr.price_per_month,
           pr.listing_type, pt.name AS property_type_name, pt.slug AS property_type_slug,
           pr.area_sqm, pr.city, pr.district, pr.legal_status,
           pr.image_url, pr.images, pr.slug, pr.public_code, pr.neighborhood_slug,
           ar.slug AS area_slug, pr.created_at, pr.updated_at
    FROM public.agent_profiles ap
    JOIN public.user_listings ul
      ON ul.user_id = ap.user_id
     AND ul.status = 'approved'
    JOIN public.properties pr
      ON pr.id = ul.property_id
     AND pr.is_active = true
    LEFT JOIN public.areas ar ON ar.id = pr.area_id
    LEFT JOIN public.property_types pt ON pt.id = pr.property_type_id
    WHERE ap.slug = lower(btrim(p_slug))
      AND ap.status = 'published'
    ORDER BY pr.created_at DESC, pr.id DESC
    LIMIT 100
  ) AS listing;
$$;

REVOKE ALL ON FUNCTION public.public_get_agent_profile_listings(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.public_get_agent_profile_listings(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
