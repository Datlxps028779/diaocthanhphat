-- Staff permissions post-migration verification (READ ONLY)
-- Run after migrations 20260907000000 and 20260930050000.
-- This file contains SELECT statements only. It does not mutate production data.

-- 1) High-level counts.
SELECT
  (SELECT count(*) FROM public.profiles WHERE role = 'staff') AS staff_accounts,
  (SELECT count(*) FROM public.staff_permission_catalog) AS catalog_rows,
  (SELECT count(*) FROM public.staff_permission_assignments) AS assignment_rows,
  (SELECT count(*) FROM public.staff_permission_audit) AS audit_rows;

-- 2) Assignments must target staff accounts only.
SELECT
  a.staff_user_id,
  p.role,
  count(*) AS assignment_count
FROM public.staff_permission_assignments a
LEFT JOIN public.profiles p ON p.id = a.staff_user_id
WHERE p.id IS NULL OR p.role IS DISTINCT FROM 'staff'
GROUP BY a.staff_user_id, p.role
ORDER BY a.staff_user_id;

-- 3) Every assignment must reference the permission catalog.
SELECT
  a.module,
  a.action,
  count(*) AS assignment_count
FROM public.staff_permission_assignments a
LEFT JOIN public.staff_permission_catalog c
  ON c.module = a.module AND c.action = a.action
WHERE c.module IS NULL
GROUP BY a.module, a.action
ORDER BY a.module, a.action;

-- 4) Scope shape and taxonomy integrity.
SELECT
  a.id,
  a.staff_user_id,
  a.module,
  a.action,
  a.scope_kind,
  a.scope_id,
  CASE
    WHEN a.scope_kind NOT IN ('global', 'area', 'district', 'ward', 'neighborhood')
      THEN 'invalid_scope_kind'
    WHEN a.scope_kind = 'global' AND a.scope_id IS NOT NULL
      THEN 'global_has_scope_id'
    WHEN a.scope_kind <> 'global' AND a.scope_id IS NULL
      THEN 'non_global_missing_scope_id'
    WHEN a.scope_kind = 'area'
      AND NOT EXISTS (SELECT 1 FROM public.areas x WHERE x.id = a.scope_id)
      THEN 'missing_area'
    WHEN a.scope_kind = 'district'
      AND NOT EXISTS (SELECT 1 FROM public.districts x WHERE x.id = a.scope_id)
      THEN 'missing_district'
    WHEN a.scope_kind = 'ward'
      AND NOT EXISTS (SELECT 1 FROM public.wards x WHERE x.id = a.scope_id)
      THEN 'missing_ward'
    WHEN a.scope_kind = 'neighborhood'
      AND NOT EXISTS (SELECT 1 FROM public.neighborhoods x WHERE x.id = a.scope_id)
      THEN 'missing_neighborhood'
    ELSE NULL
  END AS issue
FROM public.staff_permission_assignments a
WHERE a.scope_kind NOT IN ('global', 'area', 'district', 'ward', 'neighborhood')
   OR (a.scope_kind = 'global' AND a.scope_id IS NOT NULL)
   OR (a.scope_kind <> 'global' AND a.scope_id IS NULL)
   OR (a.scope_kind = 'area' AND NOT EXISTS (SELECT 1 FROM public.areas x WHERE x.id = a.scope_id))
   OR (a.scope_kind = 'district' AND NOT EXISTS (SELECT 1 FROM public.districts x WHERE x.id = a.scope_id))
   OR (a.scope_kind = 'ward' AND NOT EXISTS (SELECT 1 FROM public.wards x WHERE x.id = a.scope_id))
   OR (a.scope_kind = 'neighborhood' AND NOT EXISTS (SELECT 1 FROM public.neighborhoods x WHERE x.id = a.scope_id))
ORDER BY a.staff_user_id, a.module, a.action;

-- 5) Duplicate assignments should be impossible under the unique constraint.
SELECT
  staff_user_id,
  module,
  action,
  scope_kind,
  scope_id,
  count(*) AS duplicate_count
FROM public.staff_permission_assignments
GROUP BY staff_user_id, module, action, scope_kind, scope_id
HAVING count(*) > 1
ORDER BY staff_user_id, module, action;

-- 6) Required functions, security-definer/search_path configuration and role ACL.
SELECT
  p.oid::regprocedure AS function_signature,
  p.prosecdef AS security_definer,
  p.proconfig AS function_config,
  pg_get_userbyid(p.proowner) AS function_owner,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('postgres', p.oid, 'EXECUTE') AS postgres_can_execute
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.oid::regprocedure::text IN (
    'public.staff_permission_scope_matches(text,uuid,uuid,uuid,uuid,uuid)',
    'public.has_staff_permission(text,text,uuid,uuid,uuid,uuid)',
    'public.get_my_staff_permissions()',
    'public.get_staff_permissions(uuid)',
    'public.replace_staff_permissions(uuid,jsonb)',
    'public.enforce_staff_content_permission()',
    'public.approve_user_listing(uuid)',
    'public.admin_update_pending_user_listing(uuid,jsonb)',
    'public.admin_apply_user_listing_ai_seo(uuid)',
    'public.admin_reject_user_listing_ai_seo(uuid)'
  )
ORDER BY function_signature;

-- 7) The enforcement trigger must use a zero-argument trigger function and pass
-- the module through TG_ARGV. pg_get_triggerdef exposes the installed definition.
SELECT
  t.tgname AS trigger_name,
  c.relname AS table_name,
  pg_get_triggerdef(t.oid) AS trigger_definition,
  p.oid::regprocedure AS trigger_function
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND t.tgname IN ('trg_staff_properties_permission', 'trg_staff_news_permission')
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 8) RLS must be enabled and expected granular policies must exist.
SELECT
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  count(p.policyname) AS policy_count,
  array_agg(p.policyname ORDER BY p.policyname) FILTER (WHERE p.policyname IS NOT NULL) AS policy_names
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p
  ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relname IN ('properties', 'news', 'user_listings')
GROUP BY c.relname, c.relrowsecurity, c.relforcerowsecurity
ORDER BY c.relname;

-- 9) Exact expected granular policy names.
SELECT expected.policy_name,
       EXISTS (
         SELECT 1
         FROM pg_policies p
         WHERE p.schemaname = 'public'
           AND p.policyname = expected.policy_name
       ) AS present
FROM (VALUES
  ('properties_staff_permission_select'),
  ('properties_staff_permission_insert'),
  ('properties_staff_permission_update'),
  ('properties_staff_permission_delete'),
  ('news_staff_permission_select'),
  ('news_staff_permission_insert'),
  ('news_staff_permission_update'),
  ('news_staff_permission_delete'),
  ('user_listings_admin_select'),
  ('user_listings_admin_update')
) AS expected(policy_name)
ORDER BY expected.policy_name;

-- 10) The permission tables must not be directly readable by browser roles.
SELECT
  table_name,
  has_table_privilege('anon', format('public.%I', table_name), 'SELECT') AS anon_can_select,
  has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT') AS authenticated_can_select
FROM (VALUES
  ('staff_permission_catalog'),
  ('staff_permission_assignments'),
  ('staff_permission_audit')
) AS tables(table_name)
ORDER BY table_name;

-- 11) Catalog coverage and invalid action/module rows.
SELECT module, action, label
FROM public.staff_permission_catalog
ORDER BY module, action;
