-- Read-only dry-run cho 20260912000000_listing_title_normalization.sql
-- Chỉ SELECT; không cập nhật title/slug.

WITH property_changes AS MATERIALIZED (
  SELECT
    p.id,
    p.slug,
    p.title AS current_title,
    public.normalize_listing_title(p.title, p.city, p.district, p.ward) AS proposed_title,
    p.is_active,
    EXISTS (
      SELECT 1 FROM public.property_verification_cases verification_case
      WHERE verification_case.property_id = p.id AND verification_case.status = 'verified'
    ) AS has_verified_case
  FROM public.properties p
), listing_changes AS MATERIALIZED (
  SELECT
    listing.id,
    listing.property_id,
    listing.slug,
    listing.title AS current_title,
    public.normalize_listing_title(listing.title, listing.city, listing.district, listing.ward) AS proposed_title,
    listing.status,
    EXISTS (
      SELECT 1 FROM public.property_verification_cases verification_case
      WHERE verification_case.property_id = listing.property_id AND verification_case.status = 'verified'
    ) AS linked_verified_case
  FROM public.user_listings listing
)
SELECT 'properties' AS source, count(*) AS total_rows,
       count(*) FILTER (WHERE current_title IS DISTINCT FROM proposed_title) AS changed_rows,
       count(*) FILTER (WHERE current_title IS DISTINCT FROM proposed_title AND has_verified_case) AS skipped_verified_rows
FROM property_changes
UNION ALL
SELECT 'user_listings', count(*),
       count(*) FILTER (WHERE current_title IS DISTINCT FROM proposed_title),
       count(*) FILTER (WHERE current_title IS DISTINCT FROM proposed_title AND linked_verified_case)
FROM listing_changes;

SELECT
  p.id,
  p.slug,
  p.verification_status,
  EXISTS (
    SELECT 1 FROM public.property_verification_cases verification_case
    WHERE verification_case.property_id = p.id AND verification_case.status = 'verified'
  ) AS has_verified_case,
  p.title AS current_title,
  public.normalize_listing_title(p.title, p.city, p.district, p.ward) AS proposed_title
FROM public.properties p
WHERE p.title IS DISTINCT FROM public.normalize_listing_title(p.title, p.city, p.district, p.ward)
ORDER BY has_verified_case DESC, p.is_active DESC, p.updated_at DESC
LIMIT 50;

SELECT
  listing.id,
  listing.property_id,
  listing.slug,
  listing.status,
  listing.title AS current_title,
  public.normalize_listing_title(listing.title, listing.city, listing.district, listing.ward) AS proposed_title
FROM public.user_listings listing
WHERE listing.title IS DISTINCT FROM public.normalize_listing_title(listing.title, listing.city, listing.district, listing.ward)
ORDER BY listing.updated_at DESC
LIMIT 50;

-- Riêng tập public đang hiển thị để đối chiếu browser/card.
SELECT
  p.id,
  p.slug,
  p.verification_status,
  p.title AS current_title,
  public.normalize_listing_title(p.title, p.city, p.district, p.ward) AS proposed_title
FROM public.properties p
WHERE p.is_active = true
  AND p.title IS DISTINCT FROM public.normalize_listing_title(p.title, p.city, p.district, p.ward)
ORDER BY p.created_at DESC
LIMIT 50;

-- Contract/ACL/triggers sau migration.
SELECT
  to_regprocedure('public.normalize_listing_title(text,text,text,text)') AS normalize_function,
  to_regprocedure('public.normalize_listing_title_row()') AS trigger_function,
  has_function_privilege('anon', 'public.normalize_listing_title(text,text,text,text)'::regprocedure, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', 'public.normalize_listing_title(text,text,text,text)'::regprocedure, 'EXECUTE') AS authenticated_can_execute;

SELECT tgname, tgrelid::regclass AS table_name, pg_get_triggerdef(oid) AS definition
FROM pg_trigger
WHERE tgname IN ('trg_normalize_user_listing_title', 'trg_normalize_property_title')
ORDER BY tgname;
