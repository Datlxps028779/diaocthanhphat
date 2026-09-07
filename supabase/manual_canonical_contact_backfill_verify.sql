-- Read-only post-verification for canonical listing contact backfill.
-- Run after the canonical contact migration and maintenance migration/apply script.

BEGIN TRANSACTION READ ONLY;

WITH canonical_profiles AS (
  SELECT
    p.id,
    NULLIF(btrim(p.display_name), '') AS canonical_name,
    NULLIF(public.normalize_vn_phone(p.phone), '') AS canonical_phone
  FROM public.profiles p
), listing_scope AS (
  SELECT
    l.id AS listing_id,
    l.property_id,
    l.contact_name,
    l.contact_phone,
    l.contact_zalo,
    cp.canonical_name,
    cp.canonical_phone
  FROM public.user_listings l
  JOIN canonical_profiles cp
    ON cp.id = l.user_id
  JOIN public.properties p
    ON p.id = l.property_id
  WHERE l.status = 'approved'
    AND p.is_active IS TRUE
    AND cp.canonical_name IS NOT NULL
    AND cp.canonical_phone IS NOT NULL
    AND public.is_valid_vn_phone(cp.canonical_phone)
), property_scope AS (
  SELECT
    p.id AS property_id,
    p.contact_name,
    p.contact_phone,
    p.contact_zalo,
    cp.canonical_name,
    cp.canonical_phone
  FROM public.properties p
  JOIN public.user_listings l
    ON l.property_id = p.id
  JOIN canonical_profiles cp
    ON cp.id = l.user_id
  WHERE l.status = 'approved'
    AND p.is_active IS TRUE
    AND cp.canonical_name IS NOT NULL
    AND cp.canonical_phone IS NOT NULL
    AND public.is_valid_vn_phone(cp.canonical_phone)
), profile_summary AS (
  SELECT jsonb_build_object(
    'profiles_total', count(*),
    'profiles_missing_name', count(*) FILTER (
      WHERE NULLIF(btrim(display_name), '') IS NULL
    ),
    'profiles_missing_phone', count(*) FILTER (
      WHERE phone IS NULL OR NULLIF(btrim(phone), '') IS NULL
    )
  ) AS value
  FROM public.profiles
), listing_summary AS (
  SELECT jsonb_build_object(
    'scope_total', count(*),
    'contact_mismatches', count(*) FILTER (
      WHERE contact_name IS DISTINCT FROM canonical_name
         OR contact_phone IS DISTINCT FROM canonical_phone
         OR contact_zalo IS DISTINCT FROM canonical_phone
    ),
    'approved_without_property', (
      SELECT count(*)
      FROM public.user_listings
      WHERE status = 'approved' AND property_id IS NULL
    ),
    'approved_linked_inactive_property', (
      SELECT count(*)
      FROM public.user_listings l
      JOIN public.properties p ON p.id = l.property_id
      WHERE l.status = 'approved' AND p.is_active IS NOT TRUE
    )
  ) AS value
  FROM listing_scope
), property_summary AS (
  SELECT jsonb_build_object(
    'scope_total', count(*),
    'contact_mismatches', count(*) FILTER (
      WHERE contact_name IS DISTINCT FROM canonical_name
         OR contact_phone IS DISTINCT FROM canonical_phone
         OR contact_zalo IS DISTINCT FROM canonical_phone
    )
  ) AS value
  FROM property_scope
), trigger_summary AS (
  SELECT jsonb_build_object(
    'profile_identity_trigger_present', EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'profiles'
        AND t.tgname = 'trg_enforce_profile_identity'
        AND NOT t.tgisinternal
    ),
    'listing_contact_trigger_present', EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'user_listings'
        AND t.tgname = 'trg_canonicalize_user_listing_contact'
        AND NOT t.tgisinternal
    ),
    'mutation_scope_maintenance_flag_present', (
      pg_get_functiondef('public.assert_user_listing_mutation_scope()'::regprocedure)
        LIKE '%app.canonical_contact_backfill%'
    )
  ) AS value
), function_summary AS (
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'function_name', n.nspname || '.' || p.proname,
        'arguments', pg_get_function_identity_arguments(p.oid),
        'security_definer', p.prosecdef,
        'configuration', p.proconfig,
        'anon_execute', has_function_privilege('anon', p.oid, 'EXECUTE'),
        'authenticated_execute', has_function_privilege('authenticated', p.oid, 'EXECUTE')
      )
      ORDER BY n.nspname || '.' || p.proname,
               pg_get_function_identity_arguments(p.oid)
    ),
    '[]'::jsonb
  ) AS value
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'normalize_vn_phone',
      'is_valid_vn_phone',
      'handle_new_user',
      'enforce_profile_identity',
      'canonicalize_user_listing_contact',
      'sync_user_listing_contact',
      'approve_user_listing'
    )
)
SELECT jsonb_build_object(
  'measured_at', now(),
  'backfill_verification', jsonb_build_object(
    'listing_scope_expected', 25,
    'property_scope_expected', 25,
    'listing_scope_actual', (SELECT (value->>'scope_total')::bigint FROM listing_summary),
    'property_scope_actual', (SELECT (value->>'scope_total')::bigint FROM property_summary),
    'listing_contact_mismatches', (SELECT (value->>'contact_mismatches')::bigint FROM listing_summary),
    'property_contact_mismatches', (SELECT (value->>'contact_mismatches')::bigint FROM property_summary),
    'pass', (
      (SELECT (value->>'scope_total')::bigint FROM listing_summary) = 25
      AND (SELECT (value->>'scope_total')::bigint FROM property_summary) = 25
      AND (SELECT (value->>'contact_mismatches')::bigint FROM listing_summary) = 0
      AND (SELECT (value->>'contact_mismatches')::bigint FROM property_summary) = 0
    )
  ),
  'profile_summary', (SELECT value FROM profile_summary),
  'listing_summary', (SELECT value FROM listing_summary),
  'property_summary', (SELECT value FROM property_summary),
  'trigger_summary', (SELECT value FROM trigger_summary),
  'function_summary', (SELECT value FROM function_summary),
  'write_performed', false
) AS canonical_contact_backfill_verification;

ROLLBACK;
