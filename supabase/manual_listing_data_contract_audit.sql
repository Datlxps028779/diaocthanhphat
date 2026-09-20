-- =============================================================================
-- Listing Data Contract Audit — production read-only measurement
--
-- Người dùng chạy trực tiếp trên production Supabase SQL Editor.
-- Script chỉ đọc: transaction READ ONLY và ROLLBACK ở cuối.
-- Không sửa dữ liệu, không backfill, không xoá, không tạo index/constraint.
-- Không trả về PII; sample chỉ dùng UUID và các count/fingerprint cần thiết.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- 1) Inventory theo identity, lifecycle và public visibility.
SELECT 'inventory' AS section, jsonb_build_object(
  'properties_total', (SELECT count(*) FROM public.properties),
  'properties_active', (SELECT count(*) FROM public.properties WHERE is_active = true),
  'user_listings_total', (SELECT count(*) FROM public.user_listings),
  'user_listings_by_status', (
    SELECT coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
    FROM (
      SELECT status, count(*) AS total
      FROM public.user_listings
      GROUP BY status
      ORDER BY status
    ) s
  ),
  'approved_without_property_id', (
    SELECT count(*) FROM public.user_listings
    WHERE status = 'approved' AND property_id IS NULL
  ),
  'approved_expired_by_timestamp', (
    SELECT count(*) FROM public.user_listings
    WHERE status = 'approved' AND expires_at IS NOT NULL AND expires_at <= now()
  ),
  'approved_not_public_property', (
    SELECT count(*)
    FROM public.user_listings ul
    JOIN public.properties p ON p.id = ul.property_id
    WHERE ul.status = 'approved' AND p.is_active IS DISTINCT FROM true
  )
) AS measurement;

-- 2) Listing/property relation integrity. A linked pair should expose the same
-- owned fields after approval/reapproval; mismatches are measured, not changed.
SELECT 'identity_relation_conflicts' AS section, jsonb_build_object(
  'missing_linked_property', count(*) FILTER (WHERE p.id IS NULL),
  'linked_property_not_active_for_approved', count(*) FILTER (
    WHERE ul.status = 'approved' AND p.id IS NOT NULL AND p.is_active IS DISTINCT FROM true
  ),
  'duplicate_listing_reference_to_property', (
    SELECT count(*) FROM (
      SELECT property_id
      FROM public.user_listings
      WHERE property_id IS NOT NULL
      GROUP BY property_id
      HAVING count(*) > 1
    ) d
  ),
  'field_conflict_count', count(*) FILTER (WHERE
    p.id IS NOT NULL AND (
      p.title IS DISTINCT FROM ul.title OR
      p.description IS DISTINCT FROM ul.description OR
      p.price IS DISTINCT FROM ul.price OR
      p.price_unit IS DISTINCT FROM ul.price_unit OR
      p.price_label IS DISTINCT FROM ul.price_label OR
      p.price_per_month IS DISTINCT FROM ul.price_per_month OR
      p.listing_type IS DISTINCT FROM ul.listing_type OR
      p.area_sqm IS DISTINCT FROM ul.area_sqm OR
      p.address IS DISTINCT FROM ul.address OR
      p.city IS DISTINCT FROM ul.city OR
      p.district IS DISTINCT FROM ul.district OR
      p.ward IS DISTINCT FROM ul.ward OR
      p.area_id IS DISTINCT FROM ul.area_id OR
      p.district_id IS DISTINCT FROM ul.district_id OR
      p.neighborhood_slug IS DISTINCT FROM ul.neighborhood_slug OR
      p.property_type_id IS DISTINCT FROM ul.property_type_id OR
      p.legal_status IS DISTINCT FROM ul.legal_status OR
      p.bedrooms IS DISTINCT FROM ul.bedrooms OR
      p.bathrooms IS DISTINCT FROM ul.bathrooms OR
      p.direction IS DISTINCT FROM ul.direction OR
      p.latitude IS DISTINCT FROM ul.latitude OR
      p.longitude IS DISTINCT FROM ul.longitude OR
      p.formatted_address IS DISTINCT FROM ul.formatted_address
    )
  ),
  'field_conflict_by_field', jsonb_build_object(
    'title', count(*) FILTER (WHERE p.id IS NOT NULL AND p.title IS DISTINCT FROM ul.title),
    'description', count(*) FILTER (WHERE p.id IS NOT NULL AND p.description IS DISTINCT FROM ul.description),
    'price', count(*) FILTER (WHERE p.id IS NOT NULL AND p.price IS DISTINCT FROM ul.price),
    'price_unit', count(*) FILTER (WHERE p.id IS NOT NULL AND p.price_unit IS DISTINCT FROM ul.price_unit),
    'price_label', count(*) FILTER (WHERE p.id IS NOT NULL AND p.price_label IS DISTINCT FROM ul.price_label),
    'price_per_month', count(*) FILTER (WHERE p.id IS NOT NULL AND p.price_per_month IS DISTINCT FROM ul.price_per_month),
    'listing_type', count(*) FILTER (WHERE p.id IS NOT NULL AND p.listing_type IS DISTINCT FROM ul.listing_type),
    'area_sqm', count(*) FILTER (WHERE p.id IS NOT NULL AND p.area_sqm IS DISTINCT FROM ul.area_sqm),
    'location_text', count(*) FILTER (WHERE p.id IS NOT NULL AND (p.address IS DISTINCT FROM ul.address OR p.city IS DISTINCT FROM ul.city OR p.district IS DISTINCT FROM ul.district OR p.ward IS DISTINCT FROM ul.ward)),
    'location_ids', count(*) FILTER (WHERE p.id IS NOT NULL AND (p.area_id IS DISTINCT FROM ul.area_id OR p.district_id IS DISTINCT FROM ul.district_id OR p.neighborhood_slug IS DISTINCT FROM ul.neighborhood_slug)),
    'legal_status', count(*) FILTER (WHERE p.id IS NOT NULL AND p.legal_status IS DISTINCT FROM ul.legal_status),
    'coordinates', count(*) FILTER (WHERE p.id IS NOT NULL AND (p.latitude IS DISTINCT FROM ul.latitude OR p.longitude IS DISTINCT FROM ul.longitude))
  )
)
FROM public.user_listings ul
LEFT JOIN public.properties p ON p.id = ul.property_id;

