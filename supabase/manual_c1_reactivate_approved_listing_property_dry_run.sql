-- =============================================================================
-- C1 — Read-only dry-run for reactivating the approved listing's property
--
-- Target: one approved, unexpired user listing whose linked property is inactive.
-- This file never updates data, inserts lifecycle history, changes ownership, or
-- changes listing/property content. Run it before any user-run production SQL.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- 1) Every C1 precondition is returned explicitly. All checks must be true.
WITH target_ids AS (
  SELECT
    '8f409900-701a-42d9-be8b-e559d17bbe9b'::uuid AS listing_id,
    'feacaf55-3596-4c99-b5b8-d66fcfc84e27'::uuid AS property_id
), target AS (
  SELECT
    ids.listing_id AS expected_listing_id,
    ids.property_id AS expected_property_id,
    l.id AS listing_id,
    l.status AS listing_status,
    l.property_id AS listing_property_id,
    l.expires_at,
    l.updated_at AS listing_updated_at,
    p.id AS property_id,
    p.is_active AS property_is_active,
    p.updated_at AS property_updated_at,
    p.meta_title,
    p.meta_description,
    (
      SELECT count(*)::bigint
      FROM public.user_listings referenced_listing
      WHERE referenced_listing.property_id = ids.property_id
    ) AS property_reference_count,
    (
      SELECT count(*)::bigint
      FROM public.user_listing_lifecycle_events lifecycle_event
      WHERE lifecycle_event.listing_id = ids.listing_id
    ) AS lifecycle_event_count
  FROM target_ids ids
  LEFT JOIN public.user_listings l ON l.id = ids.listing_id
  LEFT JOIN public.properties p ON p.id = ids.property_id
)
SELECT
  now() AS measured_at,
  check_code,
  is_pass,
  observed_value,
  expected_value,
  notes
FROM target
CROSS JOIN LATERAL (VALUES
  (
    'listing_exists'::text,
    listing_id IS NOT NULL,
    CASE WHEN listing_id IS NULL THEN 'missing' ELSE 'present' END,
    'present',
    'Target listing must exist'
  ),
  (
    'listing_status_approved'::text,
    listing_status = 'approved',
    coalesce(listing_status, 'null'),
    'approved',
    'Only an approved listing may activate its linked property'
  ),
  (
    'listing_expiry_future'::text,
    expires_at IS NOT NULL AND expires_at > now(),
    coalesce(expires_at::text, 'null'),
    '> current timestamp',
    'Do not reactivate an expired or perpetual listing from this batch'
  ),
  (
    'listing_property_matches_target'::text,
    listing_property_id IS NOT NULL AND listing_property_id = expected_property_id,
    coalesce(listing_property_id::text, 'null'),
    expected_property_id::text,
    'The listing must still reference the measured property'
  ),
  (
    'property_exists'::text,
    property_id IS NOT NULL,
    CASE WHEN property_id IS NULL THEN 'missing' ELSE 'present' END,
    'present',
    'The linked property must exist'
  ),
  (
    'property_is_inactive'::text,
    property_is_active IS FALSE,
    coalesce(property_is_active::text, 'null'),
    'false',
    'The batch must not overwrite an already-active property'
  ),
  (
    'property_seo_autofill_will_be_noop'::text,
    meta_title IS NOT NULL AND meta_title <> ''
      AND meta_description IS NOT NULL AND meta_description <> '',
    CASE
      WHEN meta_title IS NOT NULL AND meta_title <> ''
       AND meta_description IS NOT NULL AND meta_description <> '' THEN 'present'
      ELSE 'missing_or_empty'
    END,
    'present',
    'The properties BEFORE UPDATE SEO trigger must not add fields outside C1'
  ),
  (
    'property_has_single_listing_reference'::text,
    property_reference_count = 1,
    property_reference_count::text,
    '1',
    'Do not activate a property with ambiguous listing ownership'
  )
) AS checks(check_code, is_pass, observed_value, expected_value, notes)
ORDER BY check_code;

-- 2) Proposed change. `ready_for_user_run` is informational only; no mutation
-- occurs in this file. The lifecycle event count is shown but not modified.
WITH target_ids AS (
  SELECT
    '8f409900-701a-42d9-be8b-e559d17bbe9b'::uuid AS listing_id,
    'feacaf55-3596-4c99-b5b8-d66fcfc84e27'::uuid AS property_id
), target AS (
  SELECT
    ids.listing_id,
    ids.property_id,
    l.status AS listing_status,
    l.property_id AS listing_property_id,
    l.expires_at,
    p.is_active AS property_is_active,
    p.meta_title,
    p.meta_description,
    (
      SELECT count(*)::bigint
      FROM public.user_listings referenced_listing
      WHERE referenced_listing.property_id = ids.property_id
    ) AS property_reference_count,
    (
      SELECT count(*)::bigint
      FROM public.user_listing_lifecycle_events lifecycle_event
      WHERE lifecycle_event.listing_id = ids.listing_id
    ) AS lifecycle_event_count
  FROM target_ids ids
  LEFT JOIN public.user_listings l ON l.id = ids.listing_id
  LEFT JOIN public.properties p ON p.id = ids.property_id
), readiness AS (
  SELECT
    t.*,
    COALESCE(
      t.listing_status = 'approved'
        AND t.expires_at IS NOT NULL
        AND t.expires_at > now()
        AND t.listing_property_id IS NOT NULL
        AND t.listing_property_id = t.property_id
        AND t.property_is_active IS FALSE
        AND t.property_reference_count = 1,
      false
    ) AS all_preconditions_pass
  FROM target t
)
SELECT
  now() AS measured_at,
  listing_id,
  property_id,
  listing_status,
  expires_at,
  property_is_active AS current_property_is_active,
  true AS proposed_property_is_active,
  property_reference_count,
  lifecycle_event_count,
  all_preconditions_pass AS ready_for_user_run,
  CASE
    WHEN all_preconditions_pass THEN 'UPDATE properties SET is_active = true, updated_at = current timestamp'
    ELSE 'BLOCKED — do not run a mutation until every precondition passes'
  END AS proposed_action,
  'No listing status, expiry, property_id, ownership, content, verification field, or lifecycle history change' AS unchanged_fields
FROM readiness;

ROLLBACK;
