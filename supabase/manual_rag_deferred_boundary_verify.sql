-- =============================================================================
-- Deferred RAG execution boundary verification — read-only
--
-- Run after applying 20260930100000_defer_rag_browser_execution.sql.
-- Confirms refresh_rag_index remains available to the server service role but
-- is no longer directly callable by browser roles. Does not rebuild/backfill
-- RAG, modify data, or change privileges.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

SELECT jsonb_build_object(
  'function', jsonb_build_object(
    'exists', to_regprocedure('public.refresh_rag_index(text)') IS NOT NULL,
    'security_definer', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.refresh_rag_index(text)'))
    END,
    'search_path', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN NULL
      ELSE (SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure('public.refresh_rag_index(text)'))
    END,
    'service_role_guard', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE pg_get_functiondef(to_regprocedure('public.refresh_rag_index(text)'))
        LIKE '%coalesce(auth.role(), '''') = ''service_role''%'
    END,
    'owner_mfa_guard_preserved', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE pg_get_functiondef(to_regprocedure('public.refresh_rag_index(text)'))
        LIKE '%public.is_owner_mfa()%'
    END
  ),
  'privileges', jsonb_build_object(
    'service_role_can_execute', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE has_function_privilege('service_role', 'public.refresh_rag_index(text)', 'EXECUTE')
    END,
    'authenticated_can_execute', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE has_function_privilege('authenticated', 'public.refresh_rag_index(text)', 'EXECUTE')
    END,
    'anon_can_execute', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE has_function_privilege('anon', 'public.refresh_rag_index(text)', 'EXECUTE')
    END,
    'public_can_execute', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE has_function_privilege('public', 'public.refresh_rag_index(text)', 'EXECUTE')
    END
  ),
  'deferred_boundary_ok', CASE
    WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
    ELSE has_function_privilege('service_role', 'public.refresh_rag_index(text)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.refresh_rag_index(text)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.refresh_rag_index(text)', 'EXECUTE')
      AND NOT has_function_privilege('public', 'public.refresh_rag_index(text)', 'EXECUTE')
  END
) AS rag_deferred_boundary_verification;

ROLLBACK;