-- 3) Required field and semantic anomalies, split by source/status.
SELECT 'field_quality' AS section, jsonb_build_object(
  'properties_active_missing_title', count(*) FILTER (WHERE p.is_active AND nullif(btrim(p.title), '') IS NULL),
  'properties_active_missing_price', count(*) FILTER (WHERE p.is_active AND p.price IS NULL),
  'properties_active_nonpositive_price', count(*) FILTER (WHERE p.is_active AND (p.price IS NULL OR p.price <= 0)),
  'properties_active_missing_area', count(*) FILTER (WHERE p.is_active AND p.area_sqm IS NULL),
  'properties_active_nonpositive_area', count(*) FILTER (WHERE p.is_active AND p.area_sqm IS NOT NULL AND p.area_sqm <= 0),
  'properties_active_missing_legal_status', count(*) FILTER (WHERE p.is_active AND nullif(btrim(p.legal_status), '') IS NULL),
  'properties_active_missing_property_type', count(*) FILTER (WHERE p.is_active AND p.property_type_id IS NULL),
  'properties_active_unpaired_coordinates', count(*) FILTER (WHERE p.is_active AND ((p.latitude IS NULL) <> (p.longitude IS NULL))),
  'properties_active_invalid_coordinates', count(*) FILTER (WHERE p.is_active AND (p.latitude < -90 OR p.latitude > 90 OR p.longitude < -180 OR p.longitude > 180)),
  'pending_missing_title', (SELECT count(*) FROM public.user_listings WHERE status = 'pending' AND nullif(btrim(title), '') IS NULL),
  'pending_missing_description_content', (SELECT count(*) FROM public.user_listings WHERE status = 'pending' AND length(public.listing_plain_text(description)) < 80),
  'pending_malformed_price_semantics', (SELECT count(*) FROM public.user_listings WHERE status = 'pending' AND ((listing_type = 'mua_ban' AND (price IS NULL OR price <= 0)) OR (listing_type = 'cho_thue' AND coalesce(price_per_month, price) <= 0))),
  'pending_invalid_rental_loan_combination', (SELECT count(*) FROM public.user_listings WHERE status = 'pending' AND listing_type = 'cho_thue' AND loan_support IS NOT NULL),
  'pending_unpaired_coordinates', (SELECT count(*) FROM public.user_listings WHERE status = 'pending' AND ((latitude IS NULL) <> (longitude IS NULL)))
)
FROM public.properties p;

