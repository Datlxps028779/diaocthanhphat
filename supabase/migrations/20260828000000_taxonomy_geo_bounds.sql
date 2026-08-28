-- =============================================================================
-- Taxonomy Geo: geometry/bounds gắn với ID hành chính cũ 3 cấp
-- =============================================================================
-- Migration này chỉ tạo cấu trúc. Không tự nạp dữ liệu polygon và không tự sửa
-- areas/districts/wards. Seed geometry phải được tạo từ nguồn polygon có giấy phép
-- phù hợp, đối chiếu với path 3 cấp trong DB, rồi user tự chạy SQL seed.

CREATE TABLE IF NOT EXISTS public.taxonomy_geo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('area', 'district', 'ward')),
  entity_id uuid NOT NULL,
  bounds jsonb NOT NULL CHECK (
    jsonb_typeof(bounds) = 'object'
    AND (bounds->>'south')::numeric >= -90
    AND (bounds->>'north')::numeric <= 90
    AND (bounds->>'west')::numeric >= -180
    AND (bounds->>'east')::numeric <= 180
    AND (bounds->>'south')::numeric < (bounds->>'north')::numeric
    AND (bounds->>'west')::numeric < (bounds->>'east')::numeric
  ),
  center_lat numeric,
  center_lng numeric,
  geojson jsonb,
  source text NOT NULL,
  source_year integer,
  administrative_vintage text NOT NULL DEFAULT 'legacy_pre_merger',
  is_published boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id),
  CHECK (center_lat IS NULL OR center_lat BETWEEN -90 AND 90),
  CHECK (center_lng IS NULL OR center_lng BETWEEN -180 AND 180),
  CHECK (geojson IS NULL OR jsonb_typeof(geojson) IN ('object', 'array'))
);

CREATE INDEX IF NOT EXISTS taxonomy_geo_entity_lookup_idx
  ON public.taxonomy_geo (entity_type, entity_id)
  WHERE is_published = true;

ALTER TABLE public.taxonomy_geo ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "taxonomy_geo_public_read_published" ON public.taxonomy_geo;
CREATE POLICY "taxonomy_geo_public_read_published" ON public.taxonomy_geo
  FOR SELECT TO anon, authenticated
  USING (is_published = true);

DROP POLICY IF EXISTS "taxonomy_geo_admin_read_all" ON public.taxonomy_geo;
CREATE POLICY "taxonomy_geo_admin_read_all" ON public.taxonomy_geo
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "taxonomy_geo_admin_insert" ON public.taxonomy_geo;
CREATE POLICY "taxonomy_geo_admin_insert" ON public.taxonomy_geo
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "taxonomy_geo_admin_update" ON public.taxonomy_geo;
CREATE POLICY "taxonomy_geo_admin_update" ON public.taxonomy_geo
  FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "taxonomy_geo_admin_delete" ON public.taxonomy_geo;
CREATE POLICY "taxonomy_geo_admin_delete" ON public.taxonomy_geo
  FOR DELETE TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.taxonomy_geo IS 'Geometry/bounds verified against legacy pre-merger area/district/ward IDs; used only to fit map viewport and validate coordinates.';
COMMENT ON COLUMN public.taxonomy_geo.entity_id IS 'UUID of areas.id, districts.id, or wards.id according to entity_type; polymorphic by design to preserve existing tables.';
COMMENT ON COLUMN public.taxonomy_geo.administrative_vintage IS 'Administrative naming vintage. Project currently uses legacy_pre_merger.';
