-- =============================================================================
-- P8 preflight: SEO / GEO / AIO production read-only audit
--
-- Run this in the production Supabase SQL Editor. It never writes, schedules,
-- refreshes, or changes schema. Share the result sets (aggregate counts only are
-- sufficient) before any P8 indexing, canonical, or entity-page decision.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- 1) Public property URL/sitemap readiness. A row missing a canonical component
-- falls back to the legacy route; this measures the migration/crawl surface rather
-- than assuming every active row has the new canonical URL shape.
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
FROM public.properties;

-- 2) Area slug linkage needed by buildProductPath. This reports only count-level
-- readiness; it deliberately does not mutate missing links/slugs.
SELECT
  count(*) FILTER (WHERE p.is_active) AS active_properties,
  count(*) FILTER (WHERE p.is_active AND a.id IS NOT NULL AND nullif(btrim(coalesce(a.slug, '')), '') IS NOT NULL) AS active_with_area_slug,
  count(*) FILTER (WHERE p.is_active AND (a.id IS NULL OR nullif(btrim(coalesce(a.slug, '')), '') IS NULL)) AS active_missing_area_slug_link
FROM public.properties p
LEFT JOIN public.areas a ON a.id = p.area_id;

-- 3) Area SEO gate as implemented: unique description plus >=5 active listings
-- and either two districts, two property types, or the listing threshold.
WITH area_signals AS (
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
)
SELECT
  count(*) AS areas_total,
  count(*) FILTER (
    WHERE nullif(btrim(coalesce(slug, '')), '') IS NOT NULL
      AND nullif(btrim(coalesce(name, '')), '') IS NOT NULL
      AND nullif(btrim(coalesce(description, '')), '') IS NOT NULL
      AND active_listing_count >= 5
      AND (distinct_district_count >= 2 OR distinct_property_type_count >= 2 OR active_listing_count >= 5)
  ) AS areas_indexable_by_database_description,
  count(*) FILTER (WHERE active_listing_count >= 5 AND nullif(btrim(coalesce(description, '')), '') IS NULL) AS areas_needing_unique_description,
  count(*) FILTER (WHERE active_listing_count BETWEEN 1 AND 4) AS areas_below_listing_threshold,
  count(*) FILTER (WHERE active_listing_count = 0) AS areas_without_active_listings
FROM area_signals;

-- 4) Neighborhood SEO gate: unique description plus >=3 active listings.
WITH neighborhood_signals AS (
  SELECT
    n.id,
    n.name,
    n.slug,
    n.description,
    count(p.id) FILTER (WHERE p.is_active) AS active_listing_count,
    count(DISTINCT p.property_type_id) FILTER (WHERE p.is_active AND p.property_type_id IS NOT NULL) AS distinct_property_type_count
  FROM public.neighborhoods n
  LEFT JOIN public.properties p ON p.neighborhood_slug = n.slug
  GROUP BY n.id, n.name, n.slug, n.description
)
SELECT
  count(*) AS neighborhoods_total,
  count(*) FILTER (
    WHERE nullif(btrim(coalesce(slug, '')), '') IS NOT NULL
      AND nullif(btrim(coalesce(name, '')), '') IS NOT NULL
      AND nullif(btrim(coalesce(description, '')), '') IS NOT NULL
      AND active_listing_count >= 3
  ) AS neighborhoods_indexable,
  count(*) FILTER (WHERE active_listing_count >= 3 AND nullif(btrim(coalesce(description, '')), '') IS NULL) AS neighborhoods_needing_unique_description,
  count(*) FILTER (WHERE active_listing_count BETWEEN 1 AND 2) AS neighborhoods_below_listing_threshold,
  count(*) FILTER (WHERE active_listing_count = 0) AS neighborhoods_without_active_listings
FROM neighborhood_signals;

-- 5) Content/citation readiness. This does not claim that citations are valid URLs;
-- it measures whether published content has the fields P8 can validate next.
SELECT
  count(*) FILTER (WHERE is_published) AS published_articles,
  count(*) FILTER (WHERE is_published AND nullif(btrim(coalesce(slug, '')), '') IS NULL) AS published_articles_missing_slug,
  count(*) FILTER (WHERE is_published AND nullif(btrim(coalesce(meta_title, '')), '') IS NULL) AS published_articles_missing_meta_title,
  count(*) FILTER (WHERE is_published AND nullif(btrim(coalesce(meta_description, '')), '') IS NULL) AS published_articles_missing_meta_description,
  count(*) FILTER (WHERE is_published AND (citations IS NULL OR jsonb_array_length(citations) = 0)) AS published_articles_without_citations,
  count(*) FILTER (WHERE is_published AND (faq IS NULL OR jsonb_array_length(faq) = 0)) AS published_articles_without_faq
FROM public.news;

-- 6) Price-stat availability. Counts only real stored aggregates and distinct scopes;
-- it does not infer a market claim from a low sample or stale record.
SELECT
  scope,
  listing_type,
  count(*) AS statistic_rows,
  count(*) FILTER (WHERE sample_count >= 3) AS rows_meeting_sample_floor,
  count(*) FILTER (WHERE computed_at < now() - interval '90 days') AS rows_older_than_90_days,
  max(computed_at) AS newest_computed_at
FROM public.price_stats
GROUP BY scope, listing_type
ORDER BY scope, listing_type;

-- 7) Sitemap source caps and last-modified quality. Current source implementation
-- deliberately limits each dynamic query to 5,000 rows; alert on approaching this
-- cap before assuming complete sitemap coverage.
SELECT
  (SELECT count(*) FROM public.properties WHERE is_active) AS active_properties_source_rows,
  (SELECT count(*) FROM public.areas) AS area_source_rows,
  (SELECT count(*) FROM public.neighborhoods) AS neighborhood_source_rows,
  (SELECT count(*) FROM public.news WHERE is_published) AS published_news_source_rows,
  (SELECT count(*) FROM public.managed_pages WHERE is_active AND is_system = false) AS public_page_source_rows;

ROLLBACK;
