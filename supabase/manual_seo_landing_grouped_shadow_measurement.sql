-- =============================================================================
-- SEO landing grouped-type shadow measurement — read-only
--
-- Measures search-friendly type groups requested for canonical URLs such as:
-- /mua-ban/binh-duong/thuan-an/nha
-- /mua-ban/binh-phuoc/chon-thanh/dat
--
-- This is still measurement only. It does not change property_types, create URLs,
-- alter sitemap, or decide the final quality threshold.
-- The initial mapping is intentionally explicit and must be extended only after
-- reviewing active property types; unmapped types are reported separately.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH typed AS (
  SELECT
    p.id,
    p.listing_type,
    p.area_id,
    p.district_id,
    p.updated_at,
    p.created_at,
    p.title,
    a.name AS area_name,
    a.slug AS area_slug,
    d.name AS district_name,
    d.slug AS district_slug,
    pt.name AS property_type_name,
    pt.slug AS property_type_slug,
    CASE pt.slug
      WHEN 'nha-pho' THEN 'nha'
      WHEN 'dat-nen' THEN 'dat'
      WHEN 'dat-mau-dat-sao' THEN 'dat'
      ELSE NULL
    END AS seo_type_group
  FROM public.properties AS p
  LEFT JOIN public.areas AS a ON a.id = p.area_id
  LEFT JOIN public.districts AS d ON d.id = p.district_id
  LEFT JOIN public.property_types AS pt ON pt.id = p.property_type_id
  WHERE p.is_active IS TRUE
), grouped AS (
  SELECT
    listing_type,
    area_id,
    area_name,
    area_slug,
    district_id,
    district_name,
    district_slug,
    seo_type_group,
    array_agg(DISTINCT property_type_slug ORDER BY property_type_slug)
      FILTER (WHERE property_type_slug IS NOT NULL) AS source_property_type_slugs,
    array_agg(DISTINCT property_type_name ORDER BY property_type_name)
      FILTER (WHERE property_type_name IS NOT NULL) AS source_property_type_names,
    count(*)::integer AS active_property_count,
    count(*) FILTER (WHERE NULLIF(btrim(title), '') IS NOT NULL)::integer AS titled_property_count,
    count(DISTINCT NULLIF(btrim(title), ''))::integer AS distinct_title_count,
    max(updated_at) AS latest_property_updated_at,
    min(created_at) AS first_property_created_at,
    bool_and(
      area_id IS NOT NULL
      AND district_id IS NOT NULL
      AND area_slug IS NOT NULL
      AND district_slug IS NOT NULL
      AND seo_type_group IS NOT NULL
    ) AS taxonomy_and_mapping_valid
  FROM typed
  GROUP BY listing_type, area_id, area_name, area_slug, district_id, district_name, district_slug, seo_type_group
), unmapped AS (
  SELECT
    property_type_slug,
    max(property_type_name) AS property_type_name,
    count(*)::integer AS active_property_count
  FROM typed
  WHERE property_type_slug IS NOT NULL
    AND seo_type_group IS NULL
  GROUP BY property_type_slug
)
SELECT
  now() AS measured_at,
  'seo_landing_grouped_type_shadow_measurement' AS source,
  'measurement_only' AS decision,
  'grouped_type_candidate' AS row_kind,
  listing_type,
  area_id,
  area_name,
  area_slug,
  district_id,
  district_name,
  district_slug,
  seo_type_group,
  source_property_type_slugs,
  source_property_type_names,
  active_property_count,
  titled_property_count,
  distinct_title_count,
  latest_property_updated_at,
  first_property_created_at,
  taxonomy_and_mapping_valid,
  CASE
    WHEN taxonomy_and_mapping_valid THEN format(
      '/%s/%s/%s/%s',
      CASE listing_type WHEN 'mua_ban' THEN 'mua-ban' WHEN 'cho_thue' THEN 'cho-thue' END,
      area_slug,
      CASE WHEN district_slug LIKE area_slug || '-%' THEN substr(district_slug, length(area_slug) + 2) ELSE district_slug END,
      seo_type_group
    )
    ELSE NULL
  END AS proposed_canonical_path,
  active_property_count >= 5
    AND titled_property_count = active_property_count
    AND distinct_title_count >= 5
    AND taxonomy_and_mapping_valid AS meets_example_min_5_group_gate,
  NULL::text AS unmapped_property_type_slug,
  NULL::text AS unmapped_property_type_name,
  NULL::integer AS unmapped_active_property_count,
  'Review this group report and the unmapped type rows before adding any candidate to sitemap.' AS notes
FROM grouped

UNION ALL

SELECT
  now(),
  'seo_landing_grouped_type_shadow_measurement',
  'measurement_only',
  'unmapped_property_type',
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  0,
  0,
  0,
  NULL,
  NULL,
  false,
  NULL,
  false,
  unmapped.property_type_slug,
  unmapped.property_type_name,
  unmapped.active_property_count,
  'Unmapped active type: do not silently classify it into nha/dat; review mapping first.'
FROM unmapped
ORDER BY row_kind, listing_type NULLS LAST, area_slug NULLS LAST, district_slug NULLS LAST, seo_type_group NULLS LAST, unmapped_property_type_slug NULLS LAST;

ROLLBACK;