-- 4) Title signals: titles that embed price/area may be editorial text, so this
-- is a candidate count only and never treats parsing as canonical data.
SELECT 'title_signal_candidates' AS section, jsonb_build_object(
  'properties_price_or_area_in_title', count(*) FILTER (
    WHERE title ~* '(^|[^0-9])([0-9]+([.,][0-9]+)?)[[:space:]]*(tỷ|ty|triệu|tr|m2|m²|mét)[^a-zA-Z0-9]'
  ),
  'user_listings_price_or_area_in_title', (
    SELECT count(*) FROM public.user_listings
    WHERE title ~* '(^|[^0-9])([0-9]+([.,][0-9]+)?)[[:space:]]*(tỷ|ty|triệu|tr|m2|m²|mét)[^a-zA-Z0-9]'
  ),
  'properties_title_normalized_difference', count(*) FILTER (
    WHERE public.normalize_listing_title(title, city, district, ward) IS DISTINCT FROM title
  ),
  'user_listings_title_normalized_difference', (
    SELECT count(*) FROM public.user_listings
    WHERE public.normalize_listing_title(title, city, district, ward) IS DISTINCT FROM title
  )
)
FROM public.properties;

-- 5) Location integrity: FK taxonomy, text fields and coordinates are compared
-- independently. Text mismatch is a review signal, not an automatic correction.
SELECT 'location_conflicts' AS section, jsonb_build_object(
  'properties_active_area_fk_name_vs_city_mismatch', count(*) FILTER (
    WHERE p.is_active AND a.id IS NOT NULL AND nullif(btrim(p.city), '') IS NOT NULL
      AND lower(a.name) <> lower(p.city)
  ),
  'properties_active_missing_area_fk', count(*) FILTER (WHERE p.is_active AND p.area_id IS NULL),
  'properties_active_missing_district_fk', count(*) FILTER (WHERE p.is_active AND p.district_id IS NULL),
  'properties_active_missing_location_text', count(*) FILTER (WHERE p.is_active AND nullif(btrim(p.city), '') IS NULL AND nullif(btrim(p.address), '') IS NULL),
  'properties_active_invalid_coordinate_pair', count(*) FILTER (WHERE p.is_active AND ((p.latitude IS NULL) <> (p.longitude IS NULL))),
  'user_listings_missing_area_fk', (SELECT count(*) FROM public.user_listings WHERE status IN ('pending','approved') AND area_id IS NULL),
  'user_listings_missing_district_fk', (SELECT count(*) FROM public.user_listings WHERE status IN ('pending','approved') AND district_id IS NULL),
  'linked_coordinate_conflicts', (
    SELECT count(*) FROM public.user_listings ul JOIN public.properties p ON p.id = ul.property_id
    WHERE p.latitude IS DISTINCT FROM ul.latitude OR p.longitude IS DISTINCT FROM ul.longitude
  )
)
FROM public.properties p
LEFT JOIN public.areas a ON a.id = p.area_id;

-- 6) Canonical slug/URL candidates across the two entities. A duplicate slug
-- is measured separately because the routes may have different namespaces.
SELECT 'canonical_duplicates' AS section, jsonb_build_object(
  'duplicate_property_slugs', (
    SELECT count(*) FROM (SELECT slug FROM public.properties WHERE nullif(btrim(slug), '') IS NOT NULL GROUP BY slug HAVING count(*) > 1) d
  ),
  'duplicate_user_listing_slugs', (
    SELECT count(*) FROM (SELECT slug FROM public.user_listings WHERE nullif(btrim(slug), '') IS NOT NULL GROUP BY slug HAVING count(*) > 1) d
  ),
  'linked_slug_conflicts', (
    SELECT count(*) FROM public.user_listings ul JOIN public.properties p ON p.id = ul.property_id
    WHERE ul.slug IS DISTINCT FROM p.slug
  ),
  'active_properties_missing_slug', (SELECT count(*) FROM public.properties WHERE is_active AND nullif(btrim(slug), '') IS NULL),
  'approved_listings_missing_slug', (SELECT count(*) FROM public.user_listings WHERE status = 'approved' AND nullif(btrim(slug), '') IS NULL)
);

