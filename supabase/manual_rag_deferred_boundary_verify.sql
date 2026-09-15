-- =============================================================================
-- Deferred RAG boundary verification — read-only
--
-- Production SQL is run by the user. This script does not refresh, rebuild,
-- mutate data, or change privileges.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

SELECT jsonb_build_object(
  'refresh_rpc', jsonb_build_object(
    'exists', to_regprocedure('public.refresh_rag_index(text)') IS NOT NULL,
    'security_definer', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE (SELECT prosecdef FROM pg_proc WHERE oid = to_regprocedure('public.refresh_rag_index(text)'))
    END,
    'search_path', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN NULL
      ELSE (SELECT proconfig FROM pg_proc WHERE oid = to_regprocedure('public.refresh_rag_index(text)'))
    END,
    'anon_can_execute', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE has_function_privilege('anon', 'public.refresh_rag_index(text)', 'EXECUTE')
    END,
    'authenticated_can_execute', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE has_function_privilege('authenticated', 'public.refresh_rag_index(text)', 'EXECUTE')
    END,
    'service_role_can_execute', CASE
      WHEN to_regprocedure('public.refresh_rag_index(text)') IS NULL THEN false
      ELSE has_function_privilege('service_role', 'public.refresh_rag_index(text)', 'EXECUTE')
    END
  ),
  'knowledge_schema', jsonb_build_object(
    'knowledge_type_exists', EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ai_chat_knowledge'
        AND column_name = 'knowledge_type'
    ),
    'active_rows', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'id', k.id,
        'topic', k.topic,
        'knowledge_type', to_jsonb(k)->>'knowledge_type',
        'is_active', k.is_active
      ) ORDER BY k.topic, k.id)
      FROM public.ai_chat_knowledge k
      WHERE k.is_active = true
    ), '[]'::jsonb)
  ),
  'public_rag_chunks', coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'source_table', grouped.source_table,
      'visibility', grouped.visibility,
      'chunk_count', grouped.chunk_count
    ) ORDER BY grouped.source_table, grouped.visibility)
    FROM (
      SELECT source_table, visibility, count(*)::integer AS chunk_count
      FROM public.rag_chunks
      GROUP BY source_table, visibility
    ) grouped
  ), '[]'::jsonb),
  'admin_docs_public_chunk_count', (
    SELECT count(*)::integer
    FROM public.rag_chunks
    WHERE source_table = 'admin_docs' AND visibility = 'public'
  ),
  'public_knowledge_policy_violation_count', CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'ai_chat_knowledge'
        AND column_name = 'knowledge_type'
    ) THEN (
      SELECT count(*)::integer
      FROM public.rag_chunks c
      JOIN public.ai_chat_knowledge k ON k.id = c.source_id
      WHERE c.source_table = 'ai_chat_knowledge'
        AND c.visibility = 'public'
        AND (to_jsonb(k)->>'knowledge_type') NOT IN ('priority_qa', 'background')
    )
    ELSE -1
  END
) AS deferred_rag_boundary_verify;

ROLLBACK;
