-- =============================================================================
-- News publication boundary trigger verification — read-only
--
-- Run after applying 20260930090000_fix_news_publication_boundary_trigger.sql.
-- Confirms the trigger preserves browser/staff scope checks while allowing only
-- the service-role publication boundary to pass. It does not publish/unpublish
-- content, modify data, or change privileges.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

SELECT jsonb_build_object(
  'trigger_function', jsonb_build_object(
    'exists', to_regprocedure('public.enforce_staff_content_permission()') IS NOT NULL,
    'security_definer', CASE
      WHEN to_regprocedure('public.enforce_staff_content_permission()') IS NULL THEN false
      ELSE (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.enforce_staff_content_permission()'))
    END,
    'search_path', CASE
      WHEN to_regprocedure('public.enforce_staff_content_permission()') IS NULL THEN NULL
      ELSE (SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure('public.enforce_staff_content_permission()'))
    END,
    'has_service_role_boundary_guard', CASE
      WHEN to_regprocedure('public.enforce_staff_content_permission()') IS NULL THEN false
      ELSE pg_get_functiondef(to_regprocedure('public.enforce_staff_content_permission()'))
        LIKE '%current_setting(''app.news_publication_boundary'', true) = ''allowed''%'
    END,
    'requires_service_role', CASE
      WHEN to_regprocedure('public.enforce_staff_content_permission()') IS NULL THEN false
      ELSE pg_get_functiondef(to_regprocedure('public.enforce_staff_content_permission()'))
        LIKE '%coalesce(auth.role(), '''') = ''service_role''%'
    END,
    'retains_staff_scope_check', CASE
      WHEN to_regprocedure('public.enforce_staff_content_permission()') IS NULL THEN false
      ELSE pg_get_functiondef(to_regprocedure('public.enforce_staff_content_permission()'))
        LIKE '%public.has_staff_permission(v_module, ''edit''%'
    END
  ),
  'news_trigger_exists', EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.news'::regclass
      AND tgname = 'trg_staff_news_permission'
      AND NOT tgisinternal
  ),
  'publication_rpc_sets_boundary', CASE
    WHEN to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NULL THEN false
    ELSE pg_get_functiondef(to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)'))
      LIKE '%set_config(''app.news_publication_boundary'', ''allowed'', true)%'
  END,
  'publication_rpc_remains_service_only', CASE
    WHEN to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NULL THEN false
    ELSE has_function_privilege('service_role', 'public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)', 'EXECUTE')
      AND NOT has_function_privilege('anon', 'public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)', 'EXECUTE')
      AND NOT has_function_privilege('authenticated', 'public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)', 'EXECUTE')
  END
) AS news_publication_boundary_trigger_verification;

ROLLBACK;
