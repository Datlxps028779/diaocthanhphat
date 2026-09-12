-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

WITH listing_rows AS (
  SELECT 'properties'::text AS source, p.id, p.listing_type::text AS listing_type,
         p.price, p.price_per_month, p.price_label, p.area_sqm,
         p.property_type_id, p.is_active AS public_active
  FROM public.properties p
  UNION ALL
  SELECT 'user_listings', l.id, l.listing_type::text, l.price, l.price_per_month,
         l.price_label, l.area_sqm, l.property_type_id, l.status = 'approved'
  FROM public.user_listings l
)
SELECT now() AS measured_at, source, 'property_type_numeric_shape' AS distribution_code,
       coalesce(property_type_id::text, '(null)') AS dimension_1,
       coalesce(listing_type, '(null)') AS dimension_2,
       CASE WHEN area_sqm IS NULL THEN 'area:null' ELSE 'area:set' END AS dimension_3,
       CASE WHEN price_label ~ '[0-9]' THEN 'price_label:digits' ELSE 'price_label:no_digits_or_null' END AS dimension_4,
       count(*)::bigint AS row_count,
       count(*) FILTER (WHERE public_active)::bigint AS public_row_count
FROM listing_rows
GROUP BY source, property_type_id, listing_type, area_sqm IS NULL, price_label ~ '[0-9]'
ORDER BY source, row_count DESC, dimension_1, dimension_2;

ROLLBACK;
