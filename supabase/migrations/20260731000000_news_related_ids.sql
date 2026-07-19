-- Manual + auto related articles for news.
-- Additive and idempotent: adds an ordered array of related article ids.

ALTER TABLE news ADD COLUMN IF NOT EXISTS related_ids uuid[];

NOTIFY pgrst, 'reload schema';
