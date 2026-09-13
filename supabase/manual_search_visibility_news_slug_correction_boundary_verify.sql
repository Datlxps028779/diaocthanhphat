-- =============================================================================
-- News slug correction server boundary verification, read-only
--
-- Run after 20260930110000_news_slug_correction_server_boundary.sql. This only
-- verifies that the narrow RPC, trigger boundary, and role grants are present.
-- It does not update News, call the RPC, revalidate paths, sync Search
-- Visibility, call Google, call AI, read RAG, or invoke a worker.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH rpc AS (
  SELECT to_regprocedure('public.correct_news_slug_server(uuid,text,text,uuid)') AS signature
), trigger_info AS (
  SELECT
    t.tgname AS trigger_name,
    pg_get_triggerdef(t.oid) AS trigger_definition,
    p.oid::regprocedure AS trigger_function
  FROM pg_trigger AS t
  JOIN pg_class AS c ON c.oid = t.tgrelid
  JOIN pg_namespace AS n ON n.oid = c.relnamespace
  JOIN pg_proc AS p ON p.oid = t.tgfoid
  WHERE n.nspname = 'public'
    AND c.relname = 'news'
    AND t.tgname = 'trg_staff_news_permission'
    AND NOT t.tgisinternal
), rpc_acl AS (
  SELECT
    has_function_privilege('service_role', 'public.correct_news_slug_server(uuid,text,text,uuid)', 'EXECUTE') AS service_role_can_execute,
    has_function_privilege('anon', 'public.correct_news_slug_server(uuid,text,text,uuid)', 'EXECUTE') AS anon_can_execute,
    has_function_privilege('authenticated', 'public.correct_news_slug_server(uuid,text,text,uuid)', 'EXECUTE') AS authenticated_can_execute
), function_definition AS (
  SELECT pg_get_functiondef(rpc.signature) AS definition
  FROM rpc
  WHERE rpc.signature IS NOT NULL
)
SELECT jsonb_build_object(
  'generated_at', now(),
  'rpc', jsonb_build_object(
    'exists', (SELECT signature IS NOT NULL FROM rpc),
    'service_role_can_execute', (SELECT service_role_can_execute FROM rpc_acl),
    'anon_can_execute', (SELECT anon_can_execute FROM rpc_acl),
    'authenticated_can_execute', (SELECT authenticated_can_execute FROM rpc_acl),
    'is_security_definer', (
      SELECT p.prosecdef
      FROM pg_proc AS p
      JOIN rpc ON p.oid = rpc.signature
    )
  ),
  'trigger', coalesce((
    SELECT jsonb_build_object(
      'exists', true,
      'trigger_name', trigger_name,
      'trigger_function', trigger_function,
      'contains_slug_boundary', (
        SELECT position('app.news_slug_correction_boundary' IN definition) > 0
        FROM function_definition
      )
    )
    FROM trigger_info
  ), jsonb_build_object('exists', false)),
  'boundary_contract_ok',
    (SELECT signature IS NOT NULL FROM rpc)
    AND (SELECT service_role_can_execute FROM rpc_acl)
    AND NOT (SELECT anon_can_execute FROM rpc_acl)
    AND NOT (SELECT authenticated_can_execute FROM rpc_acl)
    AND (SELECT p.prosecdef FROM pg_proc AS p JOIN rpc ON p.oid = rpc.signature)
    AND EXISTS (
      SELECT 1
      FROM function_definition
      WHERE position('app.news_slug_correction_boundary' IN definition) > 0
    ),
  'does_not_mutate', true,
  'does_not_prove', 'Không chứng minh slug đã được sửa hoặc Google đã crawl/index URL; không liên quan đến AI/RAG.'
) AS news_slug_correction_boundary_verification;

ROLLBACK;
