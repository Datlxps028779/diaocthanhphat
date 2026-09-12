-- =============================================================================
-- Horizon 4 one-row summary — read-only
--
-- Use this when Supabase SQL Editor only shows the final result of a multi-query
-- script. It returns ONE JSON row containing the News source, location,
-- internal-link, Search Visibility registry, duplicate-canonical, and audit-run
-- measurements.
--
-- Does NOT write data, change schema/privileges, call Google, submit a sitemap,
-- or mutate Search Visibility. Production SQL is run by the user.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH published AS (
  SELECT *
  FROM public.news
  WHERE is_published = true
),
slug_stats AS (
  SELECT
    count(*) FILTER (WHERE nullif(btrim(slug), '') IS NULL)::integer AS missing_slug,
    count(*) FILTER (
      WHERE nullif(btrim(slug), '') IS NOT NULL
        AND btrim(slug) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )::integer AS malformed_slug,
    count(*) FILTER (WHERE nullif(btrim(slug), '') IS NOT NULL)::integer AS non_null_slug
  FROM published
),
duplicate_slugs AS (
  SELECT count(*)::integer AS duplicate_slug_groups
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
    count(*) FILTER (WHERE area_id IS NOT NULL)::integer AS with_area_id,
    count(*) FILTER (WHERE district_id IS NOT NULL)::integer AS with_district_id,
    count(*) FILTER (WHERE ward_id IS NOT NULL)::integer AS with_ward_id,
    count(*) FILTER (WHERE neighborhood_id IS NOT NULL)::integer AS with_neighborhood_id,
    count(*) FILTER (
      WHERE area_id IS NOT NULL OR district_id IS NOT NULL
        OR ward_id IS NOT NULL OR neighborhood_id IS NOT NULL
    )::integer AS with_any_location_id,
    count(*) FILTER (WHERE jsonb_typeof(schema_markup::jsonb) = 'object')::integer AS schema_markup_object,
    count(*) FILTER (WHERE schema_markup IS NULL)::integer AS schema_markup_null,
    count(*) FILTER (
      WHERE schema_markup IS NOT NULL
        AND jsonb_typeof(schema_markup::jsonb) IS DISTINCT FROM 'object'
    )::integer AS schema_markup_non_object
  FROM published
),
location_issues AS (
  SELECT
    n.id,
    n.slug,
    ARRAY_REMOVE(ARRAY[
      CASE WHEN n.district_id IS NOT NULL AND d.id IS NULL THEN 'DISTRICT_NOT_FOUND' END,
      CASE WHEN n.ward_id IS NOT NULL AND w.id IS NULL THEN 'WARD_NOT_FOUND' END,
      CASE WHEN n.neighborhood_id IS NOT NULL AND nb.id IS NULL THEN 'NEIGHBORHOOD_NOT_FOUND' END,
      CASE WHEN d.id IS NOT NULL AND n.area_id IS DISTINCT FROM d.area_id THEN 'DISTRICT_AREA_MISMATCH' END,
      CASE WHEN w.id IS NOT NULL AND n.district_id IS DISTINCT FROM w.district_id THEN 'WARD_DISTRICT_MISMATCH' END,
      CASE WHEN nb.id IS NOT NULL AND nb.area_id IS NOT NULL AND n.area_id IS DISTINCT FROM nb.area_id THEN 'NEIGHBORHOOD_AREA_MISMATCH' END,
      CASE WHEN nb.id IS NOT NULL AND nb.district_id IS NOT NULL AND n.district_id IS DISTINCT FROM nb.district_id THEN 'NEIGHBORHOOD_DISTRICT_MISMATCH' END,
      CASE WHEN nb.id IS NOT NULL AND nb.ward_id IS NOT NULL AND n.ward_id IS DISTINCT FROM nb.ward_id THEN 'NEIGHBORHOOD_WARD_MISMATCH' END
    ], NULL) AS issue_codes
  FROM public.news n
  LEFT JOIN public.districts d ON d.id = n.district_id
  LEFT JOIN public.wards w ON w.id = n.ward_id
  LEFT JOIN public.neighborhoods nb ON nb.id = n.neighborhood_id
  WHERE n.is_published = true
),
internal_metrics AS (
  SELECT
    n.id,
    n.slug,
    coalesce((SELECT count(*) FROM regexp_matches(coalesce(n.content, ''), 'href=["'']\/[^"'']+["'']', 'gi')), 0)::integer AS relative_href_count,
    coalesce((SELECT count(*) FROM regexp_matches(coalesce(n.content, ''), 'href=["'']https?://chonhaviet\.com\/[^"'']+["'']', 'gi')), 0)::integer AS absolute_same_site_href_count,
    greatest(
      coalesce((SELECT count(*) FROM regexp_matches(coalesce(n.content, ''), 'href=["'']https?://[^"'']+["'']', 'gi')), 0)
      - coalesce((SELECT count(*) FROM regexp_matches(coalesce(n.content, ''), 'href=["'']https?://chonhaviet\.com\/[^"'']+["'']', 'gi')), 0),
      0
    )::integer AS external_href_count,
    coalesce((SELECT count(*) FROM regexp_matches(coalesce(n.content, ''), 'href=["'']\/[^"'']*[?#][^"'']*["'']', 'gi')), 0)::integer AS relative_query_or_hash_count
  FROM published n
),
valid_published_news AS (
  SELECT
    n.id,
    n.slug,
    'news:' || n.id::text AS source_key,
    'https://chonhaviet.com/tin-tuc/' || btrim(n.slug) AS expected_canonical_url
  FROM published n
  WHERE btrim(coalesce(n.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
),
registry AS (
  SELECT source_key, canonical_url, canonical_path, eligible, reason_code
  FROM public.search_visibility_urls
  WHERE entity_type = 'news'
),
registry_joined AS (
  SELECT
    e.id,
    e.slug,
    e.source_key,
    e.expected_canonical_url,
    r.canonical_url,
    r.canonical_path,
    r.eligible,
    r.reason_code,
    CASE
      WHEN r.source_key IS NULL THEN 'MISSING_REGISTRY_ROW'
      WHEN r.canonical_url IS DISTINCT FROM e.expected_canonical_url THEN 'CANONICAL_URL_MISMATCH'
      WHEN r.canonical_path IS DISTINCT FROM replace(e.expected_canonical_url, 'https://chonhaviet.com', '') THEN 'CANONICAL_PATH_MISMATCH'
      WHEN r.eligible IS DISTINCT FROM true THEN 'PUBLISHED_NEWS_NOT_ELIGIBLE'
      ELSE NULL
    END AS issue_code
  FROM valid_published_news e
  LEFT JOIN registry r ON r.source_key = e.source_key
),
duplicate_canonicals AS (
  SELECT
    canonical_url,
    count(*)::integer AS row_count,
    array_agg(source_key ORDER BY source_key) AS source_keys
  FROM public.search_visibility_urls
  WHERE canonical_url IS NOT NULL
  GROUP BY canonical_url
  HAVING count(*) > 1
),
runs AS (
  SELECT
    run_type,
    status,
    count(*)::integer AS run_count,
    max(started_at) AS latest_started_at,
    max(finished_at) AS latest_finished_at
  FROM public.search_visibility_runs
  GROUP BY run_type, status
)
SELECT jsonb_build_object(
  'news_source', jsonb_build_object(
    'published_news', (SELECT count(*)::integer FROM published),
    'slug_stats', (SELECT to_jsonb(s) FROM slug_stats s),
    'duplicate_slug_groups', (SELECT duplicate_slug_groups FROM duplicate_slugs),
    'malformed_slug_sample', coalesce((
      SELECT jsonb_agg(row_to_json(m) ORDER BY m.slug NULLS LAST, m.id)
      FROM (
        SELECT id, slug
        FROM published
        WHERE nullif(btrim(slug), '') IS NOT NULL
          AND btrim(slug) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        ORDER BY slug NULLS LAST, id
        LIMIT 20
      ) m
    ), '[]'::jsonb),
    'structured_location', (SELECT to_jsonb(l) FROM location_counts l),
    'location_issue_rows', (SELECT count(*)::integer FROM location_issues WHERE cardinality(issue_codes) > 0),
    'location_issue_sample', coalesce((
      SELECT jsonb_agg(row_to_json(i) ORDER BY i.slug NULLS LAST, i.id)
      FROM (
        SELECT id, slug, issue_codes
        FROM location_issues
        WHERE cardinality(issue_codes) > 0
        ORDER BY slug NULLS LAST, id
        LIMIT 20
      ) i
    ), '[]'::jsonb)
  ),
  'internal_links', jsonb_build_object(
    'published_count', (SELECT count(*)::integer FROM internal_metrics),
    'relative_links_lt_2', (SELECT count(*)::integer FROM internal_metrics WHERE relative_href_count < 2),
    'absolute_same_site_links_only_risk', (SELECT count(*)::integer FROM internal_metrics WHERE relative_href_count < 2 AND absolute_same_site_href_count >= 2),
    'external_links_present', (SELECT count(*)::integer FROM internal_metrics WHERE external_href_count > 0),
    'relative_query_or_hash_present', (SELECT count(*)::integer FROM internal_metrics WHERE relative_query_or_hash_count > 0),
    'sample', coalesce((
      SELECT jsonb_agg(row_to_json(i) ORDER BY i.relative_href_count, i.slug NULLS LAST)
      FROM (
        SELECT id, slug, relative_href_count, absolute_same_site_href_count, external_href_count, relative_query_or_hash_count
        FROM internal_metrics
        WHERE relative_href_count < 2
        ORDER BY relative_href_count, slug NULLS LAST
        LIMIT 20
      ) i
    ), '[]'::jsonb),
    'external_link_sample', coalesce((
      SELECT jsonb_agg(row_to_json(i) ORDER BY i.slug NULLS LAST)
      FROM (
        SELECT id, slug, relative_href_count, absolute_same_site_href_count, external_href_count, relative_query_or_hash_count
        FROM internal_metrics
        WHERE external_href_count > 0
        ORDER BY slug NULLS LAST
        LIMIT 20
      ) i
    ), '[]'::jsonb)
  ),
  'news_registry', jsonb_build_object(
    'valid_published_news', (SELECT count(*)::integer FROM valid_published_news),
    'missing_registry_row', (SELECT count(*)::integer FROM registry_joined WHERE issue_code = 'MISSING_REGISTRY_ROW'),
    'canonical_url_mismatch', (SELECT count(*)::integer FROM registry_joined WHERE issue_code = 'CANONICAL_URL_MISMATCH'),
    'canonical_path_mismatch', (SELECT count(*)::integer FROM registry_joined WHERE issue_code = 'CANONICAL_PATH_MISMATCH'),
    'published_not_eligible', (SELECT count(*)::integer FROM registry_joined WHERE issue_code = 'PUBLISHED_NEWS_NOT_ELIGIBLE'),
    'issue_sample', coalesce((
      SELECT jsonb_agg(row_to_json(i) ORDER BY i.issue_code, i.slug)
      FROM (
        SELECT id, slug, source_key, expected_canonical_url, canonical_url, canonical_path, eligible, reason_code, issue_code
        FROM registry_joined
        WHERE issue_code IS NOT NULL
        ORDER BY issue_code, slug
        LIMIT 20
      ) i
    ), '[]'::jsonb)
  ),
  'duplicate_canonical_urls', coalesce((
    SELECT jsonb_agg(row_to_json(d) ORDER BY d.row_count DESC, d.canonical_url)
    FROM (
      SELECT canonical_url, row_count, source_keys
      FROM duplicate_canonicals
      ORDER BY row_count DESC, canonical_url
      LIMIT 20
    ) d
  ), '[]'::jsonb),
  'audit_runs', coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.run_type, r.status)
    FROM runs r
  ), '[]'::jsonb)
) AS horizon4_seo_content_consistency_summary;

ROLLBACK;
