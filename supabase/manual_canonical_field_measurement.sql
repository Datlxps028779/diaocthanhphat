-- =============================================================================
-- Horizon 1 — Canonical field measurement (read-only)
--
-- Measures duplicated property/listing fields before choosing a repair or sync
-- boundary. This file does not choose a winner per row and never mutates data.
-- Production must be run by the user after reviewing the SQL.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- 1) Stable distributions. This result set shows whether a field exists on the
-- property projection, the listing session, both, or neither.
WITH property_rows AS (
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
    p.neighborhood_slug
  FROM public.properties AS p
), listing_rows AS (
  SELECT
    l.id AS listing_id,
    l.property_id,
    l.status,
    l.listing_type,
    l.updated_at,
    l.title,
    l.area_sqm,
    l.price,
    l.price_unit,
    l.price_per_month,
    l.price_label,
    l.legal_status,
    l.city,
    l.district,
    l.ward,
    l.area_id,
    l.district_id,
    l.ward_id,
    l.neighborhood_slug
  FROM public.user_listings AS l
), pairs AS (
  SELECT
    p.*,
    l.listing_id,
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
  FROM property_rows AS p
  LEFT JOIN listing_rows AS l ON l.property_id = p.property_id
), field_states AS (
  SELECT 'title' AS field_name, 'property' AS source, count(*)::bigint AS row_count
  FROM pairs WHERE NULLIF(btrim(title), '') IS NOT NULL
  UNION ALL
  SELECT 'title', 'listing', count(*)::bigint FROM pairs WHERE NULLIF(btrim(listing_title), '') IS NOT NULL
  UNION ALL
  SELECT 'area_sqm', 'property', count(*)::bigint FROM pairs WHERE area_sqm IS NOT NULL
  UNION ALL
  SELECT 'area_sqm', 'listing', count(*)::bigint FROM pairs WHERE listing_id IS NOT NULL AND listing_area_sqm IS NOT NULL
  UNION ALL
  SELECT 'sale_price', 'property', count(*)::bigint FROM pairs
  WHERE listing_id IS NOT NULL AND listing_status = 'approved' AND listing_listing_type = 'mua_ban' AND price IS NOT NULL AND price > 0
  UNION ALL
  SELECT 'sale_price', 'listing', count(*)::bigint FROM pairs
  WHERE listing_id IS NOT NULL AND listing_status = 'approved' AND listing_listing_type = 'mua_ban' AND listing_price IS NOT NULL AND listing_price > 0
  UNION ALL
  SELECT 'rental_monthly_price', 'property', count(*)::bigint FROM pairs
  WHERE listing_id IS NOT NULL AND listing_status = 'approved' AND listing_listing_type = 'cho_thue' AND price_per_month IS NOT NULL AND price_per_month > 0
  UNION ALL
  SELECT 'rental_monthly_price', 'listing', count(*)::bigint FROM pairs
  WHERE listing_id IS NOT NULL AND listing_status = 'approved' AND listing_listing_type = 'cho_thue' AND listing_price_per_month IS NOT NULL AND listing_price_per_month > 0
  UNION ALL
  SELECT 'price_label', 'property', count(*)::bigint FROM pairs WHERE NULLIF(btrim(price_label), '') IS NOT NULL
  UNION ALL
  SELECT 'price_label', 'listing', count(*)::bigint FROM pairs WHERE listing_id IS NOT NULL AND NULLIF(btrim(listing_price_label), '') IS NOT NULL
  UNION ALL
  SELECT 'legal_status', 'property', count(*)::bigint FROM pairs WHERE NULLIF(btrim(legal_status), '') IS NOT NULL
  UNION ALL
  SELECT 'legal_status', 'listing', count(*)::bigint FROM pairs WHERE listing_id IS NOT NULL AND NULLIF(btrim(listing_legal_status), '') IS NOT NULL
  UNION ALL
  SELECT 'location_structured_ids', 'property', count(*)::bigint FROM pairs
  WHERE area_id IS NOT NULL OR district_id IS NOT NULL OR ward_id IS NOT NULL
  UNION ALL
  SELECT 'location_structured_ids', 'listing', count(*)::bigint FROM pairs
  WHERE listing_id IS NOT NULL AND (listing_area_id IS NOT NULL OR listing_district_id IS NOT NULL OR listing_ward_id IS NOT NULL)
)
SELECT
  now() AS measured_at,
  'canonical_field_measurement' AS source,
  'field_distribution' AS check_code,
  'info' AS severity,
  'all' AS scope,
  field_name,
  source AS value_source,
  row_count,
  'Counts are per property/listing pair; a property may appear more than once when it has multiple listings.' AS notes
