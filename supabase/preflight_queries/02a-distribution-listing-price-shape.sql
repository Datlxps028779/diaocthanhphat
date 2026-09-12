-- Read-only export from manual_data_correctness_preflight.sql.
-- Run this file by itself in Supabase SQL Editor.
BEGIN TRANSACTION READ ONLY;

-- Distributions are intentionally not reduced to pass/fail counts.
WITH listing_rows AS (
  SELECT 'properties'::text AS source, p.id, p.listing_type::text AS listing_type,
         p.price_unit, p.price, p.price_per_month, p.price_label, p.loan_support,
         p.area_sqm, p.property_type_id, p.is_active AS public_active,
         NULL::text AS lifecycle_status
  FROM public.properties p
  UNION ALL
  SELECT 'user_listings', l.id, l.listing_type::text, l.price_unit, l.price,
         l.price_per_month, l.price_label, l.loan_support, l.area_sqm,
         l.property_type_id, l.status = 'approved', l.status
  FROM public.user_listings l
)
SELECT now() AS measured_at, source, 'listing_type_price_shape' AS distribution_code,
       coalesce(listing_type, '(null)') AS dimension_1,
       coalesce(price_unit, '(null)') AS dimension_2,
       CASE WHEN price IS NULL THEN 'price:null' ELSE 'price:set' END || '|' ||
       CASE WHEN price_per_month IS NULL THEN 'monthly:null' ELSE 'monthly:set' END || '|' ||
       CASE WHEN loan_support IS NULL THEN 'loan:null' ELSE 'loan:set' END AS dimension_3,
       lifecycle_status AS dimension_4,
       count(*)::bigint AS row_count,
       count(*) FILTER (WHERE public_active)::bigint AS public_row_count
FROM listing_rows
GROUP BY source, listing_type, price_unit, price IS NULL, price_per_month IS NULL,
         loan_support IS NULL, lifecycle_status
ORDER BY source, row_count DESC, dimension_1, dimension_2, dimension_3;

ROLLBACK;
