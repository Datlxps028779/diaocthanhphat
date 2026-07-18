-- Add district/ward filters for homepage featured sections.
-- This lets admin narrow auto sections from province/area down to district and ward.

ALTER TABLE featured_sections ADD COLUMN IF NOT EXISTS filter_district text;
ALTER TABLE featured_sections ADD COLUMN IF NOT EXISTS filter_ward text;

CREATE INDEX IF NOT EXISTS idx_featured_sections_geo_filters
  ON featured_sections(filter_area_id, filter_district, filter_ward)
  WHERE mode = 'auto' AND is_active = true;

NOTIFY pgrst, 'reload schema';
