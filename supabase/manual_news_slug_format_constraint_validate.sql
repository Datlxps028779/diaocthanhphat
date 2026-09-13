-- =============================================================================
-- Validate News slug format constraint, guarded production schema step
--
-- Run only after the read-only slug audit reports zero invalid published rows
-- and all legacy malformed rows have been corrected. This changes only the
-- constraint validation state; it does not repair data or change publication
-- state. It does not call Google, AI, RAG, or invoke a worker.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint AS c
    JOIN pg_class AS r ON r.oid = c.conrelid
    JOIN pg_namespace AS n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'news'
      AND c.conname = 'news_slug_format'
  ) THEN
    RAISE EXCEPTION 'Constraint public.news_slug_format chưa tồn tại; hãy chạy migration hardening trước.'
      USING ERRCODE = '42704';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.news AS n
    WHERE (
      n.is_published IS TRUE
      AND btrim(coalesce(n.slug, '')) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
    OR (
      n.is_published IS NOT TRUE
      AND n.slug IS NOT NULL
      AND n.slug <> ''
      AND n.slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    )
  ) THEN
    RAISE EXCEPTION 'Còn News slug không hợp lệ; không validate constraint. Chạy audit và xử lý từng row trước.'
      USING ERRCODE = '23514';
  END IF;

  ALTER TABLE public.news VALIDATE CONSTRAINT news_slug_format;
END;
$$;

SELECT jsonb_build_object(
  'validated_at', now(),
  'constraint', 'public.news_slug_format',
  'validated', convalidated,
  'does_not_repair_data', true,
  'does_not_call_ai_or_rag', true
) AS news_slug_format_constraint_validation
FROM pg_constraint AS c
JOIN pg_class AS r ON r.oid = c.conrelid
JOIN pg_namespace AS n ON n.oid = r.relnamespace
WHERE n.nspname = 'public'
  AND r.relname = 'news'
  AND c.conname = 'news_slug_format';

COMMIT;
