-- =============================================================================
-- News publication RPC ambiguity hotfix verification — read-only
--
-- Run after applying 20260912010000_fix_news_publication_rpc_id_ambiguity.sql.
-- Confirms the deployed server-only RPC uses qualified relation columns and
-- preserves the service-role boundary. It does not publish/unpublish content,
-- change privileges, or modify data.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

SELECT jsonb_build_object(
  'rpc_exists', to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NOT NULL,
  'actor_profile_id_qualified', CASE
    WHEN to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NULL THEN false
    ELSE pg_get_functiondef(to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)'))
      LIKE '%FROM public.profiles AS profile%WHERE profile.id = p_actor_id%'
  END,
  'news_select_id_qualified', CASE
    WHEN to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NULL THEN false
    ELSE pg_get_functiondef(to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)'))
      LIKE '%FROM public.news AS n%WHERE n.id = p_news_id%'
  END,
  'news_update_id_qualified', CASE
    WHEN to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NULL THEN false
    ELSE pg_get_functiondef(to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)'))
      LIKE '%UPDATE public.news AS n%WHERE n.id = current_news.id%'
  END,
  'service_role_guard', CASE
    WHEN to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NULL THEN false
    ELSE pg_get_functiondef(to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)'))
      LIKE '%coalesce(auth.role(), '''') <> ''service_role''%'
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
) AS news_publication_rpc_ambiguity_verification;

ROLLBACK;
