ALTER TABLE properties
  ADD COLUMN IF NOT EXISTS faq jsonb;

ALTER TABLE user_listings
  ADD COLUMN IF NOT EXISTS faq jsonb;

NOTIFY pgrst, 'reload schema';
