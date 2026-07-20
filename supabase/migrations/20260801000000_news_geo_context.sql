ALTER TABLE news
  ADD COLUMN IF NOT EXISTS geo_area text,
  ADD COLUMN IF NOT EXISTS geo_entity text,
  ADD COLUMN IF NOT EXISTS geo_notes text;

NOTIFY pgrst, 'reload schema';
