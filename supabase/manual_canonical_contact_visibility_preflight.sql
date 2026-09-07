-- Read-only preflight for canonical account identity, listing contacts and public visibility.
-- Run in Supabase SQL Editor before the canonical contact migration.
-- This file must not mutate production data or depend on migration-created functions.

BEGIN TRANSACTION READ ONLY;

WITH profile_rows AS (
  SELECT
    display_name,
    phone,
    NULLIF(regexp_replace(phone, '[^0-9]', '', 'g'), '') AS digits
  FROM public.profiles
), canonical_profiles AS (
  SELECT
    display_name,
    phone,
    CASE
      WHEN left(digits, 2) = '84' AND length(digits) >= 11
        THEN '0' || substr(digits, 3)
      ELSE digits
    END AS phone_canonical
  FROM profile_rows
)
SELECT now() AS measured_at,
       count(*) AS profiles_total,
       count(*) FILTER (WHERE NULLIF(btrim(display_name), '') IS NULL) AS profiles_missing_name,
       count(*) FILTER (WHERE NULLIF(btrim(phone), '') IS NULL) AS profiles_missing_phone,
       count(*) FILTER (WHERE phone_canonical IS NOT NULL AND phone_canonical !~ '^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$') AS profiles_invalid_phone,
       count(*) FILTER (WHERE phone_canonical ~ '^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$') AS profiles_valid_phone
FROM canonical_profiles;

WITH profile_rows AS (
  SELECT
    id,
    NULLIF(regexp_replace(phone, '[^0-9]', '', 'g'), '') AS digits
  FROM public.profiles
), canonical_profiles AS (
  SELECT
    id,
    CASE
      WHEN left(digits, 2) = '84' AND length(digits) >= 11
        THEN '0' || substr(digits, 3)
      ELSE digits
    END AS phone_canonical
  FROM profile_rows
)
SELECT phone_canonical,
       count(*) AS profile_count,
       array_agg(id ORDER BY id) AS profile_ids
FROM canonical_profiles
WHERE phone_canonical IS NOT NULL AND phone_canonical <> ''
GROUP BY phone_canonical
HAVING count(*) > 1
ORDER BY profile_count DESC, phone_canonical;

WITH profile_rows AS (
  SELECT
    id,
    display_name,
    phone,
    NULLIF(regexp_replace(phone, '[^0-9]', '', 'g'), '') AS digits
  FROM public.profiles
), canonical_profiles AS (
  SELECT
    id,
    display_name,
    phone,
    CASE
      WHEN left(digits, 2) = '84' AND length(digits) >= 11
        THEN '0' || substr(digits, 3)
      ELSE digits
    END AS phone_canonical
  FROM profile_rows
)
SELECT now() AS measured_at,
       l.status,
       count(*) AS listing_count,
       count(*) FILTER (WHERE cp.id IS NULL) AS owner_profile_missing,
       count(*) FILTER (WHERE NULLIF(btrim(cp.display_name), '') IS NULL OR cp.phone_canonical IS NULL) AS owner_identity_incomplete,
       count(*) FILTER (WHERE cp.id IS NOT NULL AND (
         l.contact_name IS DISTINCT FROM NULLIF(btrim(cp.display_name), '')
         OR l.contact_phone IS DISTINCT FROM cp.phone_canonical
         OR l.contact_zalo IS DISTINCT FROM cp.phone_canonical
       )) AS contact_mismatch
FROM public.user_listings l
LEFT JOIN canonical_profiles cp ON cp.id = l.user_id
GROUP BY l.status
ORDER BY l.status;

WITH profile_rows AS (
  SELECT
    id,
    display_name,
    phone,
    NULLIF(regexp_replace(phone, '[^0-9]', '', 'g'), '') AS digits
  FROM public.profiles
), canonical_profiles AS (
  SELECT
    id,
    display_name,
    phone,
    CASE
      WHEN left(digits, 2) = '84' AND length(digits) >= 11
        THEN '0' || substr(digits, 3)
      ELSE digits
    END AS phone_canonical
  FROM profile_rows
)
SELECT now() AS measured_at,
       l.id AS listing_id,
       l.user_id,
       l.status,
       l.property_id,
       l.contact_name,
       l.contact_phone,
       l.contact_zalo,
       cp.display_name AS canonical_name,
       cp.phone_canonical AS canonical_phone,
       CASE
         WHEN cp.id IS NULL THEN 'missing_profile'
         WHEN NULLIF(btrim(cp.display_name), '') IS NULL
           OR cp.phone_canonical IS NULL
           OR cp.phone_canonical !~ '^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$' THEN 'incomplete_profile'
         WHEN l.contact_name IS DISTINCT FROM NULLIF(btrim(cp.display_name), '')
           OR l.contact_phone IS DISTINCT FROM cp.phone_canonical
           OR l.contact_zalo IS DISTINCT FROM cp.phone_canonical THEN 'contact_mismatch'
         ELSE 'canonical'
       END AS classification
