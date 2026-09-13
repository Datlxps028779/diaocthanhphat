-- =============================================================================
-- Staff permissions verification — one-row summary, read-only
--
-- Use this when Supabase SQL Editor only shows the final result set of the
-- multi-query verification script. It returns ONE JSON row containing counts,
-- integrity issues, function ACL, trigger definitions, RLS/policy checks and
-- browser-role table privileges.
--
-- Does NOT write data, change schema/privileges, or mutate production.
-- Production SQL is run by the user.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH counts AS (
  SELECT jsonb_build_object(
    'staff_accounts', (SELECT count(*)::integer FROM public.profiles WHERE role = 'staff'),
    'catalog_rows', (SELECT count(*)::integer FROM public.staff_permission_catalog),
    'assignment_rows', (SELECT count(*)::integer FROM public.staff_permission_assignments),
    'audit_rows', (SELECT count(*)::integer FROM public.staff_permission_audit)
  ) AS value
), orphan_staff AS (
  SELECT count(*)::integer AS issue_count
  FROM public.staff_permission_assignments a
  LEFT JOIN public.profiles p ON p.id = a.staff_user_id
  WHERE p.id IS NULL OR p.role IS DISTINCT FROM 'staff'
), invalid_catalog AS (
  SELECT count(*)::integer AS issue_count
  FROM public.staff_permission_assignments a
  LEFT JOIN public.staff_permission_catalog c
    ON c.module = a.module AND c.action = a.action
  WHERE c.module IS NULL
), invalid_scope AS (
  SELECT count(*)::integer AS issue_count
  FROM public.staff_permission_assignments a
  WHERE a.scope_kind NOT IN ('global', 'area', 'district', 'ward', 'neighborhood')
     OR (a.scope_kind = 'global' AND a.scope_id IS NOT NULL)
     OR (a.scope_kind <> 'global' AND a.scope_id IS NULL)
     OR (a.scope_kind = 'area' AND NOT EXISTS (SELECT 1 FROM public.areas x WHERE x.id = a.scope_id))
     OR (a.scope_kind = 'district' AND NOT EXISTS (SELECT 1 FROM public.districts x WHERE x.id = a.scope_id))
     OR (a.scope_kind = 'ward' AND NOT EXISTS (SELECT 1 FROM public.wards x WHERE x.id = a.scope_id))
     OR (a.scope_kind = 'neighborhood' AND NOT EXISTS (SELECT 1 FROM public.neighborhoods x WHERE x.id = a.scope_id))
), duplicate_groups AS (
  SELECT count(*)::integer AS issue_count
  FROM (
    SELECT staff_user_id, module, action, scope_kind, scope_id
    FROM public.staff_permission_assignments
    GROUP BY staff_user_id, module, action, scope_kind, scope_id
    HAVING count(*) > 1
  ) d
), orphan_staff_sample AS (
  SELECT
    a.id,
    a.staff_user_id,
    p.role,
    a.module,
    a.action,
    a.scope_kind,
    a.scope_id,
    a.granted_by,
    a.created_at,
    a.updated_at,
    CASE WHEN p.id IS NULL THEN 'missing_profile' ELSE 'profile_not_staff' END AS issue
  FROM public.staff_permission_assignments a
  LEFT JOIN public.profiles p ON p.id = a.staff_user_id
  WHERE p.id IS NULL OR p.role IS DISTINCT FROM 'staff'
  ORDER BY a.staff_user_id, a.module, a.action
  LIMIT 20
), function_checks AS (
  SELECT
    expected.signature,
    (p.oid IS NOT NULL) AS exists,
    coalesce(p.prosecdef, false) AS security_definer,
    p.proconfig AS function_config,
    CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('anon', p.oid, 'EXECUTE') END AS anon_can_execute,
    CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('authenticated', p.oid, 'EXECUTE') END AS authenticated_can_execute,
    CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('postgres', p.oid, 'EXECUTE') END AS postgres_can_execute
  FROM (VALUES
    ('public.staff_permission_scope_matches(text,uuid,uuid,uuid,uuid,uuid)'),
    ('public.has_staff_permission(text,text,uuid,uuid,uuid,uuid)'),
    ('public.get_my_staff_permissions()'),
    ('public.get_staff_permissions(uuid)'),
    ('public.replace_staff_permissions(uuid,jsonb)'),
    ('public.enforce_staff_content_permission()'),
    ('public.approve_user_listing(uuid)'),
    ('public.admin_update_pending_user_listing(uuid,jsonb)'),
    ('public.admin_apply_user_listing_ai_seo(uuid)'),
    ('public.admin_reject_user_listing_ai_seo(uuid)')
  ) AS expected(signature)
  LEFT JOIN (
    SELECT
      n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature,
      p.oid,
      p.prosecdef,
      p.proconfig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  ) p ON p.signature = expected.signature
), actual_permission_function_inventory AS (
  SELECT
    n.nspname || '.' || p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS signature,
    pg_get_function_identity_arguments(p.oid) AS identity_arguments,
    p.prosecdef AS security_definer,
    p.proconfig AS function_config,
    has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
    has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
    has_function_privilege('postgres', p.oid, 'EXECUTE') AS postgres_can_execute
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN (
      'staff_permission_scope_matches',
      'has_staff_permission',
      'get_my_staff_permissions',
      'get_staff_permissions',
      'replace_staff_permissions',
      'enforce_staff_content_permission',
      'approve_user_listing',
      'admin_update_pending_user_listing',
      'admin_apply_user_listing_ai_seo',
      'admin_reject_user_listing_ai_seo'
    )
), trigger_checks AS (
  SELECT
    expected.trigger_name,
    t.tgname IS NOT NULL AS exists,
    c.relname AS table_name,
    p.oid::regprocedure::text AS trigger_function,
    pg_get_triggerdef(t.oid) AS trigger_definition
  FROM (VALUES
    ('trg_staff_properties_permission'),
    ('trg_staff_news_permission')
  ) AS expected(trigger_name)
  LEFT JOIN pg_trigger t
    ON t.tgname = expected.trigger_name
   AND NOT t.tgisinternal
  LEFT JOIN pg_class c ON c.oid = t.tgrelid
  LEFT JOIN pg_proc p ON p.oid = t.tgfoid
), rls_checks AS (
  SELECT
    expected.table_name,
    coalesce(c.relrowsecurity, false) AS rls_enabled,
    coalesce(c.relforcerowsecurity, false) AS force_rls,
    count(p.policyname)::integer AS policy_count,
    coalesce(array_agg(p.policyname ORDER BY p.policyname)
      FILTER (WHERE p.policyname IS NOT NULL), ARRAY[]::text[]) AS policy_names
  FROM (VALUES ('properties'), ('news'), ('user_listings')) AS expected(table_name)
  LEFT JOIN pg_class c
    ON c.relname = expected.table_name
  LEFT JOIN pg_namespace ns
    ON ns.oid = c.relnamespace AND ns.nspname = 'public'
  LEFT JOIN pg_policies p
    ON p.schemaname = 'public' AND p.tablename = expected.table_name
  GROUP BY expected.table_name, c.relrowsecurity, c.relforcerowsecurity
), expected_policies AS (
  SELECT expected.policy_name,
    EXISTS (
      SELECT 1 FROM pg_policies p
      WHERE p.schemaname = 'public' AND p.policyname = expected.policy_name
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
), table_privileges AS (
  SELECT
    t.table_name,
    has_table_privilege('anon', format('public.%I', t.table_name), 'SELECT') AS anon_can_select,
    has_table_privilege('authenticated', format('public.%I', t.table_name), 'SELECT') AS authenticated_can_select
  FROM (VALUES
    ('staff_permission_catalog'),
    ('staff_permission_assignments'),
    ('staff_permission_audit')
  ) AS t(table_name)
), catalog_invalid AS (
  SELECT count(*)::integer AS issue_count
  FROM public.staff_permission_catalog c
  WHERE nullif(btrim(c.module::text), '') IS NULL
     OR nullif(btrim(c.action::text), '') IS NULL
     OR nullif(btrim(coalesce(c.label, '')), '') IS NULL
)
SELECT jsonb_build_object(
  'counts', (SELECT value FROM counts),
  'integrity', jsonb_build_object(
    'orphan_or_non_staff_assignments', (SELECT issue_count FROM orphan_staff),
    'orphan_or_non_staff_sample', coalesce((
      SELECT jsonb_agg(row_to_json(o) ORDER BY o.staff_user_id, o.module, o.action)
      FROM orphan_staff_sample o
    ), '[]'::jsonb),
    'assignments_missing_catalog_reference', (SELECT issue_count FROM invalid_catalog),
    'invalid_scope_rows', (SELECT issue_count FROM invalid_scope),
    'duplicate_assignment_groups', (SELECT issue_count FROM duplicate_groups),
    'invalid_catalog_rows', (SELECT issue_count FROM catalog_invalid)
  ),
  'function_checks', coalesce((
    SELECT jsonb_agg(row_to_json(f) ORDER BY f.signature)
    FROM function_checks f
  ), '[]'::jsonb),
  'actual_permission_function_inventory', coalesce((
    SELECT jsonb_agg(row_to_json(f) ORDER BY f.signature)
    FROM actual_permission_function_inventory f
  ), '[]'::jsonb),
  'trigger_checks', coalesce((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.trigger_name)
    FROM trigger_checks t
  ), '[]'::jsonb),
  'rls_checks', coalesce((
    SELECT jsonb_agg(row_to_json(r) ORDER BY r.table_name)
    FROM rls_checks r
  ), '[]'::jsonb),
  'policy_checks', jsonb_build_object(
    'expected_count', (SELECT count(*)::integer FROM expected_policies),
    'present_count', (SELECT count(*)::integer FROM expected_policies WHERE present),
    'missing_count', (SELECT count(*)::integer FROM expected_policies WHERE NOT present),
    'missing_names', coalesce((
      SELECT jsonb_agg(policy_name ORDER BY policy_name)
      FROM expected_policies
      WHERE NOT present
    ), '[]'::jsonb)
  ),
  'permission_table_privileges', coalesce((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.table_name)
    FROM table_privileges t
  ), '[]'::jsonb),
  'catalog_sample', coalesce((
    SELECT jsonb_agg(row_to_json(c) ORDER BY c.module, c.action)
    FROM (
      SELECT module, action, label
      FROM public.staff_permission_catalog
      ORDER BY module, action
      LIMIT 100
    ) c
  ), '[]'::jsonb)
) AS staff_permissions_verification_summary;

ROLLBACK;
