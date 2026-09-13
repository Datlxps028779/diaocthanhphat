-- =============================================================================
-- Search Visibility — news slug correction dry-run, read-only
--
-- This query prepares (but does not apply) a correction for the published news
-- row whose slug ends with a trailing hyphen. It checks the proposed slug and
-- possible uniqueness conflicts before any source mutation is considered.
--
-- It does not update public.news, update the registry, sync eligibility, submit
-- a sitemap, inspect URLs, call Google, call AI, read RAG, claim freshness jobs,
-- or invoke a worker.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH target AS (
  SELECT 'f551d52c-3927-4d02-83a0-8cdb5996d365'::uuid AS news_id
), source AS (
  SELECT
    n.id,
    n.title,
    n.slug AS current_slug,
    n.is_published,
    n.published_at,
    n.category,
    n.updated_at
  FROM public.news AS n
  JOIN target AS t ON t.news_id = n.id
), proposal AS (
  SELECT
    s.*,
    regexp_replace(btrim(coalesce(s.current_slug, '')), '-+$', '') AS proposed_slug
  FROM source AS s
), conflicts AS (
  SELECT
    p.proposed_slug,
    count(n.id)::integer AS conflict_count,
    coalesce(jsonb_agg(jsonb_build_object(
      'id', n.id,
      'title', n.title,
      'slug', n.slug,
      'is_published', n.is_published
    ) ORDER BY n.id) FILTER (WHERE n.id IS NOT NULL), '[]'::jsonb) AS conflicting_rows
  FROM proposal AS p
  LEFT JOIN public.news AS n
    ON n.slug = p.proposed_slug
   AND n.id <> p.id
  GROUP BY p.proposed_slug
), registry AS (
  SELECT
    sv.id,
    sv.source_key,
    sv.entity_id,
    sv.eligible,
    sv.reason_code,
    sv.reason_detail,
    sv.canonical_url,
    sv.canonical_path,
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
  'scope', 'Dry-run đề xuất bỏ dấu gạch ngang cuối slug của published news row; không sửa dữ liệu.',
  'source', coalesce((
    SELECT to_jsonb(source)
    FROM source
  ), '{}'::jsonb),
  'proposal', coalesce((
    SELECT jsonb_build_object(
      'current_slug', current_slug,
      'proposed_slug', proposed_slug,
      'proposed_slug_matches_public_contract', proposed_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$',
      'slug_would_change', current_slug IS DISTINCT FROM proposed_slug,
      'unique_conflict_count', conflict_count,
      'unique_conflict_rows', conflicting_rows,
      'safe_to_consider_source_update', is_published
        AND proposed_slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        AND current_slug IS DISTINCT FROM proposed_slug
        AND conflict_count = 0
    )
    FROM proposal
    JOIN conflicts USING (proposed_slug)
  ), '{}'::jsonb),
  'registry_rows', coalesce((
    SELECT jsonb_agg(to_jsonb(registry) ORDER BY updated_at DESC NULLS LAST)
    FROM registry
  ), '[]'::jsonb),
  'secondary_observation', coalesce((
    SELECT CASE
      WHEN published_at IS NULL THEN 'published_at đang NULL; đây là metadata cần xem xét riêng, không phải nguyên nhân MISSING_REQUIRED_SOURCE.'
      ELSE 'published_at đã có giá trị.'
    END
    FROM source
  ), 'Không có source row để đánh giá.'),
  'next_action', 'Chỉ khi người dùng phê duyệt mới lập migration/source update riêng; sau đó cần revalidate URL cũ/mới và chạy lại các verification SQL.',
  'does_not_mutate', true,
  'does_not_prove', 'Không chứng minh Google đã crawl/index URL và không liên quan đến AI/RAG.'
) AS search_visibility_news_slug_fix_dry_run;

ROLLBACK;
