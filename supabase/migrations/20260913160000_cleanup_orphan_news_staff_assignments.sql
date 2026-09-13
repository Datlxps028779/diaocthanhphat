-- Remove three stale News permission assignments from a profile whose current
-- role is "user", not "staff". Production evidence was measured on 2026-09-13.
--
-- Safety: abort unless the profile role, exact assignment ids, grantor, timestamp,
-- module/actions/scope and total assignment count still match the measured state.
-- This migration does not change the profile role or any permission policy.

DO $$
DECLARE
  v_profile_role text;
  v_target_count integer;
  v_exact_count integer;
  v_user_assignment_count integer;
  v_deleted_count integer;
BEGIN
  SELECT role INTO v_profile_role
  FROM public.profiles
  WHERE id = '7968e31d-39c4-437c-8ad9-6c62b0a4f6de'::uuid;

  IF v_profile_role IS DISTINCT FROM 'user' THEN
    RAISE EXCEPTION 'Cleanup aborted: target profile role changed (current=%)', v_profile_role;
  END IF;

  SELECT count(*) INTO v_target_count
  FROM public.staff_permission_assignments
  WHERE id IN (
    '027cc931-7331-4f60-a306-b697300bfc58'::uuid,
    '4b15de95-c921-481f-8f31-a2a2b5f55a44'::uuid,
    '722f2b1c-5e61-485d-afcc-a1d48b360646'::uuid
  );

  SELECT count(*) INTO v_exact_count
  FROM public.staff_permission_assignments
  WHERE id IN (
    '027cc931-7331-4f60-a306-b697300bfc58'::uuid,
    '4b15de95-c921-481f-8f31-a2a2b5f55a44'::uuid,
    '722f2b1c-5e61-485d-afcc-a1d48b360646'::uuid
  )
    AND staff_user_id = '7968e31d-39c4-437c-8ad9-6c62b0a4f6de'::uuid
    AND module = 'news'
    AND action IN ('view', 'create', 'manage_seo')
    AND scope_kind = 'global'
    AND scope_id IS NULL
    AND granted_by = '40e96dc2-ddf9-4644-a794-8567179e23ea'::uuid
    AND created_at = '2026-09-08T12:59:02.527468+00:00'::timestamptz;

  SELECT count(*) INTO v_user_assignment_count
  FROM public.staff_permission_assignments
  WHERE staff_user_id = '7968e31d-39c4-437c-8ad9-6c62b0a4f6de'::uuid;

  IF v_target_count <> 3 OR v_exact_count <> 3 OR v_user_assignment_count <> 3 THEN
    RAISE EXCEPTION
      'Cleanup aborted: state drifted (target_count=%, exact_count=%, user_assignment_count=%)',
      v_target_count, v_exact_count, v_user_assignment_count;
  END IF;

  DELETE FROM public.staff_permission_assignments
  WHERE id IN (
    '027cc931-7331-4f60-a306-b697300bfc58'::uuid,
    '4b15de95-c921-481f-8f31-a2a2b5f55a44'::uuid,
    '722f2b1c-5e61-485d-afcc-a1d48b360646'::uuid
  )
    AND staff_user_id = '7968e31d-39c4-437c-8ad9-6c62b0a4f6de'::uuid
    AND module = 'news'
    AND action IN ('view', 'create', 'manage_seo')
    AND scope_kind = 'global'
    AND scope_id IS NULL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  IF v_deleted_count <> 3 THEN
    RAISE EXCEPTION 'Cleanup aborted: expected to delete 3 assignments, deleted %', v_deleted_count;
  END IF;
END;
$$;
