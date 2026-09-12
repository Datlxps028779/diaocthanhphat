-- =============================================================================
-- Horizon 1 — Canonical field conflicts (single-result, read-only)
--
-- Use this file when the SQL editor only displays the last result set. It returns
-- conflict counts and candidate identifiers in one result set. It never mutates.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH pairs AS (
  SELECT
    p.id AS property_id,
    p.is_active,
    p.is_verified,
    p.verification_status,
    p.title,
    p.area_sqm,
    p.listing_type,
    p.price,
    p.price_unit,
    p.price_per_month,
    p.price_label,
    p.legal_status,
    p.city,
    p.district,
    p.ward,
    p.area_id,
    p.district_id,
    p.ward_id,
    p.neighborhood_slug,
    l.id AS listing_id,
    l.status AS listing_status,
    l.listing_type AS listing_listing_type,
    l.updated_at AS listing_updated_at,
    l.title AS listing_title,
    l.area_sqm AS listing_area_sqm,
    l.price AS listing_price,
    l.price_unit AS listing_price_unit,
    l.price_per_month AS listing_price_per_month,
    l.price_label AS listing_price_label,
    l.legal_status AS listing_legal_status,
    l.city AS listing_city,
    l.district AS listing_district,
    l.ward AS listing_ward,
    l.area_id AS listing_area_id,
    l.district_id AS listing_district_id,
    l.ward_id AS listing_ward_id,
    l.neighborhood_slug AS listing_neighborhood_slug
  FROM public.properties AS p
  JOIN public.user_listings AS l ON l.property_id = p.id
), checks AS (
  SELECT 'listing_type_mismatch' AS check_code, 'high' AS severity, 'all' AS check_scope, property_id, listing_id
  FROM pairs WHERE listing_type IS DISTINCT FROM listing_listing_type
  UNION ALL
  SELECT 'title_missing_property', 'medium', 'all', property_id, listing_id
  FROM pairs WHERE NULLIF(btrim(title), '') IS NULL
  UNION ALL
  SELECT 'title_missing_listing', 'medium', 'all', property_id, listing_id
  FROM pairs WHERE NULLIF(btrim(listing_title), '') IS NULL
  UNION ALL
  SELECT 'title_text_mismatch', 'medium', 'all', property_id, listing_id
  FROM pairs
  WHERE NULLIF(btrim(title), '') IS NOT NULL
    AND NULLIF(btrim(listing_title), '') IS NOT NULL
    AND lower(regexp_replace(btrim(title), '\\s+', ' ', 'g'))
      IS DISTINCT FROM lower(regexp_replace(btrim(listing_title), '\\s+', ' ', 'g'))
  UNION ALL
  SELECT 'area_missing_property', 'medium', 'all', property_id, listing_id
  FROM pairs WHERE area_sqm IS NULL AND listing_area_sqm IS NOT NULL
  UNION ALL
  SELECT 'area_missing_listing', 'medium', 'all', property_id, listing_id
  FROM pairs WHERE area_sqm IS NOT NULL AND listing_area_sqm IS NULL
  UNION ALL
  SELECT 'area_value_mismatch', 'medium', 'all', property_id, listing_id
  FROM pairs WHERE area_sqm IS DISTINCT FROM listing_area_sqm
  UNION ALL
  SELECT 'sale_numeric_price_mismatch', 'high', 'approved', property_id, listing_id
  FROM pairs
  WHERE listing_status = 'approved'
    AND listing_type = 'mua_ban' AND listing_listing_type = 'mua_ban'
    AND price IS DISTINCT FROM listing_price
    AND (price IS NOT NULL OR listing_price IS NOT NULL)
  UNION ALL
  SELECT 'sale_price_unit_mismatch', 'medium', 'approved', property_id, listing_id
  FROM pairs
  WHERE listing_status = 'approved'
    AND listing_type = 'mua_ban' AND listing_listing_type = 'mua_ban'
    AND lower(NULLIF(btrim(price_unit), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_price_unit), ''))
    AND (NULLIF(btrim(price_unit), '') IS NOT NULL OR NULLIF(btrim(listing_price_unit), '') IS NOT NULL)
  UNION ALL
  SELECT 'rental_monthly_price_mismatch', 'high', 'approved', property_id, listing_id
  FROM pairs
  WHERE listing_status = 'approved'
    AND listing_type = 'cho_thue' AND listing_listing_type = 'cho_thue'
    AND price_per_month IS DISTINCT FROM listing_price_per_month
    AND (price_per_month IS NOT NULL OR listing_price_per_month IS NOT NULL)
  UNION ALL
  SELECT 'price_label_mismatch', 'medium', 'all', property_id, listing_id
  FROM pairs
  WHERE lower(NULLIF(btrim(price_label), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_price_label), ''))
    AND (NULLIF(btrim(price_label), '') IS NOT NULL OR NULLIF(btrim(listing_price_label), '') IS NOT NULL)
  UNION ALL
  SELECT 'legal_status_mismatch', 'high', 'all', property_id, listing_id
  FROM pairs
  WHERE lower(NULLIF(btrim(legal_status), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_legal_status), ''))
    AND (NULLIF(btrim(legal_status), '') IS NOT NULL OR NULLIF(btrim(listing_legal_status), '') IS NOT NULL)
  UNION ALL
  SELECT 'location_structured_id_mismatch', 'high', 'all', property_id, listing_id
  FROM pairs
  WHERE area_id IS DISTINCT FROM listing_area_id
     OR district_id IS DISTINCT FROM listing_district_id
     OR ward_id IS DISTINCT FROM listing_ward_id
  UNION ALL
  SELECT 'location_text_mismatch', 'medium', 'all', property_id, listing_id
  FROM pairs
  WHERE lower(NULLIF(btrim(city), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_city), ''))
     OR lower(NULLIF(btrim(district), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_district), ''))
     OR lower(NULLIF(btrim(ward), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_ward), ''))
  UNION ALL
  SELECT 'neighborhood_slug_mismatch', 'medium', 'all', property_id, listing_id
  FROM pairs WHERE neighborhood_slug IS DISTINCT FROM listing_neighborhood_slug
), candidate_reasons AS (
  SELECT
    p.*,
    array_remove(ARRAY[
      CASE WHEN listing_type IS DISTINCT FROM listing_listing_type THEN 'listing_type' END,
      CASE WHEN lower(regexp_replace(btrim(title), '\\s+', ' ', 'g')) IS DISTINCT FROM lower(regexp_replace(btrim(listing_title), '\\s+', ' ', 'g')) THEN 'title' END,
      CASE WHEN area_sqm IS DISTINCT FROM listing_area_sqm THEN 'area_sqm' END,
      CASE WHEN listing_type = 'mua_ban' AND listing_listing_type = 'mua_ban' AND (price IS DISTINCT FROM listing_price OR lower(NULLIF(btrim(price_unit), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_price_unit), ''))) THEN 'sale_price_semantics' END,
      CASE WHEN listing_type = 'cho_thue' AND listing_listing_type = 'cho_thue' AND price_per_month IS DISTINCT FROM listing_price_per_month THEN 'rental_monthly_price' END,
      CASE WHEN lower(NULLIF(btrim(price_label), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_price_label), '')) THEN 'price_label' END,
      CASE WHEN lower(NULLIF(btrim(legal_status), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_legal_status), '')) THEN 'legal_status' END,
      CASE WHEN area_id IS DISTINCT FROM listing_area_id OR district_id IS DISTINCT FROM listing_district_id OR ward_id IS DISTINCT FROM listing_ward_id THEN 'location_structured_ids' END,
      CASE WHEN lower(NULLIF(btrim(city), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_city), '')) OR lower(NULLIF(btrim(district), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_district), '')) OR lower(NULLIF(btrim(ward), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_ward), '')) THEN 'location_text' END,
      CASE WHEN neighborhood_slug IS DISTINCT FROM listing_neighborhood_slug THEN 'neighborhood_slug' END
    ], NULL) AS conflict_domains
  FROM pairs AS p
), result_rows AS (
  SELECT
    'summary' AS result_kind,
    c.check_code,
    c.severity,
    c.check_scope AS scope,
    count(*)::bigint AS row_count,
    NULL::uuid AS property_id,
    NULL::uuid AS listing_id,
    NULL::text[] AS conflict_domains,
    'Candidate count only; no repair winner is inferred.' AS notes
  FROM checks AS c
  GROUP BY c.check_code, c.severity, c.check_scope
  UNION ALL
  SELECT
    'candidate',
    'field_conflict',
    CASE WHEN is_verified IS TRUE OR verification_status IN ('verified', 'revoked') THEN 'high' ELSE 'medium' END,
    listing_status,
    1::bigint,
    property_id,
    listing_id,
    conflict_domains,
    'Do not backfill from this row without source evidence and a guarded dry-run.'
  FROM candidate_reasons
  WHERE cardinality(conflict_domains) > 0
)
SELECT
  now() AS measured_at,
  'canonical_field_measurement' AS source,
  result_kind,
  check_code,
  severity,
  scope,
  row_count,
  property_id,
  listing_id,
  conflict_domains,
  notes
FROM result_rows
ORDER BY result_kind, severity DESC, check_code, property_id NULLS LAST, listing_id NULLS LAST;

ROLLBACK;
