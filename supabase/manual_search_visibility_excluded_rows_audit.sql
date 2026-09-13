-- =============================================================================
-- Search Visibility — excluded rows audit, read-only
--
-- Run after manual_search_visibility_p2_verify.sql when P2 is green. This query
-- only reads the registry and explains excluded candidates by entity/reason. It
-- does not sync the registry, mutate data, submit a sitemap, inspect URLs, call
-- Google, call AI, read RAG, claim freshness jobs, or invoke a worker.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH excluded AS (
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
    sv.content_updated_at,
    sv.source_version,
    sv.evaluated_at,
    sv.sitemap_status,
    sv.inspection_status,
    sv.updated_at
  FROM public.search_visibility_urls AS sv
  WHERE NOT sv.eligible
), by_reason AS (
  SELECT
    reason_code,
    count(*)::integer AS row_count,
    jsonb_agg(
      jsonb_build_object(
        'source_key', source_key,
        'entity_type', entity_type,
        'entity_id', entity_id,
        'reason_detail', reason_detail,
        'canonical_path', canonical_path,
        'sitemap_status', sitemap_status,
        'inspection_status', inspection_status,
        'content_updated_at', content_updated_at,
        'evaluated_at', evaluated_at,
        'updated_at', updated_at
      )
      ORDER BY entity_type, source_key
    ) AS rows
  FROM excluded
  GROUP BY reason_code
), by_entity AS (
  SELECT
    entity_type,
    sum(reason_count)::integer AS excluded_count,
    jsonb_object_agg(reason_code, reason_count ORDER BY reason_code) AS reasons
  FROM (
    SELECT entity_type, reason_code, count(*)::integer AS reason_count
    FROM excluded
    GROUP BY entity_type, reason_code
  ) AS grouped
  GROUP BY entity_type
), attention AS (
  SELECT
    count(*) FILTER (WHERE reason_code = 'UNSUPPORTED_ENTITY')::integer AS unsupported_entity_count,
    count(*) FILTER (WHERE reason_code = 'QUALITY_GATE_FAILED')::integer AS quality_gate_failed_count,
    count(*) FILTER (WHERE reason_code = 'MISSING_REQUIRED_SOURCE')::integer AS missing_required_source_count,
    count(*) FILTER (WHERE reason_code = 'INACTIVE_PROPERTY')::integer AS inactive_property_count,
    count(*) FILTER (WHERE reason_code = 'UNPUBLISHED_NEWS')::integer AS unpublished_news_count
  FROM excluded
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'scope', 'Các registry rows eligible=false; đây là audit giải thích, không phải lệnh sửa dữ liệu.',
  'summary', jsonb_build_object(
    'excluded_total', (SELECT count(*)::integer FROM excluded),
    'by_reason', coalesce((
      SELECT jsonb_object_agg(reason_code, row_count ORDER BY reason_code)
      FROM by_reason
    ), '{}'::jsonb),
    'by_entity', coalesce((
      SELECT jsonb_object_agg(entity_type, jsonb_build_object(
        'excluded_count', excluded_count,
        'reasons', reasons
      ) ORDER BY entity_type)
      FROM by_entity
    ), '{}'::jsonb),
    'attention_counts', (SELECT to_jsonb(attention) FROM attention)
  ),
  'excluded_rows_by_reason', coalesce((
    SELECT jsonb_object_agg(reason_code, rows ORDER BY reason_code)
    FROM by_reason
  ), '{}'::jsonb),
  'next_action', 'Chỉ xem xét sửa source hoặc policy sau khi đối chiếu từng reason_detail; không tự biến excluded row thành eligible.',
  'does_not_prove', 'Không chứng minh Google đã crawl/index URL và không liên quan đến AI/RAG.'
) AS search_visibility_excluded_rows_audit;

ROLLBACK;
