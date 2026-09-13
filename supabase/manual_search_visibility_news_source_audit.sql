-- =============================================================================
-- Search Visibility — published news source audit, read-only
--
-- This query investigates the one published news row excluded with
-- MISSING_REQUIRED_SOURCE. It only reads public.news and the corresponding
-- search_visibility_urls row. It does not update the article, sync the
-- registry, call Google, call AI, read RAG, claim freshness jobs, or invoke a
-- worker.
--
-- Run after manual_search_visibility_excluded_rows_audit.sql.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH target AS (
  SELECT 'f551d52c-3927-4d02-83a0-8cdb5996d365'::uuid AS news_id
), source AS (
  SELECT
    n.id,
    n.title,
    n.slug,
    n.is_published,
    n.category,
    n.published_at,
    n.content_version,
    n.created_at,
    n.updated_at,
    char_length(coalesce(n.content, ''))::integer AS content_length,
    char_length(coalesce(n.excerpt, ''))::integer AS excerpt_length
  FROM public.news AS n
  JOIN target AS t ON t.news_id = n.id
), slug_check AS (
  SELECT
    s.id,
    s.slug,
    btrim(coalesce(s.slug, '')) AS trimmed_slug,
    s.slug IS NOT NULL AS is_not_null,
    nullif(btrim(coalesce(s.slug, '')), '') IS NOT NULL AS is_non_empty,
    btrim(coalesce(s.slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AS matches_public_slug_contract,
    s.slug IS DISTINCT FROM btrim(coalesce(s.slug, '')) AS has_outer_whitespace,
    s.slug ~ '[^a-z0-9-]' AS contains_non_lowercase_ascii_slug_char,
    s.slug ~ '(^-|-$)' AS has_leading_or_trailing_hyphen,
    s.slug ~ '--' AS has_consecutive_hyphens
  FROM source AS s
), registry AS (
  SELECT
    sv.id,
    sv.source_key,
    sv.entity_type,
    sv.entity_id,
    sv.canonical_url,
    sv.canonical_path,
    sv.eligible,
    sv.reason_code,
    sv.reason_detail,
    sv.sitemap_status,
    sv.inspection_status,
    sv.evaluated_at,
    sv.updated_at
  FROM public.search_visibility_urls AS sv
  JOIN target AS t ON sv.entity_id = t.news_id::text
  WHERE sv.entity_type = 'news'
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'scope', 'Đối chiếu source public.news với registry cho published news row bị loại.',
  'source_exists', EXISTS (SELECT 1 FROM source),
  'source', coalesce((
    SELECT to_jsonb(source)
    FROM source
  ), '{}'::jsonb),
  'slug_check', coalesce((
    SELECT to_jsonb(slug_check)
    FROM slug_check
  ), '{}'::jsonb),
  'registry_rows', coalesce((
    SELECT jsonb_agg(to_jsonb(registry) ORDER BY updated_at DESC NULLS LAST)
    FROM registry
  ), '[]'::jsonb),
  'diagnosis', CASE
    WHEN NOT EXISTS (SELECT 1 FROM source)
      THEN 'Không tìm thấy news source row với entity_id; cần kiểm tra lại ID hoặc dữ liệu production.'
    WHEN EXISTS (
      SELECT 1 FROM source
      WHERE is_published
        AND btrim(coalesce(slug, '')) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
      THEN 'Slug source đạt contract; cần đối chiếu thời điểm sync hoặc registry row.'
    WHEN EXISTS (SELECT 1 FROM source WHERE NOT is_published)
      THEN 'Source hiện không còn published; registry exclusion có thể đã thay đổi sau lần sync.'
    ELSE 'Source published nhưng slug không đạt contract public; chưa được phép tự sửa, cần lập phương án source fix riêng.'
  END,
  'does_not_mutate', true,
  'does_not_prove', 'Không chứng minh Google đã crawl/index URL và không liên quan đến AI/RAG.'
) AS search_visibility_news_source_audit;

ROLLBACK;
