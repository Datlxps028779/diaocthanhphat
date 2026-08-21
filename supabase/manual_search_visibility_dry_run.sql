-- =============================================================================
-- Search Visibility foundation — production read-only preflight
--
-- This script does not create, update, delete, schedule, contact Google, or submit
-- any URL. It measures the source data that the server-side registry will evaluate.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH
property_sources AS (
  SELECT
    p.id,
    p.is_active,
    p.public_code,
    p.slug,
    p.listing_type,
    a.slug AS area_slug,
    p.updated_at
  FROM public.properties p
  LEFT JOIN public.areas a ON a.id = p.area_id
),
area_signals AS (
  SELECT
    a.id,
    a.name,
    a.slug,
    a.description,
    count(p.id) FILTER (WHERE p.is_active) AS active_listing_count,
    count(DISTINCT nullif(btrim(coalesce(p.district, '')), '')) FILTER (WHERE p.is_active) AS distinct_district_count,
    count(DISTINCT p.property_type_id) FILTER (WHERE p.is_active AND p.property_type_id IS NOT NULL) AS distinct_property_type_count
  FROM public.areas a
  LEFT JOIN public.properties p ON p.area_id = a.id
  GROUP BY a.id, a.name, a.slug, a.description
),
neighborhood_signals AS (
  SELECT
    n.id,
    n.name,
    n.slug,
    n.description,
    count(p.id) FILTER (WHERE p.is_active) AS active_listing_count
  FROM public.neighborhoods n
  LEFT JOIN public.properties p ON p.neighborhood_slug = n.slug
  GROUP BY n.id, n.name, n.slug, n.description
)
SELECT jsonb_build_object(
  'property_candidates', jsonb_build_object(
    'active_total', (SELECT count(*) FROM property_sources WHERE is_active),
    'eligible_canonical_shape', (SELECT count(*) FROM property_sources WHERE is_active
      AND public_code IS NOT NULL
      AND nullif(btrim(coalesce(slug, '')), '') IS NOT NULL
      AND listing_type IN ('mua_ban', 'cho_thue')
      AND nullif(btrim(coalesce(area_slug, '')), '') IS NOT NULL),
    'active_missing_canonical_component', (SELECT count(*) FROM property_sources WHERE is_active
      AND (public_code IS NULL
        OR nullif(btrim(coalesce(slug, '')), '') IS NULL
        OR listing_type NOT IN ('mua_ban', 'cho_thue')
        OR nullif(btrim(coalesce(area_slug, '')), '') IS NULL)),
    'inactive_excluded', (SELECT count(*) FROM property_sources WHERE NOT is_active)
  ),
  'area_candidates', jsonb_build_object(
    'total', (SELECT count(*) FROM area_signals),
    'eligible_by_current_gate', (SELECT count(*) FROM area_signals
      WHERE nullif(btrim(coalesce(name, '')), '') IS NOT NULL
        AND nullif(btrim(coalesce(slug, '')), '') IS NOT NULL
        AND nullif(btrim(coalesce(description, '')), '') IS NOT NULL
        AND active_listing_count >= 5
        AND (distinct_district_count >= 2 OR distinct_property_type_count >= 2 OR active_listing_count >= 5)),
    'excluded_by_current_gate', (SELECT count(*) FROM area_signals
      WHERE NOT (
        nullif(btrim(coalesce(name, '')), '') IS NOT NULL
        AND nullif(btrim(coalesce(slug, '')), '') IS NOT NULL
        AND nullif(btrim(coalesce(description, '')), '') IS NOT NULL
        AND active_listing_count >= 5
        AND (distinct_district_count >= 2 OR distinct_property_type_count >= 2 OR active_listing_count >= 5)
      ))
  ),
  'neighborhood_candidates', jsonb_build_object(
    'total', (SELECT count(*) FROM neighborhood_signals),
    'eligible_by_current_gate', (SELECT count(*) FROM neighborhood_signals
      WHERE nullif(btrim(coalesce(name, '')), '') IS NOT NULL
        AND nullif(btrim(coalesce(slug, '')), '') IS NOT NULL
        AND nullif(btrim(coalesce(description, '')), '') IS NOT NULL
        AND active_listing_count >= 3),
    'excluded_by_current_gate', (SELECT count(*) FROM neighborhood_signals
      WHERE NOT (
        nullif(btrim(coalesce(name, '')), '') IS NOT NULL
        AND nullif(btrim(coalesce(slug, '')), '') IS NOT NULL
        AND nullif(btrim(coalesce(description, '')), '') IS NOT NULL
        AND active_listing_count >= 3
      ))
  ),
  'news_candidates', jsonb_build_object(
    'published_with_slug', (SELECT count(*) FROM public.news
      WHERE is_published AND nullif(btrim(coalesce(slug, '')), '') IS NOT NULL),
    'published_missing_slug', (SELECT count(*) FROM public.news
      WHERE is_published AND nullif(btrim(coalesce(slug, '')), '') IS NULL),
    'unpublished_excluded', (SELECT count(*) FROM public.news WHERE NOT is_published)
  ),
  'managed_page_candidates', jsonb_build_object(
    'active_public_with_slug', (SELECT count(*) FROM public.managed_pages
      WHERE is_active AND NOT is_system AND nullif(btrim(coalesce(slug, '')), '') IS NOT NULL),
    'inactive_or_system_excluded', (SELECT count(*) FROM public.managed_pages
      WHERE NOT is_active OR is_system),
    'active_public_missing_slug', (SELECT count(*) FROM public.managed_pages
      WHERE is_active AND NOT is_system AND nullif(btrim(coalesce(slug, '')), '') IS NULL)
  ),
  'google_integration', jsonb_build_object(
    'status', 'not_configured_by_this_migration',
    'note', 'No Google credential, API call, sitemap submission, URL inspection, or scheduler is performed by this SQL.'
  )
) AS search_visibility_preflight;

ROLLBACK;
