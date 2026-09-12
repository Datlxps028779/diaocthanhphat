-- =============================================================================
-- Horizon 4 read-only measurement: SEO/content consistency
--
-- Measures production source data used by canonical routes, sitemap candidates,
-- News structured location, internal links, and Search Visibility audit rows.
-- Does NOT write data, change schema/privileges, call Google, or fetch sitemap.
-- Run in Supabase SQL Editor. The generated sitemap/JSON-LD still needs browser
-- verification because this SQL only measures their database source rows.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- 1) News inventory, slug safety, structured-location coverage, and stored
-- schema_markup shape. Stored schema_markup is informational only: the public
-- route may generate JSON-LD from canonical source data instead.
WITH published AS (
  SELECT *
  FROM public.news
  WHERE is_published = true
),
slug_stats AS (
  SELECT
    count(*) FILTER (WHERE nullif(btrim(slug), '') IS NULL) AS missing_slug,
    count(*) FILTER (WHERE nullif(btrim(slug), '') IS NOT NULL
      AND btrim(slug) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$') AS malformed_slug,
    count(*) FILTER (WHERE slug IS NOT NULL) AS non_null_slug
  FROM published
), duplicate_slugs AS (
  SELECT count(*) AS duplicate_slug_groups
  FROM (
    SELECT lower(btrim(slug)) AS normalized_slug
    FROM published
    WHERE nullif(btrim(slug), '') IS NOT NULL
    GROUP BY lower(btrim(slug))
    HAVING count(*) > 1
  ) d
),
location_counts AS (
  SELECT
    count(*) FILTER (WHERE area_id IS NOT NULL) AS with_area_id,
    count(*) FILTER (WHERE district_id IS NOT NULL) AS with_district_id,
    count(*) FILTER (WHERE ward_id IS NOT NULL) AS with_ward_id,
    count(*) FILTER (WHERE neighborhood_id IS NOT NULL) AS with_neighborhood_id,
    count(*) FILTER (WHERE area_id IS NOT NULL OR district_id IS NOT NULL
      OR ward_id IS NOT NULL OR neighborhood_id IS NOT NULL) AS with_any_location_id,
    count(*) FILTER (WHERE jsonb_typeof(schema_markup::jsonb) = 'object') AS schema_markup_object,
    count(*) FILTER (WHERE schema_markup IS NULL) AS schema_markup_null,
    count(*) FILTER (WHERE schema_markup IS NOT NULL
      AND jsonb_typeof(schema_markup::jsonb) IS DISTINCT FROM 'object') AS schema_markup_non_object
  FROM published
)
SELECT jsonb_build_object(
  'published_news', (SELECT count(*) FROM published),
  'slug_stats', (SELECT to_jsonb(slug_stats) FROM slug_stats),
  'duplicate_slug_groups', (SELECT duplicate_slug_groups FROM duplicate_slugs),
  'structured_location', (SELECT to_jsonb(location_counts) FROM location_counts)
) AS horizon4_news_source_measurement;

-- 2) Structured-location integrity audit. The trigger should prevent these
-- mismatches, but this query makes the current production evidence explicit.
SELECT
  n.id,
  n.slug,
  n.area_id,
  n.district_id,
  n.ward_id,
  n.neighborhood_id,
  d.area_id AS district_area_id,
  w.district_id AS ward_district_id,
  nb.area_id AS neighborhood_area_id,
  nb.district_id AS neighborhood_district_id,
  nb.ward_id AS neighborhood_ward_id,
  ARRAY_REMOVE(ARRAY[
    CASE WHEN n.district_id IS NOT NULL AND d.id IS NULL THEN 'DISTRICT_NOT_FOUND' END,
    CASE WHEN n.ward_id IS NOT NULL AND w.id IS NULL THEN 'WARD_NOT_FOUND' END,
    CASE WHEN n.neighborhood_id IS NOT NULL AND nb.id IS NULL THEN 'NEIGHBORHOOD_NOT_FOUND' END,
    CASE WHEN d.id IS NOT NULL AND n.area_id IS DISTINCT FROM d.area_id THEN 'DISTRICT_AREA_MISMATCH' END,
    CASE WHEN w.id IS NOT NULL AND n.district_id IS DISTINCT FROM w.district_id THEN 'WARD_DISTRICT_MISMATCH' END,
    CASE WHEN w.id IS NOT NULL AND d.id IS NOT NULL AND d.area_id IS DISTINCT FROM (
      SELECT area_id FROM public.districts WHERE id = w.district_id
    ) THEN 'WARD_AREA_MISMATCH' END,
    CASE WHEN nb.id IS NOT NULL AND nb.area_id IS NOT NULL AND n.area_id IS DISTINCT FROM nb.area_id THEN 'NEIGHBORHOOD_AREA_MISMATCH' END,
    CASE WHEN nb.id IS NOT NULL AND nb.district_id IS NOT NULL AND n.district_id IS DISTINCT FROM nb.district_id THEN 'NEIGHBORHOOD_DISTRICT_MISMATCH' END,
    CASE WHEN nb.id IS NOT NULL AND nb.ward_id IS NOT NULL AND n.ward_id IS DISTINCT FROM nb.ward_id THEN 'NEIGHBORHOOD_WARD_MISMATCH' END
  ], NULL) AS issue_codes
