ALTER TABLE properties ADD COLUMN IF NOT EXISTS is_verified boolean NOT NULL DEFAULT false;

NOTIFY pgrst, 'reload schema';
