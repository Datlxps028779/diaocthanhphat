-- =============================================================================
-- News slug format audit, read-only
--
-- Measures every News row before the format constraint is validated. It does not
-- repair rows, update publication state, alter constraints, call Google, call
-- AI, read RAG, claim freshness jobs, or invoke a worker.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH rows AS (
  SELECT
    n.id,
    n.title,
    n.slug,
    n.is_published,
    n.updated_at,
    CASE
      WHEN n.slug IS NULL OR btrim(n.slug) = '' THEN 'missing'
      WHEN btrim(n.slug) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' THEN 'valid'
      ELSE 'malformed'
    END AS slug_status,
    n.is_published IS TRUE
      AND btrim(coalesce(n.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AS published_slug_contract_ok
  FROM public.news AS n
), summary AS (
  SELECT
    count(*)::integer AS total_rows,
    count(*) FILTER (WHERE slug_status = 'valid')::integer AS valid_rows,
    count(*) FILTER (WHERE slug_status = 'missing')::integer AS missing_rows,
    count(*) FILTER (WHERE slug_status = 'malformed')::integer AS malformed_rows,
    count(*) FILTER (WHERE is_published IS TRUE AND NOT published_slug_contract_ok)::integer AS invalid_published_rows,
    count(*) FILTER (WHERE is_published IS NOT TRUE AND slug_status = 'malformed')::integer AS malformed_non_published_rows,
    count(*) FILTER (WHERE NOT published_slug_contract_ok AND is_published IS TRUE)::integer AS constraint_blocking_published_rows
  FROM rows
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'scope', 'Đo toàn bộ News slug trước khi validate constraint format; chỉ đọc.',
  'summary', (SELECT to_jsonb(summary) FROM summary),
  'malformed_rows', coalesce((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title,
        'slug', slug,
        'is_published', is_published,
        'updated_at', updated_at,
        'slug_status', slug_status,
        'published_slug_contract_ok', published_slug_contract_ok
      ) ORDER BY is_published DESC, updated_at DESC NULLS LAST, id
    )
    FROM rows
    WHERE slug_status = 'malformed'
  ), '[]'::jsonb),
  'does_not_mutate', true,
  'does_not_prove', 'Không chứng minh Google đã crawl/index URL và không liên quan đến AI/RAG.'
) AS news_slug_format_audit;

ROLLBACK;
