-- =============================================================================
-- Staff permission orphan-assignment cleanup — post-run verification, read-only
--
-- Run after migration 20260913160000_cleanup_orphan_news_staff_assignments.sql.
-- Does NOT write data or change permissions.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

SELECT jsonb_build_object(
  'target_profile_role', (
    SELECT role FROM public.profiles
    WHERE id = '7968e31d-39c4-437c-8ad9-6c62b0a4f6de'::uuid
  ),
  'target_assignment_ids_remaining', (
    SELECT count(*)::integer
    FROM public.staff_permission_assignments
    WHERE id IN (
      '027cc931-7331-4f60-a306-b697300bfc58'::uuid,
      '4b15de95-c921-481f-8f31-a2a2b5f55a44'::uuid,
      '722f2b1c-5e61-485d-afcc-a1d48b360646'::uuid
    )
  ),
  'target_user_assignments_remaining', (
    SELECT count(*)::integer
    FROM public.staff_permission_assignments
    WHERE staff_user_id = '7968e31d-39c4-437c-8ad9-6c62b0a4f6de'::uuid
  ),
  'all_non_staff_assignment_rows', (
    SELECT count(*)::integer
    FROM public.staff_permission_assignments a
    LEFT JOIN public.profiles p ON p.id = a.staff_user_id
    WHERE p.id IS NULL OR p.role IS DISTINCT FROM 'staff'
  ),
  'cleanup_ok', (
    (SELECT role FROM public.profiles
     WHERE id = '7968e31d-39c4-437c-8ad9-6c62b0a4f6de'::uuid) = 'user'
    AND NOT EXISTS (
      SELECT 1 FROM public.staff_permission_assignments
      WHERE id IN (
        '027cc931-7331-4f60-a306-b697300bfc58'::uuid,
        '4b15de95-c921-481f-8f31-a2a2b5f55a44'::uuid,
        '722f2b1c-5e61-485d-afcc-a1d48b360646'::uuid
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.staff_permission_assignments a
      LEFT JOIN public.profiles p ON p.id = a.staff_user_id
      WHERE p.id IS NULL OR p.role IS DISTINCT FROM 'staff'
    )
  )
) AS staff_permission_orphan_cleanup_verify;

ROLLBACK;
