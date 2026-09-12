-- =============================================================================
-- Horizon 1 — Listing title normalization dry-run (read-only)
--
-- This report proposes only lossless whitespace cleanup. Full Vietnamese
-- sentence-case, protected-location and safe-typo normalization remains in
-- src/lib/listingTitle.ts at application write boundaries; SQL must not invent
-- a competing implementation before production evidence is reviewed.
--
-- Production must be run by the user after reviewing the SQL.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH source_rows AS (
  SELECT
    'user_listing'::text AS record_type,
    l.id AS record_id,
    l.property_id,
    l.status::text AS lifecycle_status,
    l.updated_at,
    l.title AS current_title
  FROM public.user_listings AS l

  UNION ALL

  SELECT
    'property'::text AS record_type,
    p.id AS record_id,
    NULL::uuid AS property_id,
    CASE WHEN p.is_active IS TRUE THEN 'active' ELSE 'inactive' END AS lifecycle_status,
    p.updated_at,
    p.title AS current_title
  FROM public.properties AS p
), proposed AS (
  SELECT
    source_rows.*,
    CASE
      WHEN NULLIF(btrim(current_title), '') IS NULL THEN NULL
      ELSE regexp_replace(
        regexp_replace(btrim(current_title), '\\s+', ' ', 'g'),
        '\\s+([,.;:!?])',
        '\\1',
        'g'
      )
    END AS proposed_title
  FROM source_rows
), classified AS (
  SELECT
    proposed.*,
    CASE
      WHEN NULLIF(btrim(current_title), '') IS NULL THEN 'manual_review_missing_title'
      WHEN proposed_title = current_title THEN 'already_canonical_format'
      WHEN record_type = 'user_listing' AND lifecycle_status NOT IN ('pending', 'approved')
        THEN 'manual_review_non_current_listing'
      WHEN record_type = 'property' AND lifecycle_status <> 'active'
        THEN 'manual_review_inactive_property'
      ELSE 'safe_spacing_candidate'
    END AS classification,
    array_remove(ARRAY[
      CASE WHEN current_title IS DISTINCT FROM btrim(current_title) THEN 'trim' END,
      CASE WHEN current_title ~ '\\s{2,}' THEN 'collapse_whitespace' END,
      CASE WHEN current_title ~ '\\s+([,.;:!?])' THEN 'remove_space_before_punctuation' END
    ], NULL) AS proposed_corrections
  FROM proposed
)
SELECT
  now() AS measured_at,
  'listing_title_normalization_dry_run' AS source,
  classification,
  record_type,
  lifecycle_status,
  property_id,
  record_id,
  updated_at,
  current_title,
  proposed_title,
  current_title IS DISTINCT FROM proposed_title AS changed,
  proposed_corrections,
  'Candidate only. Do not update from this report until source evidence and a guarded apply scope are approved.' AS notes
FROM classified
WHERE classification <> 'already_canonical_format'
ORDER BY
  CASE WHEN classification LIKE 'manual_review_%' THEN 0 ELSE 1 END,
  updated_at DESC NULLS LAST,
  record_type,
  record_id;

ROLLBACK;
