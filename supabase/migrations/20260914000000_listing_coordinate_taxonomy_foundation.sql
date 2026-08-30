-- Foundation for exact ward identity and polygon coordinate validation.
-- This migration does not quarantine or rewrite historical coordinates.

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.wards WHERE district_id IS NULL) THEN
    RAISE EXCEPTION 'Không thể bật location integrity: wards còn dòng thiếu district_id';
  END IF;
END
$$;
ALTER TABLE public.wards ALTER COLUMN district_id SET NOT NULL;

ALTER TABLE public.user_listings
  ADD COLUMN IF NOT EXISTS ward_id uuid REFERENCES public.wards(id) ON DELETE RESTRICT;
ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS ward_id uuid REFERENCES public.wards(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS user_listings_ward_id_idx ON public.user_listings(ward_id);
CREATE INDEX IF NOT EXISTS properties_ward_id_idx ON public.properties(ward_id);

UPDATE public.user_listings listing
SET ward_id = ward.id
FROM public.wards ward
WHERE listing.ward_id IS NULL
  AND listing.district_id = ward.district_id
  AND public.normalize_location_label(listing.ward) = public.normalize_location_label(ward.name)
  AND 1 = (
    SELECT count(*)
    FROM public.wards candidate
    WHERE candidate.district_id = listing.district_id
      AND public.normalize_location_label(candidate.name) = public.normalize_location_label(listing.ward)
  );

UPDATE public.properties property
SET ward_id = ward.id
FROM public.wards ward
WHERE property.ward_id IS NULL
  AND property.district_id = ward.district_id
  AND public.normalize_location_label(property.ward) = public.normalize_location_label(ward.name)
  AND 1 = (
    SELECT count(*)
    FROM public.wards candidate
    WHERE candidate.district_id = property.district_id
      AND public.normalize_location_label(candidate.name) = public.normalize_location_label(property.ward)
  );

CREATE OR REPLACE FUNCTION public.taxonomy_geo_covers_point(
  p_entity_type text,
  p_entity_id uuid,
  p_latitude numeric,
  p_longitude numeric
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, extensions, pg_temp
AS $$
  SELECT COALESCE(bool_or(
    p_latitude BETWEEN (geo.bounds->>'south')::numeric AND (geo.bounds->>'north')::numeric
    AND p_longitude BETWEEN (geo.bounds->>'west')::numeric AND (geo.bounds->>'east')::numeric
    AND ST_Covers(
      ST_SetSRID(ST_GeomFromGeoJSON(geo.geojson::text), 4326),
      ST_SetSRID(ST_MakePoint(p_longitude::double precision, p_latitude::double precision), 4326)
    )
  ), false)
  FROM public.taxonomy_geo geo
  WHERE geo.entity_type = p_entity_type
    AND geo.entity_id = p_entity_id
    AND geo.is_published
    AND geo.administrative_vintage = 'legacy_pre_merger'
    AND geo.geojson IS NOT NULL
$$;

REVOKE ALL ON FUNCTION public.taxonomy_geo_covers_point(text, uuid, numeric, numeric)
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