FROM public.user_listings l
LEFT JOIN canonical_profiles cp ON cp.id = l.user_id
WHERE cp.id IS NULL
   OR NULLIF(btrim(cp.display_name), '') IS NULL
   OR cp.phone_canonical IS NULL
   OR cp.phone_canonical !~ '^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$'
   OR l.contact_name IS DISTINCT FROM NULLIF(btrim(cp.display_name), '')
   OR l.contact_phone IS DISTINCT FROM cp.phone_canonical
   OR l.contact_zalo IS DISTINCT FROM cp.phone_canonical
ORDER BY classification, l.created_at DESC
LIMIT 500;

SELECT now() AS measured_at,
       l.status,
       count(*) AS listing_count,
       count(*) FILTER (WHERE l.property_id IS NULL) AS without_property,
       count(*) FILTER (WHERE l.property_id IS NOT NULL AND p.id IS NULL) AS dangling_property,
       count(*) FILTER (WHERE l.status = 'approved' AND COALESCE(p.is_active, false) = false) AS approved_without_active_property,
       count(*) FILTER (WHERE l.status <> 'approved' AND COALESCE(p.is_active, false) = true) AS unpublished_with_active_property
FROM public.user_listings l
LEFT JOIN public.properties p ON p.id = l.property_id
GROUP BY l.status
ORDER BY l.status;

WITH profile_rows AS (
  SELECT
    id,
    display_name,
    phone,
    NULLIF(regexp_replace(phone, '[^0-9]', '', 'g'), '') AS digits
  FROM public.profiles
), canonical_profiles AS (
  SELECT
    id,
    display_name,
    phone,
    CASE
      WHEN left(digits, 2) = '84' AND length(digits) >= 11
        THEN '0' || substr(digits, 3)
      ELSE digits
    END AS phone_canonical
  FROM profile_rows
)
SELECT now() AS measured_at,
       p.id AS property_id,
       p.is_active,
       l.id AS linked_listing_id,
       l.status AS linked_listing_status,
       l.user_id,
       p.contact_name,
       p.contact_phone,
       p.contact_zalo,
       cp.display_name AS canonical_name,
       cp.phone_canonical AS canonical_phone,
       CASE
         WHEN l.id IS NULL THEN 'unlinked_property'
         WHEN cp.id IS NULL THEN 'missing_profile'
         WHEN NULLIF(btrim(cp.display_name), '') IS NULL
           OR cp.phone_canonical IS NULL
           OR cp.phone_canonical !~ '^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$' THEN 'incomplete_profile'
         WHEN p.contact_name IS DISTINCT FROM NULLIF(btrim(cp.display_name), '')
           OR p.contact_phone IS DISTINCT FROM cp.phone_canonical
           OR p.contact_zalo IS DISTINCT FROM cp.phone_canonical THEN 'property_contact_mismatch'
         ELSE 'canonical'
       END AS classification
FROM public.properties p
LEFT JOIN public.user_listings l ON l.property_id = p.id
LEFT JOIN canonical_profiles cp ON cp.id = l.user_id
WHERE l.id IS NULL
   OR cp.id IS NULL
   OR NULLIF(btrim(cp.display_name), '') IS NULL
   OR cp.phone_canonical IS NULL
   OR cp.phone_canonical !~ '^0(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}$'
   OR p.contact_name IS DISTINCT FROM NULLIF(btrim(cp.display_name), '')
   OR p.contact_phone IS DISTINCT FROM cp.phone_canonical
   OR p.contact_zalo IS DISTINCT FROM cp.phone_canonical
ORDER BY classification, p.updated_at DESC
LIMIT 500;

SELECT now() AS measured_at,
       c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       t.tgname AS trigger_name,
       pg_get_triggerdef(t.oid) AS trigger_definition
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_trigger t ON t.tgrelid = c.oid AND NOT t.tgisinternal
WHERE n.nspname = 'public'
  AND c.relname IN ('profiles', 'user_listings')
ORDER BY c.relname, t.tgname;

SELECT now() AS measured_at,
       n.nspname || '.' || p.proname AS function_name,
       pg_get_function_identity_arguments(p.oid) AS arguments,
       p.prosecdef AS security_definer,
       p.proconfig AS configuration,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'normalize_vn_phone', 'is_valid_vn_phone', 'handle_new_user',
    'canonicalize_user_listing_contact', 'sync_user_listing_contact',
    'approve_user_listing', 'approve_user_listing_legacy',
    'admin_update_pending_user_listing', 'admin_update_pending_user_listing_legacy'
  )
ORDER BY function_name, arguments;

ROLLBACK;