FROM field_states
ORDER BY field_name, value_source;

-- 2) Mismatch summary. Property values are measured against every linked listing
-- but no field is selected as the winner by this audit.
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
  LEFT JOIN public.user_listings AS l ON l.property_id = p.id
), checks AS (
  SELECT 'title_missing_property' AS check_code, 'medium' AS severity, 'all' AS scope, property_id, listing_id
  FROM pairs WHERE listing_id IS NOT NULL AND NULLIF(btrim(title), '') IS NULL
  UNION ALL
  SELECT 'title_missing_listing', 'medium', 'all', property_id, listing_id
  FROM pairs WHERE listing_id IS NOT NULL AND NULLIF(btrim(listing_title), '') IS NULL
  UNION ALL
  SELECT 'title_text_mismatch', 'medium', 'all', property_id, listing_id
  FROM pairs
  WHERE listing_id IS NOT NULL
    AND NULLIF(btrim(title), '') IS NOT NULL
    AND NULLIF(btrim(listing_title), '') IS NOT NULL
    AND lower(regexp_replace(btrim(title), '\\s+', ' ', 'g'))
      IS DISTINCT FROM lower(regexp_replace(btrim(listing_title), '\\s+', ' ', 'g'))
  UNION ALL
  SELECT 'area_missing_property', 'medium', 'all', property_id, listing_id
  FROM pairs WHERE listing_id IS NOT NULL AND area_sqm IS NULL AND listing_area_sqm IS NOT NULL
  UNION ALL
  SELECT 'area_missing_listing', 'medium', 'all', property_id, listing_id
  FROM pairs WHERE listing_id IS NOT NULL AND area_sqm IS NOT NULL AND listing_area_sqm IS NULL
  UNION ALL
  SELECT 'area_value_mismatch', 'medium', 'all', property_id, listing_id
  FROM pairs
  WHERE listing_id IS NOT NULL AND area_sqm IS NOT NULL AND listing_area_sqm IS NOT NULL AND area_sqm <> listing_area_sqm
  UNION ALL
  SELECT 'listing_type_mismatch', 'high', 'all', property_id, listing_id
  FROM pairs
  WHERE listing_id IS NOT NULL AND listing_type IS DISTINCT FROM listing_listing_type
  UNION ALL
  SELECT 'sale_numeric_price_mismatch', 'high', 'approved'
    , property_id, listing_id
  FROM pairs
  WHERE listing_id IS NOT NULL AND listing_status = 'approved'
    AND listing_type = 'mua_ban' AND listing_listing_type = 'mua_ban'
    AND price IS DISTINCT FROM listing_price
    AND (price IS NOT NULL OR listing_price IS NOT NULL)
  UNION ALL
  SELECT 'sale_price_unit_mismatch', 'medium', 'approved', property_id, listing_id
  FROM pairs
  WHERE listing_id IS NOT NULL AND listing_status = 'approved'
    AND listing_type = 'mua_ban' AND listing_listing_type = 'mua_ban'
    AND lower(NULLIF(btrim(price_unit), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_price_unit), ''))
    AND (NULLIF(btrim(price_unit), '') IS NOT NULL OR NULLIF(btrim(listing_price_unit), '') IS NOT NULL)
  UNION ALL
  SELECT 'rental_monthly_price_mismatch', 'high', 'approved', property_id, listing_id
  FROM pairs
  WHERE listing_id IS NOT NULL AND listing_status = 'approved'
    AND listing_type = 'cho_thue' AND listing_listing_type = 'cho_thue'
    AND (price_per_month IS DISTINCT FROM listing_price_per_month)
    AND (price_per_month IS NOT NULL OR listing_price_per_month IS NOT NULL)
  UNION ALL
  SELECT 'price_label_mismatch', 'medium', 'all', property_id, listing_id
  FROM pairs
  WHERE listing_id IS NOT NULL
    AND lower(NULLIF(btrim(price_label), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_price_label), ''))
    AND (NULLIF(btrim(price_label), '') IS NOT NULL OR NULLIF(btrim(listing_price_label), '') IS NOT NULL)
  UNION ALL
  SELECT 'legal_status_mismatch', 'high', 'all', property_id, listing_id
  FROM pairs
  WHERE listing_id IS NOT NULL
    AND lower(NULLIF(btrim(legal_status), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_legal_status), ''))
    AND (NULLIF(btrim(legal_status), '') IS NOT NULL OR NULLIF(btrim(listing_legal_status), '') IS NOT NULL)
  UNION ALL
  SELECT 'location_structured_id_mismatch', 'high', 'all', property_id, listing_id
  FROM pairs
  WHERE listing_id IS NOT NULL
    AND (area_id IS DISTINCT FROM listing_area_id
      OR district_id IS DISTINCT FROM listing_district_id
      OR ward_id IS DISTINCT FROM listing_ward_id)
  UNION ALL
  SELECT 'location_text_mismatch', 'medium', 'all', property_id, listing_id
  FROM pairs
  WHERE listing_id IS NOT NULL
    AND (lower(NULLIF(btrim(city), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_city), ''))
      OR lower(NULLIF(btrim(district), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_district), ''))
      OR lower(NULLIF(btrim(ward), '')) IS DISTINCT FROM lower(NULLIF(btrim(listing_ward), '')))
  UNION ALL
  SELECT 'neighborhood_slug_mismatch', 'medium', 'all', property_id, listing_id
  FROM pairs
  WHERE listing_id IS NOT NULL AND neighborhood_slug IS DISTINCT FROM listing_neighborhood_slug
)
SELECT
  now() AS measured_at,
  'canonical_field_measurement' AS source,
  check_code,
  severity,
  scope,
  count(*)::bigint AS row_count,
  'Candidate count only; no repair winner is inferred.' AS notes
