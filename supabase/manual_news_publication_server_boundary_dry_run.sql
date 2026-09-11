-- Read-only preflight for 20260911010000_harden_news_publication_server_boundary.sql.
-- Does not write data or change privileges. Run in Supabase SQL Editor before
-- installing the migration; production SQL is run by the user.
-- Before migration, new_rpc.exists=false is expected and must not be an error.

BEGIN TRANSACTION READ ONLY;

SELECT jsonb_build_object(
  'old_rpc', jsonb_build_object(
    'exists', to_regprocedure('public.publish_news_article(uuid,bigint,boolean,jsonb,jsonb)') IS NOT NULL,
    'authenticated_can_execute', CASE
      WHEN to_regprocedure('public.publish_news_article(uuid,bigint,boolean,jsonb,jsonb)') IS NULL THEN false
      ELSE has_function_privilege(
        'authenticated',
        'public.publish_news_article(uuid,bigint,boolean,jsonb,jsonb)',
        'EXECUTE'
      )
    END,
    'anon_can_execute', CASE
      WHEN to_regprocedure('public.publish_news_article(uuid,bigint,boolean,jsonb,jsonb)') IS NULL THEN false
      ELSE has_function_privilege(
        'anon',
        'public.publish_news_article(uuid,bigint,boolean,jsonb,jsonb)',
        'EXECUTE'
      )
    END
  ),
  'new_rpc', jsonb_build_object(
    'exists', to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NOT NULL,
    'service_role_can_execute', CASE
      WHEN to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NULL THEN false
      ELSE has_function_privilege(
        'service_role',
        'public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)',
        'EXECUTE'
      )
    END,
    'authenticated_can_execute', CASE
      WHEN to_regprocedure('public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)') IS NULL THEN false
      ELSE has_function_privilege(
        'authenticated',
        'public.publish_news_article_server(uuid,bigint,boolean,uuid,jsonb,jsonb)',
        'EXECUTE'
      )
    END
  ),
  'owner_profiles', (
    SELECT count(*)
    FROM public.profiles
    WHERE role = 'admin'
  ),
  'news_content_version', jsonb_build_object(
    'column_exists', EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'news'
        AND column_name = 'content_version'
    ),
    'rows', (SELECT count(*) FROM public.news),
    'invalid_rows', (SELECT count(*) FROM public.news WHERE content_version IS NULL OR content_version < 1)
  )
) AS news_publication_server_boundary_preflight;

COMMIT;
