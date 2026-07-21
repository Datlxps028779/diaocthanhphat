ALTER TABLE news
  ADD COLUMN IF NOT EXISTS faq jsonb;

NOTIFY pgrst, 'reload schema';
