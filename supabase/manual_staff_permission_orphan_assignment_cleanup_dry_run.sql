-- =============================================================================
-- Staff permission orphan-assignment cleanup — dry-run, read-only
--
-- Target measured on production 2026-09-13:
--   profile 7968e31d-39c4-437c-8ad9-6c62b0a4f6de has role "user"
--   but owns three global News assignments: view, create, manage_seo.
--
-- Does NOT write data or change permissions. Run before the cleanup migration.
-- Production SQL is run by the user.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH target_ids(id) AS (
  VALUES
    ('027cc931-7331-4f60-a306-b697300bfc58'::uuid),
    ('4b15de95-c921-481f-8f31-a2a2b5f55a44'::uuid),
    ('722f2b1c-5e61-485d-afcc-a1d48b360646'::uuid)
), target_profile AS (
  SELECT id, role
  FROM public.profiles
  WHERE id = '7968e31d-39c4-437c-8ad9-6c62b0a4f6de'::uuid
), target_rows AS (
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
    (
      a.staff_user_id = '7968e31d-39c4-437c-8ad9-6c62b0a4f6de'::uuid
      AND p.role = 'user'
      AND a.module = 'news'
      AND a.action IN ('view', 'create', 'manage_seo')
      AND a.scope_kind = 'global'
      AND a.scope_id IS NULL
      AND a.granted_by = '40e96dc2-ddf9-4644-a794-8567179e23ea'::uuid
      AND a.created_at = '2026-09-08T12:59:02.527468+00:00'::timestamptz
    ) AS exact_expected_shape
  FROM target_ids t
  LEFT JOIN public.staff_permission_assignments a ON a.id = t.id
  LEFT JOIN public.profiles p ON p.id = a.staff_user_id
), expected_actions(action) AS (
  VALUES ('view'::text), ('create'::text), ('manage_seo'::text)
)
SELECT jsonb_build_object(
  'profile', coalesce((SELECT to_jsonb(p) FROM target_profile p), 'null'::jsonb),
  'target_ids_expected', 3,
  'target_ids_found', (SELECT count(*)::integer FROM target_rows WHERE staff_user_id IS NOT NULL),
  'exact_shape_rows', (SELECT count(*)::integer FROM target_rows WHERE exact_expected_shape),
  'unexpected_shape_rows', (SELECT count(*)::integer FROM target_rows WHERE staff_user_id IS NOT NULL AND NOT exact_expected_shape),
  'target_user_total_assignments', (
    SELECT count(*)::integer
    FROM public.staff_permission_assignments
    WHERE staff_user_id = '7968e31d-39c4-437c-8ad9-6c62b0a4f6de'::uuid
  ),
  'missing_expected_actions', coalesce((
    SELECT jsonb_agg(e.action ORDER BY e.action)
    FROM expected_actions e
    WHERE NOT EXISTS (
      SELECT 1 FROM target_rows t
      WHERE t.action = e.action AND t.exact_expected_shape
    )
  ), '[]'::jsonb),
  'target_rows', coalesce((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.action)
    FROM target_rows t
  ), '[]'::jsonb),
  'ready_to_apply', (
    (SELECT count(*) FROM target_profile WHERE role = 'user') = 1
    AND (SELECT count(*) FROM target_rows WHERE staff_user_id IS NOT NULL) = 3
    AND (SELECT count(*) FROM target_rows WHERE exact_expected_shape) = 3
    AND (SELECT count(*) FROM target_rows WHERE staff_user_id IS NOT NULL AND NOT exact_expected_shape) = 0
    AND (SELECT count(*) FROM public.staff_permission_assignments
         WHERE staff_user_id = '7968e31d-39c4-437c-8ad9-6c62b0a4f6de'::uuid) = 3
  )
) AS staff_permission_orphan_cleanup_dry_run;

ROLLBACK;
