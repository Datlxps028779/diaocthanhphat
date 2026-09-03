-- Read-only preflight for user listing owner mapping.
-- Run this before the matching migration and review the candidate rows.

WITH property_fingerprints AS (
  SELECT
    p.id AS property_id,
    p.title,
    p.city,
    p.district,
    p.ward,
    md5(concat_ws('|',
      lower(regexp_replace(btrim(coalesce(p.title, '')), '\s+', ' ', 'g')),
      coalesce(p.description, ''),
      coalesce(p.price::text, ''),
      coalesce(p.price_unit, ''),
      coalesce(p.price_label, ''),
      coalesce(p.price_per_month::text, ''),
      coalesce(p.loan_support::text, ''),
      coalesce(p.listing_type, ''),
      coalesce(p.area_sqm::text, ''),
      coalesce(p.address, ''),
      coalesce(p.city, ''),
      coalesce(p.district, ''),
      coalesce(p.ward, ''),
      coalesce(p.image_url, ''),
      coalesce(p.contact_name, ''),
      coalesce(p.contact_phone, '')
    )) AS fingerprint
  FROM public.properties p
  WHERE p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_listings linked
      WHERE linked.property_id = p.id
    )
), listing_fingerprints AS (
  SELECT
    ul.id AS listing_id,
    ul.user_id,
    ul.title,
    ul.city,
    ul.district,
    ul.ward,
    md5(concat_ws('|',
      lower(regexp_replace(btrim(coalesce(ul.title, '')), '\s+', ' ', 'g')),
      coalesce(ul.description, ''),
      coalesce(ul.price::text, ''),
      coalesce(ul.price_unit, ''),
      coalesce(ul.price_label, ''),
      coalesce(ul.price_per_month::text, ''),
      coalesce(ul.loan_support::text, ''),
      coalesce(ul.listing_type, ''),
      coalesce(ul.area_sqm::text, ''),
      coalesce(ul.address, ''),
      coalesce(ul.city, ''),
      coalesce(ul.district, ''),
      coalesce(ul.ward, ''),
      coalesce(ul.image_url, ''),
      coalesce(ul.contact_name, ''),
      coalesce(ul.contact_phone, '')
    )) AS fingerprint
  FROM public.user_listings ul
  WHERE ul.status = 'approved'
    AND ul.property_id IS NULL
), candidate_pairs AS (
  SELECT
    p.property_id,
    u.listing_id,
    u.user_id,
    p.title AS property_title,
    p.city AS property_city,
    p.district AS property_district,
    p.ward AS property_ward,
    count(*) OVER (PARTITION BY p.property_id) AS property_candidate_count,
    count(*) OVER (PARTITION BY u.listing_id) AS listing_candidate_count
  FROM property_fingerprints p
  JOIN listing_fingerprints u USING (fingerprint)
), safe_pairs AS (
  SELECT DISTINCT property_id, listing_id, user_id, property_title, property_city, property_district, property_ward
  FROM candidate_pairs
  WHERE property_candidate_count = 1
    AND listing_candidate_count = 1
)
SELECT 'active_property_without_link' AS metric, count(*)::bigint AS value
FROM property_fingerprints
UNION ALL
SELECT 'approved_listing_without_property', count(*)::bigint
FROM listing_fingerprints
UNION ALL
SELECT 'safe_one_to_one_candidates', count(*)::bigint
FROM safe_pairs
UNION ALL
SELECT 'ambiguous_candidate_properties', count(DISTINCT property_id)::bigint
FROM candidate_pairs
WHERE property_candidate_count > 1 OR listing_candidate_count > 1
UNION ALL
SELECT 'unmatched_active_properties', count(*)::bigint
FROM property_fingerprints p
LEFT JOIN candidate_pairs c ON c.property_id = p.property_id
WHERE c.property_id IS NULL;

WITH property_fingerprints AS (
  SELECT
    p.id AS property_id,
    p.title,
    p.city,
    p.district,
    p.ward,
    md5(concat_ws('|',
      lower(regexp_replace(btrim(coalesce(p.title, '')), '\s+', ' ', 'g')),
      coalesce(p.description, ''), coalesce(p.price::text, ''), coalesce(p.price_unit, ''),
      coalesce(p.price_label, ''), coalesce(p.price_per_month::text, ''),
      coalesce(p.loan_support::text, ''), coalesce(p.listing_type, ''),
      coalesce(p.area_sqm::text, ''), coalesce(p.address, ''), coalesce(p.city, ''),
      coalesce(p.district, ''), coalesce(p.ward, ''), coalesce(p.image_url, ''),
      coalesce(p.contact_name, ''), coalesce(p.contact_phone, '')
    )) AS fingerprint
  FROM public.properties p
  WHERE p.is_active = true
    AND NOT EXISTS (SELECT 1 FROM public.user_listings linked WHERE linked.property_id = p.id)
), listing_fingerprints AS (
  SELECT
    ul.id AS listing_id,
    ul.user_id,
    ul.title,
    md5(concat_ws('|',
      lower(regexp_replace(btrim(coalesce(ul.title, '')), '\s+', ' ', 'g')),
      coalesce(ul.description, ''), coalesce(ul.price::text, ''), coalesce(ul.price_unit, ''),
      coalesce(ul.price_label, ''), coalesce(ul.price_per_month::text, ''),
      coalesce(ul.loan_support::text, ''), coalesce(ul.listing_type, ''),
      coalesce(ul.area_sqm::text, ''), coalesce(ul.address, ''), coalesce(ul.city, ''),
      coalesce(ul.district, ''), coalesce(ul.ward, ''), coalesce(ul.image_url, ''),
      coalesce(ul.contact_name, ''), coalesce(ul.contact_phone, '')
    )) AS fingerprint
  FROM public.user_listings ul
  WHERE ul.status = 'approved' AND ul.property_id IS NULL
), candidate_pairs AS (
  SELECT
    p.property_id,
    u.listing_id,
    u.user_id,
    p.title AS property_title,
    count(*) OVER (PARTITION BY p.property_id) AS property_candidate_count,
    count(*) OVER (PARTITION BY u.listing_id) AS listing_candidate_count
  FROM property_fingerprints p
  JOIN listing_fingerprints u USING (fingerprint)
)
SELECT property_id, listing_id, user_id, property_title
FROM candidate_pairs
WHERE property_candidate_count = 1 AND listing_candidate_count = 1
ORDER BY property_title, property_id;
