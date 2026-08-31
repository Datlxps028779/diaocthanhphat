-- P8 read-only preflight: inspect citation readiness without changing public.news.
-- This query does not call or grant access to the publication trigger helper.

WITH expanded AS (
  SELECT
    n.id,
    n.is_published,
    jsonb_typeof(n.citations) AS citations_type,
    entry.item,
    nullif(btrim(entry.item ->> 'title'), '') AS title,
    nullif(btrim(entry.item ->> 'url'), '') AS url
  FROM public.news AS n
  LEFT JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN jsonb_typeof(n.citations) = 'array' THEN n.citations
      ELSE '[]'::jsonb
    END
  ) AS entry(item) ON true
), article_stats AS (
  SELECT
    id,
    is_published,
    max(citations_type) AS citations_type,
    count(item) AS item_count,
    count(*) FILTER (
      WHERE jsonb_typeof(item) = 'object'
        AND title IS NOT NULL
        AND url ~* '^https?://[^[:space:]]+$'
        AND split_part(split_part(split_part(substring(url from 9), '/', 1), '?', 1), '#', 1) <> ''
    ) AS valid_count,
    count(DISTINCT lower(url)) FILTER (
      WHERE jsonb_typeof(item) = 'object'
        AND title IS NOT NULL
        AND url ~* '^https?://[^[:space:]]+$'
        AND split_part(split_part(split_part(substring(url from 9), '/', 1), '?', 1), '#', 1) <> ''
    ) AS distinct_valid_count
  FROM expanded
  GROUP BY id, is_published
), evaluated AS (
  SELECT
    *,
    citations_type = 'array'
      AND item_count >= 2
      AND valid_count = item_count
      AND valid_count = distinct_valid_count AS citation_floor_met
  FROM article_stats
)
SELECT
  CASE WHEN is_published THEN 'legacy_public_rows_not_revalidated' ELSE 'draft_transition_candidates' END AS scope,
  count(*) AS article_count,
  count(*) FILTER (WHERE citation_floor_met) AS would_pass_new_publication_guard,
  count(*) FILTER (WHERE NOT citation_floor_met) AS would_fail_new_publication_guard
FROM evaluated
GROUP BY is_published
ORDER BY is_published DESC;

-- Optional compact totals for reviewers who only need the current legacy/draft split.
WITH evaluated AS (
  SELECT
    n.is_published,
    jsonb_typeof(n.citations) = 'array'
      AND stats.item_count >= 2
      AND stats.valid_count = stats.item_count
      AND stats.valid_count = stats.distinct_valid_count AS citation_floor_met
  FROM public.news AS n
  LEFT JOIN LATERAL (
    SELECT
      count(entry.item) AS item_count,
      count(*) FILTER (
        WHERE jsonb_typeof(entry.item) = 'object'
          AND nullif(btrim(entry.item ->> 'title'), '') IS NOT NULL
          AND nullif(btrim(entry.item ->> 'url'), '') ~* '^https?://[^[:space:]]+$'
          AND split_part(split_part(split_part(substring(nullif(btrim(entry.item ->> 'url'), '') from 9), '/', 1), '?', 1), '#', 1) <> ''
      ) AS valid_count,
      count(DISTINCT lower(nullif(btrim(entry.item ->> 'url'), ''))) FILTER (
        WHERE jsonb_typeof(entry.item) = 'object'
          AND nullif(btrim(entry.item ->> 'title'), '') IS NOT NULL
          AND nullif(btrim(entry.item ->> 'url'), '') ~* '^https?://[^[:space:]]+$'
          AND split_part(split_part(split_part(substring(nullif(btrim(entry.item ->> 'url'), '') from 9), '/', 1), '?', 1), '#', 1) <> ''
      ) AS distinct_valid_count
    FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(n.citations) = 'array' THEN n.citations ELSE '[]'::jsonb END
    ) AS entry(item)
  ) AS stats ON true
)
SELECT
  count(*) FILTER (WHERE is_published) AS published_legacy_count,
  count(*) FILTER (WHERE NOT is_published) AS draft_count,
  count(*) FILTER (WHERE NOT is_published AND citation_floor_met) AS drafts_ready_if_published,
  count(*) FILTER (WHERE NOT is_published AND NOT citation_floor_met) AS drafts_needing_editorial_sources
FROM evaluated;
