-- Read-only dry-run for 20260831000000_news_eeat_metadata.sql.
-- Run in the production Supabase SQL editor; this file performs no writes.

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'news'
  AND column_name IN (
    'author_type', 'author_role', 'published_at', 'as_of_date',
    'reviewer_name', 'reviewer_role', 'source_note'
  )
ORDER BY ordinal_position;

SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.news'::regclass
  AND conname = 'news_author_type_check';

SELECT
  count(*) AS total_articles,
  count(*) FILTER (WHERE is_published) AS published_articles,
  count(*) FILTER (WHERE is_published AND nullif(trim(author), '') IS NOT NULL) AS published_with_legacy_author,
  count(*) FILTER (WHERE is_published AND citations IS NOT NULL AND jsonb_typeof(citations) = 'array' AND jsonb_array_length(citations) > 0) AS published_with_citations,
  count(*) FILTER (WHERE is_published AND nullif(trim(published_at::text), '') IS NOT NULL) AS published_with_publication_date,
  count(*) FILTER (WHERE is_published AND nullif(trim(as_of_date::text), '') IS NOT NULL) AS published_with_as_of_date,
  count(*) FILTER (WHERE is_published AND nullif(trim(reviewer_name), '') IS NOT NULL) AS published_with_reviewer
FROM public.news;

SELECT id, title, is_published, author, created_at, updated_at,
       citations, author_type, author_role, published_at, as_of_date,
       reviewer_name, reviewer_role, source_note
FROM public.news
WHERE is_published
ORDER BY updated_at DESC NULLS LAST
LIMIT 100;
