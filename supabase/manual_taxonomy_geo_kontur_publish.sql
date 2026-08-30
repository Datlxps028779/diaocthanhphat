-- Publish only after reviewing the output of manual_taxonomy_geo_kontur_review.sql.
-- This is a production write. It publishes only the generated, parent-matched
-- Kontur legacy set: 4 areas + 53 districts + 645 wards = 702 rows.

BEGIN;

DO $$
DECLARE
  v_total integer;
  v_orphans integer;
BEGIN
  SELECT count(*) INTO v_total
  FROM public.taxonomy_geo
  WHERE source = 'Kontur Boundaries Vietnam 20230628';
  IF v_total <> 702 THEN
    RAISE EXCEPTION 'Refusing publish: expected 702 reviewed Kontur rows, found %', v_total;
  END IF;

  SELECT count(*) INTO v_orphans
  FROM public.taxonomy_geo tg
  WHERE tg.source = 'Kontur Boundaries Vietnam 20230628'
    AND NOT (
      (tg.entity_type = 'area' AND EXISTS (SELECT 1 FROM public.areas a WHERE a.id = tg.entity_id))
      OR (tg.entity_type = 'district' AND EXISTS (SELECT 1 FROM public.districts d WHERE d.id = tg.entity_id))
      OR (tg.entity_type = 'ward' AND EXISTS (SELECT 1 FROM public.wards w WHERE w.id = tg.entity_id))
    );
  IF v_orphans <> 0 THEN
    RAISE EXCEPTION 'Refusing publish: % geometry rows do not match taxonomy IDs', v_orphans;
  END IF;
END;
$$;

UPDATE public.taxonomy_geo
SET is_published = true,
    verified_at = now(),
    updated_at = now()
WHERE source = 'Kontur Boundaries Vietnam 20230628'
  AND administrative_vintage = 'legacy_pre_merger';

SELECT entity_type, count(*) AS published_rows
FROM public.taxonomy_geo
WHERE source = 'Kontur Boundaries Vietnam 20230628'
  AND is_published
GROUP BY entity_type
ORDER BY entity_type;

COMMIT;
