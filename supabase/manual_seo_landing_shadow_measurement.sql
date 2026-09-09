-- =============================================================================
-- SEO landing shadow measurement — read-only, no sitemap/indexing changes
--
-- Measures every active property combination for the proposed canonical shape:
-- /{mua-ban|cho-thue}/{area-slug}/{district-slug}/{property-type-slug}
--
-- This report does not choose a final threshold and does not mutate data.
-- Run it in Supabase SQL Editor, review the distribution, then decide the
-- composite landing quality gate before changing the public sitemap.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH measured AS (
  SELECT
    p.listing_type,
    a.id AS area_id,
    a.name AS area_name,
    a.slug AS area_slug,
    a.description AS area_description,
    d.id AS district_id,
    d.name AS district_name,
    d.slug AS district_slug,
    pt.id AS property_type_id,
    pt.name AS property_type_name,
    pt.slug AS property_type_slug,
    count(*)::integer AS active_property_count,
    count(*) FILTER (WHERE NULLIF(btrim(p.title), '') IS NOT NULL)::integer AS titled_property_count,
    count(DISTINCT NULLIF(btrim(p.title), ''))::integer AS distinct_title_count,
    max(p.updated_at) AS latest_property_updated_at,
    min(p.created_at) AS first_property_created_at,
    bool_and(p.is_active IS TRUE) AS all_properties_active,
    (
      p.listing_type IN ('mua_ban', 'cho_thue')
      AND a.id IS NOT NULL
      AND NULLIF(btrim(a.slug), '') IS NOT NULL
      AND d.id IS NOT NULL
      AND d.area_id = a.id
      AND NULLIF(btrim(d.slug), '') IS NOT NULL
      AND pt.id IS NOT NULL
      AND NULLIF(btrim(pt.slug), '') IS NOT NULL
    ) AS taxonomy_valid
  FROM public.properties AS p
  LEFT JOIN public.areas AS a ON a.id = p.area_id
  LEFT JOIN public.districts AS d ON d.id = p.district_id
  LEFT JOIN public.property_types AS pt ON pt.id = p.property_type_id
  WHERE p.is_active IS TRUE
  GROUP BY
    p.listing_type,
    a.id,
    a.name,
    a.slug,
    a.description,
    d.id,
    d.name,
    d.slug,
    pt.id,
    pt.name,
    pt.slug
), shaped AS (
  SELECT
    measured.*,
    CASE
      WHEN district_slug LIKE area_slug || '-%'
        THEN substr(district_slug, length(area_slug) + 2)
      ELSE district_slug
    END AS district_display_slug
  FROM measured
)
SELECT
  now() AS measured_at,
  'seo_landing_shadow_measurement' AS source,
  'measurement_only' AS decision,
  listing_type,
  area_id,
  area_name,
  area_slug,
  district_id,
  district_name,
  district_slug,
  district_display_slug,
  property_type_id,
  property_type_name,
  property_type_slug,
  active_property_count,
  titled_property_count,
  distinct_title_count,
  latest_property_updated_at,
  first_property_created_at,
  all_properties_active,
  taxonomy_valid,
  NULLIF(btrim(area_description), '') IS NOT NULL AS has_area_description,
  CASE
    WHEN taxonomy_valid THEN format(
      '/%s/%s/%s/%s',
      CASE listing_type WHEN 'mua_ban' THEN 'mua-ban' WHEN 'cho_thue' THEN 'cho-thue' END,
      area_slug,
      district_display_slug,
      property_type_slug
    )
    ELSE NULL
  END AS proposed_canonical_path,
  -- Illustrative only: this is not the final quality gate.
  active_property_count >= 5
    AND taxonomy_valid
    AND NULLIF(btrim(area_description), '') IS NOT NULL AS meets_example_min_5_gate,
  'Review counts and content signals before choosing the real indexability threshold. No row from this report is automatically added to sitemap.' AS notes
FROM shaped
ORDER BY listing_type, area_slug NULLS LAST, district_display_slug NULLS LAST, property_type_slug NULLS LAST;

ROLLBACK;
