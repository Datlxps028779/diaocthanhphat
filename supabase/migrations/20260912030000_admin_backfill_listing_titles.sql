-- Authenticated admin-only historical title backfill.
-- No client-supplied scope; only title is updated and verified cases are excluded.
BEGIN;

CREATE OR REPLACE FUNCTION public.admin_backfill_listing_titles()
RETURNS TABLE (
  source text,
  candidate_rows integer,
  updated_rows integer,
  skipped_verified_rows integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_property_candidates integer;
  v_property_updated integer;
  v_property_skipped integer;
  v_listing_candidates integer;
  v_listing_updated integer;
  v_listing_skipped integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin đã đăng nhập mới được chạy title backfill'
      USING ERRCODE = '42501';
  END IF;

  CREATE TEMP TABLE property_title_backfill_candidates ON COMMIT DROP AS
  SELECT
    p.id,
    p.slug AS original_slug,
    public.normalize_listing_title(p.title, p.city, p.district, p.ward) AS proposed_title
  FROM public.properties AS p
  WHERE p.title IS DISTINCT FROM public.normalize_listing_title(p.title, p.city, p.district, p.ward)
    AND NOT EXISTS (
      SELECT 1
      FROM public.property_verification_cases AS verification_case
      WHERE verification_case.property_id = p.id
        AND verification_case.status = 'verified'
    )
  FOR UPDATE;

  CREATE TEMP TABLE user_listing_title_backfill_candidates ON COMMIT DROP AS
  SELECT
    listing.id,
    listing.slug AS original_slug,
    public.normalize_listing_title(listing.title, listing.city, listing.district, listing.ward) AS proposed_title
  FROM public.user_listings AS listing
  WHERE listing.title IS DISTINCT FROM public.normalize_listing_title(listing.title, listing.city, listing.district, listing.ward)
    AND NOT EXISTS (
      SELECT 1
      FROM public.property_verification_cases AS verification_case
      WHERE verification_case.property_id = listing.property_id
        AND verification_case.status = 'verified'
    )
  FOR UPDATE;

  SELECT count(*)::integer INTO v_property_candidates
  FROM property_title_backfill_candidates;

  SELECT count(*)::integer INTO v_listing_candidates
  FROM user_listing_title_backfill_candidates;

  SELECT count(*)::integer INTO v_property_skipped
  FROM public.properties AS p
  WHERE p.title IS DISTINCT FROM public.normalize_listing_title(p.title, p.city, p.district, p.ward)
    AND EXISTS (
      SELECT 1
      FROM public.property_verification_cases AS verification_case
      WHERE verification_case.property_id = p.id
        AND verification_case.status = 'verified'
    );

  SELECT count(*)::integer INTO v_listing_skipped
  FROM public.user_listings AS listing
  WHERE listing.title IS DISTINCT FROM public.normalize_listing_title(listing.title, listing.city, listing.district, listing.ward)
    AND EXISTS (
      SELECT 1
      FROM public.property_verification_cases AS verification_case
      WHERE verification_case.property_id = listing.property_id
        AND verification_case.status = 'verified'
    );

  UPDATE public.properties AS property
  SET title = candidate.proposed_title
  FROM property_title_backfill_candidates AS candidate
  WHERE property.id = candidate.id;
  GET DIAGNOSTICS v_property_updated = ROW_COUNT;

  IF v_property_updated <> v_property_candidates THEN
    RAISE EXCEPTION 'Property title backfill row count mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.user_listings AS listing
  SET title = candidate.proposed_title
  FROM user_listing_title_backfill_candidates AS candidate
  WHERE listing.id = candidate.id;
  GET DIAGNOSTICS v_listing_updated = ROW_COUNT;

  IF v_listing_updated <> v_listing_candidates THEN
    RAISE EXCEPTION 'User listing title backfill row count mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.properties AS property
    JOIN property_title_backfill_candidates AS candidate USING (id)
    WHERE property.title IS DISTINCT FROM candidate.proposed_title
       OR property.slug IS DISTINCT FROM candidate.original_slug
  ) THEN
    RAISE EXCEPTION 'Property title backfill invariant failed'
      USING ERRCODE = 'P0001';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_listings AS listing
    JOIN user_listing_title_backfill_candidates AS candidate USING (id)
    WHERE listing.title IS DISTINCT FROM candidate.proposed_title
       OR listing.slug IS DISTINCT FROM candidate.original_slug
  ) THEN
    RAISE EXCEPTION 'User listing title backfill invariant failed'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN QUERY
  SELECT 'properties'::text, v_property_candidates, v_property_updated, v_property_skipped
  UNION ALL
  SELECT 'user_listings'::text, v_listing_candidates, v_listing_updated, v_listing_skipped;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_backfill_listing_titles() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_backfill_listing_titles() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
