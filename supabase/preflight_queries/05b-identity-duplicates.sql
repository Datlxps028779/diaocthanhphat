-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

WITH duplicate_properties AS (
  SELECT md5(concat_ws('|', lower(regexp_replace(btrim(coalesce(p.title, '')), '\s+', ' ', 'g')),
    coalesce(p.price::text, ''), coalesce(p.price_unit, ''), coalesce(p.price_per_month::text, ''),
    coalesce(p.listing_type::text, ''), coalesce(p.area_sqm::text, ''), coalesce(p.address, ''),
    coalesce(p.city, ''), coalesce(p.district, ''), coalesce(p.ward, ''), coalesce(p.contact_phone, ''))) AS fingerprint,
    array_agg(p.id ORDER BY p.id) AS property_ids, count(*)::bigint AS row_count
  FROM public.properties p
  WHERE p.is_active
  GROUP BY 1 HAVING count(*) > 1
), duplicate_listings AS (
  SELECT md5(concat_ws('|', lower(regexp_replace(btrim(coalesce(l.title, '')), '\s+', ' ', 'g')),
    coalesce(l.price::text, ''), coalesce(l.price_unit, ''), coalesce(l.price_per_month::text, ''),
    coalesce(l.listing_type::text, ''), coalesce(l.area_sqm::text, ''), coalesce(l.address, ''),
    coalesce(l.city, ''), coalesce(l.district, ''), coalesce(l.ward, ''), coalesce(l.contact_phone, ''))) AS fingerprint,
    array_agg(l.id ORDER BY l.id) AS listing_ids, count(*)::bigint AS row_count
  FROM public.user_listings l
  WHERE l.status IN ('pending', 'approved')
  GROUP BY 1 HAVING count(*) > 1
)
SELECT now() AS measured_at, 'properties' AS source, 'duplicate_fingerprint_group' AS check_code,
       'high' AS severity, 'manual_review_duplicate' AS candidate_class,
       fingerprint, property_ids AS candidate_ids, row_count,
       'Exact fingerprint không chứng minh cùng tài sản; cần manual review' AS notes
FROM duplicate_properties
UNION ALL
SELECT now(), 'user_listings', 'duplicate_fingerprint_group', 'high', 'manual_review_duplicate',
       fingerprint, listing_ids, row_count,
       'Exact fingerprint không chứng minh cùng phiên đăng tin; cần manual review'
FROM duplicate_listings
ORDER BY source, row_count DESC, fingerprint;

ROLLBACK;