FROM public.news n
LEFT JOIN public.districts d ON d.id = n.district_id
LEFT JOIN public.wards w ON w.id = n.ward_id
LEFT JOIN public.neighborhoods nb ON nb.id = n.neighborhood_id
WHERE n.is_published = true
  AND (
    (n.district_id IS NOT NULL AND d.id IS NULL)
    OR (n.ward_id IS NOT NULL AND w.id IS NULL)
    OR (n.neighborhood_id IS NOT NULL AND nb.id IS NULL)
    OR (d.id IS NOT NULL AND n.area_id IS DISTINCT FROM d.area_id)
    OR (w.id IS NOT NULL AND n.district_id IS DISTINCT FROM w.district_id)
    OR (nb.id IS NOT NULL AND nb.area_id IS NOT NULL AND n.area_id IS DISTINCT FROM nb.area_id)
    OR (nb.id IS NOT NULL AND nb.district_id IS NOT NULL AND n.district_id IS DISTINCT FROM nb.district_id)
    OR (nb.id IS NOT NULL AND nb.ward_id IS NOT NULL AND n.ward_id IS DISTINCT FROM nb.ward_id)
  )
ORDER BY n.slug NULLS LAST, n.id
LIMIT 100;

-- 3) Internal-link measurement in published News body. This intentionally
-- distinguishes relative links from absolute same-site links; the latter can
-- be a readiness warning even though they resolve to the same site.
WITH metrics AS (
  SELECT
    n.id,
    n.slug,
    coalesce((SELECT count(*) FROM regexp_matches(coalesce(n.content, ''), 'href=["'']\/[^"'']+["'']', 'gi')), 0) AS relative_href_count,
    coalesce((SELECT count(*) FROM regexp_matches(coalesce(n.content, ''), 'href=["'']https?://chonhaviet\.com\/[^"'']+["'']', 'gi')), 0) AS absolute_same_site_href_count,
    GREATEST(
      coalesce((SELECT count(*) FROM regexp_matches(coalesce(n.content, ''), 'href=["'']https?://[^"'']+["'']', 'gi')), 0)
      - coalesce((SELECT count(*) FROM regexp_matches(coalesce(n.content, ''), 'href=["'']https?://chonhaviet\.com\/[^"'']+["'']', 'gi')), 0),
      0
    ) AS external_href_count,
    coalesce((SELECT count(*) FROM regexp_matches(coalesce(n.content, ''), 'href=["'']\/[^"'']*[?#][^"'']*["'']', 'gi')), 0) AS relative_query_or_hash_count
  FROM public.news n
  WHERE n.is_published = true
)
SELECT jsonb_build_object(
  'published_count', count(*),
  'relative_links_lt_2', count(*) FILTER (WHERE relative_href_count < 2),
  'absolute_same_site_links_only_risk', count(*) FILTER (WHERE relative_href_count < 2 AND absolute_same_site_href_count >= 2),
  'external_links_present', count(*) FILTER (WHERE external_href_count > 0),
  'relative_query_or_hash_present', count(*) FILTER (WHERE relative_query_or_hash_count > 0),
  'sample', coalesce(jsonb_agg(row_to_json(s) ORDER BY s.relative_href_count, s.slug) FILTER (WHERE s.relative_href_count < 2), '[]'::jsonb)
) AS horizon4_internal_link_measurement
FROM (
  SELECT *
  FROM metrics
  ORDER BY relative_href_count, slug NULLS LAST
  LIMIT 20
) s;