FROM checks
GROUP BY check_code, severity, scope
ORDER BY severity DESC, check_code;

-- 3) Review candidates with identifiers and the exact domains that disagree.
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
), candidate_reasons AS (
  SELECT
    pairs.*,
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
  FROM pairs
)
SELECT
  now() AS measured_at,
  'canonical_field_measurement' AS source,
  CASE WHEN is_verified IS TRUE OR verification_status IN ('verified', 'revoked') THEN 'manual_review_verified_sensitive' ELSE 'manual_review' END AS check_code,
  CASE WHEN is_verified IS TRUE OR verification_status IN ('verified', 'revoked') THEN 'high' ELSE 'medium' END AS severity,
  listing_status AS scope,
  property_id,
  listing_id,
  listing_updated_at,
  is_active AS property_is_active,
  is_verified AS legacy_is_verified,
  verification_status,
  conflict_domains,
  'Do not backfill from this row without source evidence and a guarded dry-run.' AS notes
FROM candidate_reasons
WHERE cardinality(conflict_domains) > 0
ORDER BY severity DESC, listing_updated_at DESC NULLS LAST, property_id, listing_id;

-- 4) Identity/projection shape. Multiple linked listing sessions mean that
-- property-varying fields cannot be copied blindly into one property row.
WITH listing_counts AS (
  SELECT
    p.id AS property_id,
    p.is_active,
    count(l.id)::bigint AS listing_count,
    count(*) FILTER (WHERE l.status = 'approved')::bigint AS approved_listing_count,
    count(*) FILTER (WHERE l.status IN ('pending', 'approved'))::bigint AS current_listing_count,
    count(DISTINCT l.listing_type)::bigint AS listing_type_count,
    count(DISTINCT (l.price, l.price_unit, l.price_per_month)) FILTER (WHERE l.id IS NOT NULL)::bigint AS price_semantics_count
  FROM public.properties AS p
  LEFT JOIN public.user_listings AS l ON l.property_id = p.id
  GROUP BY p.id, p.is_active
)
SELECT
  now() AS measured_at,
  'canonical_field_measurement' AS source,
  CASE
    WHEN listing_count = 0 THEN 'property_without_listing'
    WHEN listing_count > 1 AND (listing_type_count > 1 OR price_semantics_count > 1) THEN 'property_with_multiple_conflicting_listings'
    WHEN listing_count > 1 THEN 'property_with_multiple_listings'
    ELSE 'one_listing_property_pair'
  END AS check_code,
  CASE
    WHEN listing_count > 1 AND (listing_type_count > 1 OR price_semantics_count > 1) THEN 'high'
    WHEN listing_count > 1 OR listing_count = 0 THEN 'medium'
    ELSE 'info'
  END AS severity,
  CASE WHEN is_active THEN 'active_property' ELSE 'inactive_property' END AS scope,
  property_id,
  listing_count,
  approved_listing_count,
  current_listing_count,
  listing_type_count,
  price_semantics_count,
  'Property and listing identities remain separate; counts do not authorize merge or sync.' AS notes
FROM listing_counts
ORDER BY severity DESC, listing_count DESC, property_id;

ROLLBACK;
