-- =============================================================================
-- Defer RAG execution outside the SEO/Search/AIO-first rollout.
--
-- Keeps refresh_rag_index as the future server-side RAG adapter target, but
-- removes direct browser execution. Public indexing must not depend on RAG;
-- the application server may reconnect this boundary only when the RAG slice
-- is explicitly approved.
--
-- Production SQL is run by the user after review. This migration does not
-- rebuild or backfill rag_chunks.
-- =============================================================================

BEGIN;

REVOKE ALL ON FUNCTION public.refresh_rag_index(text)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.refresh_rag_index(text)
  TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
