-- =============================================================================
-- Phase E staff permission boundary preflight — READ ONLY
--
-- Chạy trên production trước khi cân nhắc migration Phase E.
-- Script chỉ trả về fingerprint/count/metadata; không sửa dữ liệu hay quyền.
-- Production SQL do user tự chạy.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH assignment_integrity AS (
  SELECT
    count(*) FILTER (WHERE p.id IS NULL OR p.role IS DISTINCT FROM 'staff')::integer AS non_staff_rows,
    count(*) FILTER (WHERE c.module IS NULL)::integer AS missing_catalog_rows,
    count(*) FILTER (
      WHERE a.scope_kind NOT IN ('global', 'area', 'district', 'ward', 'neighborhood')
        OR (a.scope_kind = 'global' AND a.scope_id IS NOT NULL)
        OR (a.scope_kind <> 'global' AND a.scope_id IS NULL)
        OR (a.scope_kind = 'area' AND NOT EXISTS (SELECT 1 FROM public.areas x WHERE x.id = a.scope_id))
        OR (a.scope_kind = 'district' AND NOT EXISTS (SELECT 1 FROM public.districts x WHERE x.id = a.scope_id))
        OR (a.scope_kind = 'ward' AND NOT EXISTS (SELECT 1 FROM public.wards x WHERE x.id = a.scope_id))
        OR (a.scope_kind = 'neighborhood' AND NOT EXISTS (SELECT 1 FROM public.neighborhoods x WHERE x.id = a.scope_id))
    )::integer AS invalid_scope_rows,
    count(*)::integer AS assignment_rows
  FROM public.staff_permission_assignments a
  LEFT JOIN public.profiles p ON p.id = a.staff_user_id
  LEFT JOIN public.staff_permission_catalog c ON c.module = a.module AND c.action = a.action
), duplicate_groups AS (
  SELECT count(*)::integer AS issue_count
  FROM (
    SELECT staff_user_id, module, action, scope_kind, scope_id
    FROM public.staff_permission_assignments
    GROUP BY staff_user_id, module, action, scope_kind, scope_id
    HAVING count(*) > 1
  ) d
), function_inventory AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'signature', expected.signature,
    'exists', to_regprocedure(expected.signature) IS NOT NULL,
    'security_definer', coalesce(p.prosecdef, false),
    'config', p.proconfig,
    'anon_execute', CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('anon', p.oid, 'EXECUTE') END,
    'authenticated_execute', CASE WHEN p.oid IS NULL THEN NULL ELSE has_function_privilege('authenticated', p.oid, 'EXECUTE') END
  ) ORDER BY expected.signature), '[]'::jsonb) AS value
  FROM (VALUES
    ('public.staff_permission_scope_matches(text,uuid,uuid,uuid,uuid,uuid)'),
    ('public.has_staff_permission(text,text,uuid,uuid,uuid,uuid)'),
    ('public.get_my_staff_permissions()'),
    ('public.get_staff_permissions(uuid)'),
    ('public.replace_staff_permissions(uuid,jsonb)'),
    ('public.enforce_staff_content_permission()')
  ) AS expected(signature)
  LEFT JOIN pg_proc p ON p.oid = to_regprocedure(expected.signature)
), expected_policies AS (
  SELECT expected.policy_name, EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname = 'public' AND p.policyname = expected.policy_name
  ) AS present
  FROM (VALUES
    ('properties_staff_permission_select'), ('properties_staff_permission_insert'),
    ('properties_staff_permission_update'), ('properties_staff_permission_delete'),
    ('news_staff_permission_select'), ('news_staff_permission_insert'),
    ('news_staff_permission_update'), ('news_staff_permission_delete'),
    ('user_listings_admin_select'), ('user_listings_admin_update')
  ) AS expected(policy_name)
), table_access AS (
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'table_name', t.table_name,
    'anon_select', has_table_privilege('anon', format('public.%I', t.table_name), 'SELECT'),
    'authenticated_select', has_table_privilege('authenticated', format('public.%I', t.table_name), 'SELECT')
  ) ORDER BY t.table_name), '[]'::jsonb) AS value
  FROM (VALUES ('staff_permission_catalog'), ('staff_permission_assignments'), ('staff_permission_audit')) AS t(table_name)
)
SELECT jsonb_build_object(
  'counts', jsonb_build_object(
    'staff_accounts', (SELECT count(*)::integer FROM public.profiles WHERE role = 'staff'),
    'catalog_rows', (SELECT count(*)::integer FROM public.staff_permission_catalog),
    'assignment_rows', (SELECT assignment_rows FROM assignment_integrity),
    'audit_rows', (SELECT count(*)::integer FROM public.staff_permission_audit)
  ),
  'integrity', jsonb_build_object(
    'non_staff_or_missing_profile_rows', (SELECT non_staff_rows FROM assignment_integrity),
    'missing_catalog_rows', (SELECT missing_catalog_rows FROM assignment_integrity),
    'invalid_scope_rows', (SELECT invalid_scope_rows FROM assignment_integrity),
    'duplicate_assignment_groups', (SELECT issue_count FROM duplicate_groups)
  ),
  'policy_presence', jsonb_build_object(
    'expected', (SELECT count(*)::integer FROM expected_policies),
    'present', (SELECT count(*)::integer FROM expected_policies WHERE present),
    'missing', coalesce((SELECT jsonb_agg(policy_name ORDER BY policy_name) FROM expected_policies WHERE NOT present), '[]'::jsonb)
  ),
  'permission_functions', (SELECT value FROM function_inventory),
  'permission_table_access', (SELECT value FROM table_access)
) AS phase_e_staff_permission_preflight;

ROLLBACK;
