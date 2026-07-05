ALTER TABLE properties ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE user_listings ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';
ALTER TABLE properties ADD COLUMN IF NOT EXISTS meta_title text;
ALTER TABLE properties ADD COLUMN IF NOT EXISTS meta_description text;
