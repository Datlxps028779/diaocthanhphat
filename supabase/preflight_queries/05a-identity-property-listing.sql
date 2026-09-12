-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

WITH property_fingerprints AS (
  SELECT p.id AS property_id,
    md5(concat_ws('|',
      lower(regexp_replace(btrim(coalesce(p.title, '')), '\s+', ' ', 'g')),
      coalesce(p.description, ''), coalesce(p.price::text, ''), coalesce(p.price_unit, ''),
      coalesce(p.price_label, ''), coalesce(p.price_per_month::text, ''), coalesce(p.loan_support::text, ''),
      coalesce(p.listing_type::text, ''), coalesce(p.area_sqm::text, ''), coalesce(p.address, ''),
      coalesce(p.city, ''), coalesce(p.district, ''), coalesce(p.ward, ''), coalesce(p.image_url, ''),
      coalesce(p.contact_name, ''), coalesce(p.contact_phone, '')
    )) AS fingerprint
  FROM public.properties p
  WHERE p.is_active = true
    AND NOT EXISTS (SELECT 1 FROM public.user_listings l WHERE l.property_id = p.id)
), listing_fingerprints AS (
  SELECT l.id AS listing_id, l.user_id,
    md5(concat_ws('|',
      lower(regexp_replace(btrim(coalesce(l.title, '')), '\s+', ' ', 'g')),
      coalesce(l.description, ''), coalesce(l.price::text, ''), coalesce(l.price_unit, ''),
      coalesce(l.price_label, ''), coalesce(l.price_per_month::text, ''), coalesce(l.loan_support::text, ''),
      coalesce(l.listing_type::text, ''), coalesce(l.area_sqm::text, ''), coalesce(l.address, ''),
      coalesce(l.city, ''), coalesce(l.district, ''), coalesce(l.ward, ''), coalesce(l.image_url, ''),
      coalesce(l.contact_name, ''), coalesce(l.contact_phone, '')
    )) AS fingerprint
  FROM public.user_listings l
  WHERE l.status = 'approved' AND l.property_id IS NULL
), candidate_pairs AS (
  SELECT p.property_id, l.listing_id, l.user_id, p.fingerprint,
         count(*) OVER (PARTITION BY p.property_id) AS property_candidate_count,
         count(*) OVER (PARTITION BY l.listing_id) AS listing_candidate_count
  FROM property_fingerprints p
  JOIN listing_fingerprints l USING (fingerprint)
)
SELECT now() AS measured_at, 'property_listing' AS source,
       'identity_candidate' AS check_code,
       CASE WHEN property_candidate_count = 1 AND listing_candidate_count = 1 THEN 'medium' ELSE 'high' END AS severity,
       CASE WHEN property_candidate_count = 1 AND listing_candidate_count = 1 THEN 'safe_one_to_one_candidate' ELSE 'ambiguous_candidate' END AS candidate_class,
       property_id, listing_id, user_id, property_candidate_count, listing_candidate_count,
       'Fingerprint chỉ là routing hint; không tự link/đổi ownership' AS notes
FROM candidate_pairs
ORDER BY candidate_class, property_id, listing_id
LIMIT 500;

ROLLBACK;
