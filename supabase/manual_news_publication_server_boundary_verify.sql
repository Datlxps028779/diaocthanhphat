-- =============================================================================
-- News publication server boundary verification — read-only
--
-- Run after applying 20260911010000_harden_news_publication_server_boundary.sql.
-- This confirms the server-only RPC exists, browser roles cannot execute it,
-- the legacy RPC is not executable by browser roles, and the event table exists.
-- It does not publish/unpublish content and does not change privileges.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

SELECT jsonb_build_object(
  'new_rpc', jsonb_build_object(
    'exists', to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NOT NULL,
    'security_definer', CASE
      WHEN to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NULL THEN false
      ELSE (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)'))
    END,
    'search_path', CASE
      WHEN to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NULL THEN NULL
      ELSE (SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)'))
    END,
    'service_role_can_execute', CASE
      WHEN to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NULL THEN false
      ELSE has_function_privilege('service_role', 'public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)', 'EXECUTE')
    END,
    'anon_can_execute', CASE
      WHEN to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NULL THEN false
      ELSE has_function_privilege('anon', 'public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)', 'EXECUTE')
    END,
    'authenticated_can_execute', CASE
      WHEN to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NULL THEN false
      ELSE has_function_privilege('authenticated', 'public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)', 'EXECUTE')
    END
  ),
  'legacy_rpc', jsonb_build_object(
    'exists', to_regprocedure('public.publish_news_article(uuid,bigint,boolean,jsonb,jsonb)') IS NOT NULL,
    'anon_can_execute', CASE
      WHEN to_regprocedure('public.publish_news_article(uuid,bigint,boolean,jsonb,jsonb)') IS NULL THEN false
      ELSE has_function_privilege('anon', 'public.publish_news_article(uuid,bigint,boolean,jsonb,jsonb)', 'EXECUTE')
    END,
    'authenticated_can_execute', CASE
      WHEN to_regprocedure('public.publish_news_article(uuid,bigint,boolean,jsonb,jsonb)') IS NULL THEN false
      ELSE has_function_privilege('authenticated', 'public.publish_news_article(uuid,bigint,boolean,jsonb,jsonb)', 'EXECUTE')
    END,
    'service_role_can_execute', CASE
      WHEN to_regprocedure('public.publish_news_article(uuid,bigint,boolean,jsonb,jsonb)') IS NULL THEN false
      ELSE has_function_privilege('service_role', 'public.publish_news_article(uuid,bigint,boolean,jsonb,jsonb)', 'EXECUTE')
    END
  ),
  'publication_events_table_exists', to_regclass('public.news_publication_events') IS NOT NULL,
  'content_version_column_exists', EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'news'
      AND column_name = 'content_version'
  )
) AS news_publication_server_boundary_verification;

ROLLBACK;
