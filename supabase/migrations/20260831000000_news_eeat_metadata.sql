-- E-E-A-T metadata for news articles.
-- Additive only: no existing row is backfilled and no editorial identity is invented.
ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS author_type text NOT NULL DEFAULT 'Organization',
  ADD COLUMN IF NOT EXISTS author_role text,
  ADD COLUMN IF NOT EXISTS published_at timestamptz,
  ADD COLUMN IF NOT EXISTS as_of_date date,
  ADD COLUMN IF NOT EXISTS reviewer_name text,
  ADD COLUMN IF NOT EXISTS reviewer_role text,
  ADD COLUMN IF NOT EXISTS source_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'news_author_type_check'
      AND conrelid = 'public.news'::regclass
  ) THEN
    ALTER TABLE public.news
      ADD CONSTRAINT news_author_type_check
      CHECK (author_type IN ('Person', 'Organization'));
  END IF;
END $$;

COMMENT ON COLUMN public.news.author_type IS 'Schema.org author type: Person or Organization; do not infer for existing rows.';
COMMENT ON COLUMN public.news.author_role IS 'Editorial role shown with the author when explicitly verified.';
COMMENT ON COLUMN public.news.published_at IS 'Editorial publication timestamp; separate from created_at.';
COMMENT ON COLUMN public.news.as_of_date IS 'Date through which factual data in the article is valid.';
COMMENT ON COLUMN public.news.reviewer_name IS 'Named reviewer only when an actual review occurred.';
COMMENT ON COLUMN public.news.reviewer_role IS 'Verified role of the reviewer.';
COMMENT ON COLUMN public.news.source_note IS 'Short editorial note describing source/review context.';
