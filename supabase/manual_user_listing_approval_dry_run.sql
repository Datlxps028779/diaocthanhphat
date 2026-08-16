-- =============================================================================
-- P3A — Read-only dry-run / production verification for atomic listing approval
--
-- Does not write data. Run in Supabase SQL Editor before, then again after the
-- user-run migration. The final catalog queries need a database role; they cannot
-- be proven through public PostgREST.
-- =============================================================================

-- 1) Lifecycle distribution and linked-property integrity.
SELECT
  l.status,
  count(*) AS listing_count,
  count(*) FILTER (WHERE l.property_id IS NULL) AS without_property_id,
  count(*) FILTER (WHERE l.property_id IS NOT NULL AND p.id IS NULL) AS dangling_property_id,
  count(*) FILTER (WHERE l.status = 'approved' AND COALESCE(p.is_active, false) = false) AS approved_without_active_property,
  count(*) FILTER (WHERE l.status <> 'approved' AND COALESCE(p.is_active, false) = true) AS unpublished_listing_with_active_property
FROM public.user_listings l
LEFT JOIN public.properties p ON p.id = l.property_id
GROUP BY l.status
ORDER BY l.status;

-- 2) Rows the new RPC would reject (fail-closed) when asked to re-approve.
SELECT
  l.id,
  l.status,
  l.property_id,
  p.is_active AS linked_property_active,
  l.expires_at,
  l.created_at
FROM public.user_listings l
LEFT JOIN public.properties p ON p.id = l.property_id
WHERE l.status IN ('pending', 'rejected', 'expired')
  AND COALESCE(p.is_active, false) = true
ORDER BY l.updated_at DESC, l.id
LIMIT 100;

-- 3) Existing duplicates: more than one property ever associated to a listing
-- cannot be inferred without an explicit historical FK on properties. This reports
-- duplicated public identity/location/content fingerprints for manual review only;
-- it does not delete or merge anything.
SELECT
  title,
  city,
  COALESCE(district, '') AS district,
  COALESCE(address, '') AS address,
  price,
  count(*) AS property_count,
  array_agg(id ORDER BY created_at DESC) AS property_ids
FROM public.properties
GROUP BY title, city, COALESCE(district, ''), COALESCE(address, ''), price
HAVING count(*) > 1
ORDER BY property_count DESC, title
LIMIT 100;

-- 4) Confirm the P1 neighborhood safeguard from the database catalog.
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer,
  pg_get_userbyid(p.proowner) AS owner
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('protect_referenced_neighborhood_location', 'rename_neighborhood_slug');

SELECT
  c.relname AS table_name,
  t.tgname AS trigger_name,
  pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname = 'neighborhoods'
  AND t.tgname = 'trg_neighborhoods_protect_referenced_location'
  AND NOT t.tgisinternal;

-- 5) After P3A migration: confirm the atomic approval RPC and its explicit grants.
SELECT
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config,
  pg_get_userbyid(p.proowner) AS owner,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'approve_user_listing';
