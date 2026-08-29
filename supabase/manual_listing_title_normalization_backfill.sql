-- Controlled backfill — chỉ chạy SAU KHI review manual_listing_title_normalization_dry_run.sql
-- Chỉ update title. Không update slug/public_code.
-- BĐS đang có verification case = verified bị loại để không supersede xác minh.

BEGIN;

CREATE TEMP TABLE property_title_candidates ON COMMIT DROP AS
SELECT
  p.id,
  p.slug AS original_slug,
  public.normalize_listing_title(p.title, p.city, p.district, p.ward) AS proposed_title
FROM public.properties p
WHERE p.title IS DISTINCT FROM public.normalize_listing_title(p.title, p.city, p.district, p.ward)
  AND NOT EXISTS (
    SELECT 1
    FROM public.property_verification_cases verification_case
    WHERE verification_case.property_id = p.id
      AND verification_case.status = 'verified'
  );

CREATE TEMP TABLE user_listing_title_candidates ON COMMIT DROP AS
SELECT
  listing.id,
  listing.slug AS original_slug,
  public.normalize_listing_title(listing.title, listing.city, listing.district, listing.ward) AS proposed_title
FROM public.user_listings listing
WHERE listing.title IS DISTINCT FROM public.normalize_listing_title(listing.title, listing.city, listing.district, listing.ward)
  AND NOT EXISTS (
    SELECT 1
    FROM public.property_verification_cases verification_case
    WHERE verification_case.property_id = listing.property_id
      AND verification_case.status = 'verified'
  );

-- Danh sách verified bị bỏ qua để xử lý thủ công + reverify riêng.
SELECT p.id, p.slug, p.title,
       public.normalize_listing_title(p.title, p.city, p.district, p.ward) AS proposed_title
FROM public.properties p
WHERE p.title IS DISTINCT FROM public.normalize_listing_title(p.title, p.city, p.district, p.ward)
  AND EXISTS (
    SELECT 1 FROM public.property_verification_cases verification_case
    WHERE verification_case.property_id = p.id AND verification_case.status = 'verified'
  )
ORDER BY p.updated_at DESC;

WITH changed AS (
  UPDATE public.properties property
  SET title = candidate.proposed_title
  FROM property_title_candidates candidate
  WHERE property.id = candidate.id
  RETURNING property.id
)
SELECT 'properties' AS source, count(*) AS updated_rows FROM changed;

WITH changed AS (
  UPDATE public.user_listings listing
  SET title = candidate.proposed_title
  FROM user_listing_title_candidates candidate
  WHERE listing.id = candidate.id
  RETURNING listing.id
)
SELECT 'user_listings' AS source, count(*) AS updated_rows FROM changed;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.properties property
    JOIN property_title_candidates candidate USING (id)
    WHERE property.title IS DISTINCT FROM candidate.proposed_title
  ) THEN
    RAISE EXCEPTION 'Property title backfill verification failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_listings listing
    JOIN user_listing_title_candidates candidate USING (id)
    WHERE listing.title IS DISTINCT FROM candidate.proposed_title
  ) THEN
    RAISE EXCEPTION 'User listing title backfill verification failed';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.properties property
    JOIN property_title_candidates candidate USING (id)
    WHERE property.slug IS DISTINCT FROM candidate.original_slug
  ) THEN
    RAISE EXCEPTION 'Property slug changed during title backfill';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.user_listings listing
    JOIN user_listing_title_candidates candidate USING (id)
    WHERE listing.slug IS DISTINCT FROM candidate.original_slug
  ) THEN
    RAISE EXCEPTION 'User listing slug changed during title backfill';
  END IF;
END;
$$;

COMMIT;
