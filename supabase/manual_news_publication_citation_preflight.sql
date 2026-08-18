BEGIN TRANSACTION READ ONLY;

WITH citation_rows AS (
  SELECT
    n.id,
    n.slug,
    n.title,
    n.is_published,
    n.created_at,
    n.updated_at,
    n.views,
    n.citations,
    n.faq,
    CASE
      WHEN jsonb_typeof(n.citations) = 'array' THEN n.citations
      ELSE '[]'::jsonb
    END AS citation_array
  FROM public.news n
), citation_quality AS (
  SELECT
    row.*,
    COALESCE((
      SELECT count(*)
      FROM jsonb_array_elements(row.citation_array) AS entry(item)
      WHERE jsonb_typeof(item) = 'object'
        AND nullif(btrim(item ->> 'title'), '') IS NOT NULL
        AND nullif(btrim(item ->> 'url'), '') ~* '^https?://[^[:space:]/]+(?:/[^[:space:]]*)?$'
    ), 0) AS valid_citation_count,
    COALESCE((
      SELECT count(DISTINCT lower(nullif(btrim(item ->> 'url'), '')))
      FROM jsonb_array_elements(row.citation_array) AS entry(item)
      WHERE jsonb_typeof(item) = 'object'
        AND nullif(btrim(item ->> 'title'), '') IS NOT NULL
        AND nullif(btrim(item ->> 'url'), '') ~* '^https?://[^[:space:]/]+(?:/[^[:space:]]*)?$'
    ), 0) AS unique_citation_url_count,
    CASE
      WHEN jsonb_typeof(row.faq) = 'array' THEN jsonb_array_length(row.faq)
      ELSE 0
    END AS faq_count
  FROM citation_rows row
), classified AS (
  SELECT *,
    valid_citation_count >= 2 AND valid_citation_count = unique_citation_url_count AS would_pass_publication_citation_gate
  FROM citation_quality
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'published_summary', jsonb_build_object(
    'total', count(*) FILTER (WHERE is_published),
    'citation_gate_pass', count(*) FILTER (WHERE is_published AND would_pass_publication_citation_gate),
    'citation_gate_fail_legacy', count(*) FILTER (WHERE is_published AND NOT would_pass_publication_citation_gate),
    'without_faq', count(*) FILTER (WHERE is_published AND faq_count = 0)
  ),
  'draft_publication_readiness', jsonb_build_object(
    'total', count(*) FILTER (WHERE NOT is_published),
    'would_pass_if_published', count(*) FILTER (WHERE NOT is_published AND would_pass_publication_citation_gate),
    'would_be_blocked_if_published', count(*) FILTER (WHERE NOT is_published AND NOT would_pass_publication_citation_gate)
  ),
  'published_source_review_queue', COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'slug', slug,
      'title', title,
      'views', views,
      'updated_at', updated_at,
      'valid_citation_count', valid_citation_count,
      'faq_count', faq_count
    )
    ORDER BY views DESC NULLS LAST, updated_at DESC NULLS LAST
  ) FILTER (WHERE is_published AND NOT would_pass_publication_citation_gate), '[]'::jsonb)
) AS news_publication_citation_preflight
FROM classified;

ROLLBACK;
