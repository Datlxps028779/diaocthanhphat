-- =============================================================================
-- P8 preflight summary: SEO / GEO / AIO production read-only audit
--
-- Supabase SQL Editor commonly displays only the final result set for a script
-- with multiple SELECT statements. This compact version returns every P8 metric
-- in ONE row as JSON, without writing data or changing schema.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH
property_readiness AS (
  SELECT
    count(*) FILTER (WHERE is_active) AS active_properties,
    count(*) FILTER (
      WHERE is_active
        AND public_code IS NOT NULL
        AND nullif(btrim(coalesce(slug, '')), '') IS NOT NULL
        AND listing_type IN ('mua_ban', 'cho_thue')
        AND area_id IS NOT NULL
    ) AS canonical_path_ready_before_area_join,
    count(*) FILTER (
      WHERE is_active
        AND (
          public_code IS NULL
          OR nullif(btrim(coalesce(slug, '')), '') IS NULL
          OR listing_type NOT IN ('mua_ban', 'cho_thue')
          OR area_id IS NULL
        )
    ) AS legacy_path_fallback_candidates,
    count(*) FILTER (WHERE is_active AND updated_at IS NULL) AS active_without_last_modified
  FROM public.properties
),
area_link_readiness AS (
  SELECT
    count(*) FILTER (WHERE p.is_active) AS active_properties,
    count(*) FILTER (
      WHERE p.is_active
        AND a.id IS NOT NULL
        AND nullif(btrim(coalesce(a.slug, '')), '') IS NOT NULL
    ) AS active_with_area_slug,
    count(*) FILTER (
      WHERE p.is_active
        AND (a.id IS NULL OR nullif(btrim(coalesce(a.slug, '')), '') IS NULL)
    ) AS active_missing_area_slug_link
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
area_gate AS (
  SELECT
    count(*) AS areas_total,
    count(*) FILTER (
      WHERE nullif(btrim(coalesce(slug, '')), '') IS NOT NULL
        AND nullif(btrim(coalesce(name, '')), '') IS NOT NULL
        AND nullif(btrim(coalesce(description, '')), '') IS NOT NULL
        AND active_listing_count >= 5
        AND (distinct_district_count >= 2 OR distinct_property_type_count >= 2 OR active_listing_count >= 5)
    ) AS areas_indexable_by_database_description,
    count(*) FILTER (
      WHERE active_listing_count >= 5
        AND nullif(btrim(coalesce(description, '')), '') IS NULL
    ) AS areas_needing_unique_description,
    count(*) FILTER (WHERE active_listing_count BETWEEN 1 AND 4) AS areas_below_listing_threshold,
    count(*) FILTER (WHERE active_listing_count = 0) AS areas_without_active_listings
  FROM area_signals
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
),
neighborhood_gate AS (
  SELECT
    count(*) AS neighborhoods_total,
    count(*) FILTER (
      WHERE nullif(btrim(coalesce(slug, '')), '') IS NOT NULL
        AND nullif(btrim(coalesce(name, '')), '') IS NOT NULL
        AND nullif(btrim(coalesce(description, '')), '') IS NOT NULL
        AND active_listing_count >= 3
    ) AS neighborhoods_indexable,
    count(*) FILTER (
      WHERE active_listing_count >= 3
        AND nullif(btrim(coalesce(description, '')), '') IS NULL
    ) AS neighborhoods_needing_unique_description,
    count(*) FILTER (WHERE active_listing_count BETWEEN 1 AND 2) AS neighborhoods_below_listing_threshold,
    count(*) FILTER (WHERE active_listing_count = 0) AS neighborhoods_without_active_listings
  FROM neighborhood_signals
),
content_readiness AS (
  SELECT
    count(*) FILTER (WHERE is_published) AS published_articles,
    count(*) FILTER (WHERE is_published AND nullif(btrim(coalesce(slug, '')), '') IS NULL) AS published_articles_missing_slug,
    count(*) FILTER (WHERE is_published AND nullif(btrim(coalesce(meta_title, '')), '') IS NULL) AS published_articles_missing_meta_title,
    count(*) FILTER (WHERE is_published AND nullif(btrim(coalesce(meta_description, '')), '') IS NULL) AS published_articles_missing_meta_description,
    count(*) FILTER (WHERE is_published AND (citations IS NULL OR jsonb_array_length(citations) = 0)) AS published_articles_without_citations,
    count(*) FILTER (WHERE is_published AND (faq IS NULL OR jsonb_array_length(faq) = 0)) AS published_articles_without_faq
  FROM public.news
),
price_readiness AS (
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'scope', scope,
      'listing_type', listing_type,
      'statistic_rows', statistic_rows,
      'rows_meeting_sample_floor', rows_meeting_sample_floor,
      'rows_older_than_90_days', rows_older_than_90_days,
      'newest_computed_at', newest_computed_at
    )
    ORDER BY scope, listing_type
  ), '[]'::jsonb) AS rows
  FROM (
    SELECT
      scope,
      listing_type,
      count(*) AS statistic_rows,
      count(*) FILTER (WHERE sample_count >= 3) AS rows_meeting_sample_floor,
      count(*) FILTER (WHERE computed_at < now() - interval '90 days') AS rows_older_than_90_days,
      max(computed_at) AS newest_computed_at
    FROM public.price_stats
    GROUP BY scope, listing_type
  ) stats
),
sitemap_source_sizes AS (
  SELECT
    (SELECT count(*) FROM public.properties WHERE is_active) AS active_properties_source_rows,
    (SELECT count(*) FROM public.areas) AS area_source_rows,
    (SELECT count(*) FROM public.neighborhoods) AS neighborhood_source_rows,
    (SELECT count(*) FROM public.news WHERE is_published) AS published_news_source_rows,
    (SELECT count(*) FROM public.managed_pages WHERE is_active AND is_system = false) AS public_page_source_rows
)
SELECT jsonb_build_object(
  'property_canonical_readiness', (SELECT to_jsonb(property_readiness) FROM property_readiness),
  'area_slug_link_readiness', (SELECT to_jsonb(area_link_readiness) FROM area_link_readiness),
  'area_indexation_gate', (SELECT to_jsonb(area_gate) FROM area_gate),
  'neighborhood_indexation_gate', (SELECT to_jsonb(neighborhood_gate) FROM neighborhood_gate),
  'published_content_readiness', (SELECT to_jsonb(content_readiness) FROM content_readiness),
  'price_stats_readiness', (SELECT rows FROM price_readiness),
  'sitemap_source_sizes', (SELECT to_jsonb(sitemap_source_sizes) FROM sitemap_source_sizes)
) AS p8_readiness_summary;

ROLLBACK;
