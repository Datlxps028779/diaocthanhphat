-- =============================================================================
-- P2 lifecycle test-candidate preview — read-only
--
-- Finds production rows whose slug contains an explicit test/QA/demo/Codex marker,
-- so an owner can select a controlled record before any create/update/publish/
-- unpublish/delete measurement. This query does not mutate data, enqueue work,
-- revalidate paths, sync Search Visibility, or call Google.
--
-- If no marked candidate exists, do not mutate a real customer/listing record.
-- Create or nominate a dedicated test fixture only after explicit owner approval.
-- The fixture must be created through the Admin UI/application flow, not by a
-- direct SQL INSERT, so publicIndexing can emit the create freshness job.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- Deliberately inspect the slug only, with slug-token boundaries. This excludes
-- generic editorial words in titles such as "kiểm tra"/"kiem-tra" and makes a
-- fixture convention explicit: use a slug containing e.g. `codex-lifecycle`.
WITH marker AS (
  SELECT '(^|[-_])(test|qa|codex|demo|sandbox)([-_]|$)'::text AS slug_pattern
), property_candidates AS (
  SELECT
    p.id,
    p.public_code,
    p.title,
    p.slug,
    p.listing_type::text AS listing_type,
    p.is_active,
    p.updated_at
  FROM public.properties AS p
  CROSS JOIN marker
  WHERE lower(coalesce(p.slug, '')) ~ marker.slug_pattern
  ORDER BY p.updated_at DESC NULLS LAST, p.id
  LIMIT 25
), news_candidates AS (
  SELECT
    n.id,
    n.title,
    n.slug,
    n.is_published,
    n.updated_at
  FROM public.news AS n
  CROSS JOIN marker
  WHERE lower(coalesce(n.slug, '')) ~ marker.slug_pattern
  ORDER BY n.updated_at DESC NULLS LAST, n.id
  LIMIT 25
), candidate_counts AS (
  SELECT
    (SELECT count(*)::integer FROM property_candidates) AS property_candidate_rows,
    (SELECT count(*)::integer FROM news_candidates) AS news_candidate_rows,
    (SELECT count(*)::integer FROM public.properties AS p
      CROSS JOIN marker
      WHERE lower(coalesce(p.slug, '')) ~ marker.slug_pattern) AS property_marker_matches,
    (SELECT count(*)::integer FROM public.news AS n
      CROSS JOIN marker
      WHERE lower(coalesce(n.slug, '')) ~ marker.slug_pattern) AS news_marker_matches
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'selection_policy', jsonb_build_object(
    'marker_field', 'slug',
    'marker', '(^|[-_])(test|qa|codex|demo|sandbox)([-_]|$)',
    'max_rows_per_source', 25,
    'safe_to_mutate', false,
    'note', 'A marker match is only a candidate; owner must still confirm it is disposable test data before mutation. Do not INSERT directly with SQL because that bypasses application propagation.'
  ),
  'candidate_counts', (SELECT to_jsonb(c) FROM candidate_counts AS c),
  'property_candidates', coalesce((
    SELECT jsonb_agg(to_jsonb(p) ORDER BY p.updated_at DESC NULLS LAST, p.id)
    FROM property_candidates AS p
  ), '[]'::jsonb),
  'news_candidates', coalesce((
    SELECT jsonb_agg(to_jsonb(n) ORDER BY n.updated_at DESC NULLS LAST, n.id)
    FROM news_candidates AS n
  ), '[]'::jsonb),
  'candidate_marker_found',
    (SELECT property_marker_matches + news_marker_matches > 0 FROM candidate_counts),
  'mutation_authorized', false,
  'next_step', 'Nếu không có candidate, owner tạo fixture qua Admin UI với slug chứa codex/test/sandbox; không INSERT trực tiếp bằng SQL vì sẽ bypass publicIndexing. Chỉ sau khi owner xác nhận fixture disposable mới đo bằng manual_p2_freshness_lifecycle_measurement.sql.'
) AS p2_lifecycle_test_candidate_preview;

ROLLBACK;