-- 4) Search Visibility registry consistency for published News. This compares
-- deterministic source keys/canonical paths only; it does not infer Google
-- indexing and does not send any request.
WITH expected AS (
  SELECT
    n.id,
    n.slug,
    'news:' || n.id::text AS source_key,
    'https://chonhaviet.com/tin-tuc/' || coalesce(nullif(btrim(n.slug), ''), n.id::text) AS expected_canonical_url
  FROM public.news n
  WHERE n.is_published = true
),
registry AS (
  SELECT source_key, canonical_url, canonical_path, eligible, reason_code, updated_at
  FROM public.search_visibility_urls
  WHERE entity_type = 'news'
),
joined AS (
  SELECT
    e.id,
    e.slug,
    e.source_key,
    e.expected_canonical_url,
    r.canonical_url,
    r.canonical_path,
    r.eligible,
    r.reason_code,
    r.updated_at,
    CASE
      WHEN r.source_key IS NULL THEN 'MISSING_REGISTRY_ROW'
      WHEN r.canonical_url IS DISTINCT FROM e.expected_canonical_url THEN 'CANONICAL_URL_MISMATCH'
      WHEN r.canonical_path IS DISTINCT FROM replace(e.expected_canonical_url, 'https://chonhaviet.com', '') THEN 'CANONICAL_PATH_MISMATCH'
      WHEN r.eligible IS DISTINCT FROM true THEN 'PUBLISHED_NEWS_NOT_ELIGIBLE'
      ELSE NULL
    END AS issue_code
  FROM expected e
  LEFT JOIN registry r ON r.source_key = e.source_key
)
SELECT jsonb_build_object(
  'published_news', count(*),
  'missing_registry_row', count(*) FILTER (WHERE issue_code = 'MISSING_REGISTRY_ROW'),
  'canonical_url_mismatch', count(*) FILTER (WHERE issue_code = 'CANONICAL_URL_MISMATCH'),
  'canonical_path_mismatch', count(*) FILTER (WHERE issue_code = 'CANONICAL_PATH_MISMATCH'),
  'published_not_eligible', count(*) FILTER (WHERE issue_code = 'PUBLISHED_NEWS_NOT_ELIGIBLE'),
  'sample_issues', coalesce(jsonb_agg(row_to_json(i) ORDER BY i.slug) FILTER (WHERE i.issue_code IS NOT NULL), '[]'::jsonb)
) AS horizon4_news_registry_measurement
FROM (
  SELECT *
  FROM joined
  ORDER BY issue_code NULLS LAST, slug NULLS LAST
  LIMIT 100
) i;

-- 5) Registry uniqueness and latest audit runs. Unique constraints should make
-- duplicate canonical URLs impossible; this query verifies the stored evidence.
SELECT
  canonical_url,
  count(*)::integer AS row_count,
  array_agg(source_key ORDER BY source_key) AS source_keys
FROM public.search_visibility_urls
WHERE canonical_url IS NOT NULL
GROUP BY canonical_url
HAVING count(*) > 1
ORDER BY row_count DESC, canonical_url
LIMIT 100;

SELECT
  run_type,
  status,
  count(*)::integer AS run_count,
  max(started_at) AS latest_started_at,
  max(finished_at) AS latest_finished_at
FROM public.search_visibility_runs
GROUP BY run_type, status
ORDER BY run_type, status;

ROLLBACK;
