-- =============================================================================
-- C1 — Read-only post-mutation verification
--
-- Confirms the user-run C1 correction for one listing/property pair. This file
-- never writes data.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

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
    l.expires_at,
    l.property_id AS listing_property_id,
    p.id AS property_id,
    p.is_active AS property_is_active,
    p.updated_at AS property_updated_at,
    (
      SELECT count(*)::bigint
      FROM public.user_listings AS referenced_listing
      WHERE referenced_listing.property_id = ids.property_id
    ) AS property_reference_count,
    (
      SELECT count(*)::bigint
      FROM public.user_listing_lifecycle_events AS lifecycle_event
      WHERE lifecycle_event.listing_id = ids.listing_id
    ) AS lifecycle_event_count,
    NOT EXISTS (
      SELECT 1
      FROM (
        SELECT DISTINCT ON (listing_id)
          listing_id,
          to_status
        FROM public.user_listing_lifecycle_events
        WHERE listing_id = ids.listing_id
        ORDER BY listing_id, occurred_at DESC, id DESC
      ) AS latest_event
      WHERE latest_event.to_status IS DISTINCT FROM l.status
    ) AS latest_event_matches_status
  FROM target_ids AS ids
  LEFT JOIN public.user_listings AS l ON l.id = ids.listing_id
  LEFT JOIN public.properties AS p ON p.id = ids.property_id
)
SELECT
  now() AS measured_at,
  listing_id,
  property_id,
  listing_status,
  expires_at,
  listing_property_id,
  property_is_active,
  property_updated_at,
  property_reference_count,
  lifecycle_event_count,
  latest_event_matches_status,
  COALESCE(listing_id IS NOT NULL, false) AS listing_exists,
  COALESCE(property_id IS NOT NULL, false) AS property_exists,
  COALESCE(listing_status = 'approved', false) AS listing_is_approved,
  COALESCE(expires_at > now(), false) AS listing_is_unexpired,
  COALESCE(listing_property_id = expected_property_id, false) AS mapping_matches_target,
  COALESCE(property_is_active, false) AS property_is_public_active,
  property_reference_count = 1 AS single_property_reference,
  lifecycle_event_count = 0 AS no_lifecycle_event_created,
  COALESCE(
    listing_id IS NOT NULL
    AND property_id IS NOT NULL
    AND listing_status = 'approved'
    AND expires_at > now()
    AND listing_property_id = expected_property_id
    AND property_is_active IS TRUE
    AND property_reference_count = 1
    AND lifecycle_event_count = 0
    AND latest_event_matches_status,
    false
  ) AS c1_post_verify_pass,
  'C1 expected only properties.is_active and properties.updated_at to change' AS verification_scope
FROM target;

ROLLBACK;
