-- =============================================================================
-- Gate 0 follow-up: allow the server wrapper to invoke the legacy RAG builder
--
-- Production SQL is run by the user.
-- The previous wrapper correctly accepts service_role, but the legacy function
-- retained its original is_admin() guard after it was renamed. Re-create that
-- function from its deployed definition and change only that guard.
-- This does not change is_admin() globally or grant the legacy function to
-- anon/authenticated.
-- =============================================================================

BEGIN;

DO $$
DECLARE
  function_definition text;
BEGIN
  IF to_regprocedure('public.refresh_rag_index_legacy(text)') IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy public.refresh_rag_index_legacy(text)';
  END IF;

  SELECT pg_get_functiondef(
    'public.refresh_rag_index_legacy(text)'::regprocedure
  )
  INTO function_definition;

  IF position('IF NOT is_admin() THEN' IN function_definition) = 0 THEN
    RAISE EXCEPTION 'Guard legacy RAG không khớp mẫu đã kiểm định; dừng để tránh thay thế mù';
  END IF;

  function_definition := replace(
    function_definition,
    'IF NOT is_admin() THEN',
    $guard$IF NOT (is_admin() OR coalesce(auth.role(), '') = 'service_role') THEN$guard$
  );

  EXECUTE function_definition;
END;
$$;

REVOKE ALL ON FUNCTION public.refresh_rag_index_legacy(text)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Read-only post-apply checks:
-- SELECT
--   p.oid::regprocedure AS function_name,
--   p.prosecdef AS security_definer,
--   p.proconfig,
--   has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
--   has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
--   has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_role_execute
-- FROM pg_proc p
-- JOIN pg_namespace n ON n.oid = p.pronamespace
-- WHERE n.nspname = 'public'
--   AND p.proname = 'refresh_rag_index_legacy'
--   AND pg_get_function_identity_arguments(p.oid) = 'target text';
