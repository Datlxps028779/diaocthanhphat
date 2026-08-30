-- Production write: remove only historical coordinates that cannot be proven to
-- belong to their ward polygon. Run only after reviewing the repair dry-run output.
-- Measured snapshot after foundation: 10 active properties + 5 user_listings
-- (4 approved + 1 pending).

BEGIN;

DO $$
DECLARE
  v_property_rows integer;
  v_listing_rows integer;
BEGIN
  SELECT count(*) INTO v_property_rows
  FROM public.properties property
  WHERE (property.latitude IS NOT NULL OR property.longitude IS NOT NULL)
    AND (
      property.latitude IS NULL
      OR property.longitude IS NULL
      OR property.ward_id IS NULL
      OR NOT public.taxonomy_geo_covers_point('ward', property.ward_id, property.latitude, property.longitude)
    );

  SELECT count(*) INTO v_listing_rows
  FROM public.user_listings listing
  WHERE (listing.latitude IS NOT NULL OR listing.longitude IS NOT NULL)
    AND (
      listing.latitude IS NULL
      OR listing.longitude IS NULL
      OR listing.ward_id IS NULL
      OR NOT public.taxonomy_geo_covers_point('ward', listing.ward_id, listing.latitude, listing.longitude)
    );

  IF v_property_rows <> 10 OR v_listing_rows <> 5 THEN
    RAISE EXCEPTION 'Production drift: expected 10 invalid properties and 5 invalid user listings, found % and %. Re-run dry-run.', v_property_rows, v_listing_rows;
  END IF;
END
$$;

UPDATE public.properties property
SET latitude = NULL,
    longitude = NULL,
    updated_at = now()
WHERE (property.latitude IS NOT NULL OR property.longitude IS NOT NULL)
  AND (
    property.latitude IS NULL
    OR property.longitude IS NULL
    OR property.ward_id IS NULL
    OR NOT public.taxonomy_geo_covers_point('ward', property.ward_id, property.latitude, property.longitude)
  );

UPDATE public.user_listings listing
SET latitude = NULL,
    longitude = NULL,
    updated_at = now()
WHERE (listing.latitude IS NOT NULL OR listing.longitude IS NOT NULL)
  AND (
    listing.latitude IS NULL
    OR listing.longitude IS NULL
    OR listing.ward_id IS NULL
    OR NOT public.taxonomy_geo_covers_point('ward', listing.ward_id, listing.latitude, listing.longitude)
  );

COMMIT;