-- 7) Verification/public claim coverage. Legacy is_verified is not treated as
-- evidence; this only counts the evidence-backed projection state.
SELECT 'verification_coverage' AS section, jsonb_build_object(
  'active_verified_legacy_flag', count(*) FILTER (WHERE is_active AND is_verified = true),
  'active_verified_evidence_status', count(*) FILTER (WHERE is_active AND verification_status = 'verified'),
  'active_verified_without_open_verified_case', count(*) FILTER (
    WHERE is_active AND verification_status = 'verified' AND NOT EXISTS (
      SELECT 1 FROM public.property_verification_cases vc
      WHERE vc.property_id = p.id AND vc.status = 'verified'
    )
  ),
  'active_public_verification_expired', count(*) FILTER (WHERE is_active AND verification_status = 'verified' AND verified_until <= now())
)
FROM public.properties p;

-- 8) SEO/JSON-LD/RAG source coverage. This identifies missing source data and
-- stale public projections without exposing content.
SELECT 'projection_coverage' AS section, jsonb_build_object(
  'active_properties_missing_meta_title', count(*) FILTER (WHERE is_active AND nullif(btrim(meta_title), '') IS NULL),
  'active_properties_missing_meta_description', count(*) FILTER (WHERE is_active AND nullif(btrim(meta_description), '') IS NULL),
  'active_properties_invalid_schema_object', count(*) FILTER (WHERE is_active AND schema_markup IS NOT NULL AND jsonb_typeof(schema_markup) <> 'object'),
  'active_properties_without_public_rag_chunk', count(*) FILTER (WHERE is_active AND NOT EXISTS (
    SELECT 1 FROM public.rag_chunks rc WHERE rc.source_table = 'properties' AND rc.source_id = p.id AND rc.visibility = 'public'
  )),
  'active_properties_with_relative_rag_url', count(*) FILTER (WHERE is_active AND EXISTS (
    SELECT 1 FROM public.rag_chunks rc WHERE rc.source_table = 'properties' AND rc.source_id = p.id AND rc.visibility = 'public' AND (rc.source_url IS NULL OR rc.source_url NOT LIKE 'https://chonhaviet.com/%')
  )),
  'public_rag_property_chunks_for_inactive_property', (
    SELECT count(*) FROM public.rag_chunks rc JOIN public.properties p2 ON p2.id = rc.source_id
    WHERE rc.source_table = 'properties' AND rc.visibility = 'public' AND p2.is_active IS DISTINCT FROM true
  )
)
FROM public.properties p;

-- 9) Bounded duplicate/fraud signals. These are review candidates only; no
-- fuzzy merge, unique constraint change or deletion is performed.
SELECT 'duplicate_review_candidates' AS section, jsonb_build_object(
  'same_title_city_active_properties', (
    SELECT count(*) FROM (
      SELECT lower(regexp_replace(btrim(title), '[[:space:]]+', ' ', 'g')) AS title_key,
             lower(btrim(city)) AS city_key
      FROM public.properties
      WHERE is_active AND nullif(btrim(title), '') IS NOT NULL
      GROUP BY 1, 2 HAVING count(*) > 1
    ) d
  ),
  'same_price_area_location_active_properties', (
    SELECT count(*) FROM (
      SELECT price, area_sqm, area_id, district_id, lower(btrim(address)) AS address_key
      FROM public.properties
      WHERE is_active AND price IS NOT NULL AND area_sqm IS NOT NULL
      GROUP BY 1, 2, 3, 4, 5 HAVING count(*) > 1
    ) d
  ),
  'same_owner_multiple_active_listings', (
    SELECT count(*) FROM (
      SELECT user_id FROM public.user_listings WHERE status = 'approved' GROUP BY user_id HAVING count(*) > 1
    ) d
  )
);

-- 10) Non-PII sample of relation conflicts for manual review. Keep bounded.
SELECT ul.id AS user_listing_id,
       ul.property_id,
       ul.status,
       p.is_active AS property_is_active,
       md5(concat_ws('|', p.title, ul.title, p.price::text, ul.price::text, p.area_sqm::text, ul.area_sqm::text, p.city, ul.city)) AS conflict_fingerprint
FROM public.user_listings ul
JOIN public.properties p ON p.id = ul.property_id
WHERE p.title IS DISTINCT FROM ul.title
   OR p.price IS DISTINCT FROM ul.price
   OR p.area_sqm IS DISTINCT FROM ul.area_sqm
   OR p.city IS DISTINCT FROM ul.city
   OR p.area_id IS DISTINCT FROM ul.area_id
   OR p.district_id IS DISTINCT FROM ul.district_id
   OR p.legal_status IS DISTINCT FROM ul.legal_status
ORDER BY ul.updated_at DESC NULLS LAST
LIMIT 100;

ROLLBACK;
