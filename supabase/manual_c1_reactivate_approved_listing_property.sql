-- =============================================================================
-- C1 — Production correction: reactivate one approved listing's property
--
-- Run only after manual_c1_reactivate_approved_listing_property_dry_run.sql
-- returned ready_for_user_run = true. This transaction is intentionally scoped
-- to one measured listing/property pair and fails closed if any precondition has
-- changed. It does not change listing status, expiry, ownership, content,
-- verification fields, or lifecycle history.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_updated_count integer;
BEGIN
  UPDATE public.properties AS p
     SET is_active = true,
         updated_at = now()
   WHERE p.id = 'feacaf55-3596-4c99-b5b8-d66fcfc84e27'::uuid
     AND p.is_active IS FALSE
     AND p.meta_title IS NOT NULL
     AND p.meta_title <> ''
     AND p.meta_description IS NOT NULL
     AND p.meta_description <> ''
     AND (
       SELECT count(*)
       FROM public.user_listings AS referenced_listing
       WHERE referenced_listing.property_id = p.id
     ) = 1
     AND EXISTS (
       SELECT 1
       FROM public.user_listings AS l
       WHERE l.id = '8f409900-701a-42d9-be8b-e559d17bbe9b'::uuid
         AND l.status = 'approved'
         AND l.expires_at IS NOT NULL
         AND l.expires_at > now()
         AND l.property_id = p.id
     );

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;

  IF v_updated_count <> 1 THEN
    RAISE EXCEPTION
      'C1 blocked: expected exactly one guarded property update, got %',
      v_updated_count
      USING ERRCODE = 'check_violation';
  END IF;
END
$$;

-- Post-mutation result. The transaction is committed only after the guarded
-- update succeeds; this result confirms the intended fields and unchanged scope.
SELECT
  now() AS measured_at,
  l.id AS listing_id,
  l.status AS listing_status,
  l.expires_at,
  l.property_id,
  p.id AS property_id,
  p.is_active AS property_is_active,
  p.meta_title,
  p.meta_description,
  (
    SELECT count(*)::bigint
    FROM public.user_listings AS referenced_listing
    WHERE referenced_listing.property_id = p.id
  ) AS property_reference_count,
  (
    SELECT count(*)::bigint
    FROM public.user_listing_lifecycle_events AS lifecycle_event
    WHERE lifecycle_event.listing_id = l.id
  ) AS lifecycle_event_count,
  'Only properties.is_active and properties.updated_at were changed' AS mutation_scope
FROM public.user_listings AS l
JOIN public.properties AS p ON p.id = l.property_id
WHERE l.id = '8f409900-701a-42d9-be8b-e559d17bbe9b'::uuid;

COMMIT;
