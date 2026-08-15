-- =============================================================================
-- P1: Location integrity for properties / user_listings
--
-- district_id has existed since 20260703 but historic form/approval flows did not
-- preserve it. This migration only fills exact area + district matches and then
-- rejects contradictory structured/text location submissions. It never rewrites
-- display/search fields (city, district, ward, neighborhood_slug).
-- =============================================================================

-- Mirrors the existing f_unaccent convention while preserving semantics: trim,
-- whitespace, case and accents only. It intentionally does not guess aliases or
-- remove administrative words such as "Quận" / "Huyện".
CREATE OR REPLACE FUNCTION public.normalize_location_label(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(lower(regexp_replace(public.f_unaccent(btrim(value)), '\s+', ' ', 'g')), '')
$$;

-- The migration was measured against production first, but checks again at run
-- time. Any changed/ambiguous source data aborts the entire transaction.
DO $$
DECLARE
  v_count bigint;
  v_samples text;
BEGIN
  -- A non-empty location pair must have exactly one district under the row area.
  WITH candidates AS (
    SELECT p.id, count(d.id) AS matches
    FROM public.properties p
    LEFT JOIN public.districts d ON d.area_id = p.area_id
      AND public.normalize_location_label(d.name) = public.normalize_location_label(p.district)
    WHERE p.area_id IS NOT NULL AND public.normalize_location_label(p.district) IS NOT NULL
    GROUP BY p.id
  )
  SELECT count(*), (SELECT string_agg(id::text, ', ' ORDER BY id::text) FROM (SELECT id FROM candidates WHERE matches <> 1 ORDER BY id LIMIT 10) sample_rows)
  INTO v_count, v_samples
  FROM candidates WHERE matches <> 1;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'P1 properties: % dòng có area_id + district không khớp duy nhất taxonomy. Mẫu id: %', v_count, v_samples;
  END IF;

  WITH candidates AS (
    SELECT l.id, count(d.id) AS matches
    FROM public.user_listings l
    LEFT JOIN public.districts d ON d.area_id = l.area_id
      AND public.normalize_location_label(d.name) = public.normalize_location_label(l.district)
    WHERE l.area_id IS NOT NULL AND public.normalize_location_label(l.district) IS NOT NULL
    GROUP BY l.id
  )
  SELECT count(*), (SELECT string_agg(id::text, ', ' ORDER BY id::text) FROM (SELECT id FROM candidates WHERE matches <> 1 ORDER BY id LIMIT 10) sample_rows)
  INTO v_count, v_samples
  FROM candidates WHERE matches <> 1;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'P1 user_listings: % dòng có area_id + district không khớp duy nhất taxonomy. Mẫu id: %', v_count, v_samples;
  END IF;

  -- A pre-existing FK must agree with its own area/text representation.
  WITH failures AS (
    SELECT p.id
    FROM public.properties p
    JOIN public.districts d ON d.id = p.district_id
    WHERE (p.area_id IS NOT NULL AND d.area_id <> p.area_id)
       OR (public.normalize_location_label(p.district) IS NOT NULL
           AND public.normalize_location_label(p.district) <> public.normalize_location_label(d.name))
  )
  SELECT count(*), (SELECT string_agg(id::text, ', ' ORDER BY id::text) FROM (SELECT id FROM failures ORDER BY id LIMIT 10) sample_rows)
  INTO v_count, v_samples
  FROM failures;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'P1 properties: % district_id hiện có mâu thuẫn area/text. Mẫu id: %', v_count, v_samples;
  END IF;

  WITH failures AS (
    SELECT l.id
    FROM public.user_listings l
    JOIN public.districts d ON d.id = l.district_id
    WHERE (l.area_id IS NOT NULL AND d.area_id <> l.area_id)
       OR (public.normalize_location_label(l.district) IS NOT NULL
           AND public.normalize_location_label(l.district) <> public.normalize_location_label(d.name))
  )
  SELECT count(*), (SELECT string_agg(id::text, ', ' ORDER BY id::text) FROM (SELECT id FROM failures ORDER BY id LIMIT 10) sample_rows)
  INTO v_count, v_samples
  FROM failures;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'P1 user_listings: % district_id hiện có mâu thuẫn area/text. Mẫu id: %', v_count, v_samples;
  END IF;

  -- If the current ward text exists in the taxonomy at all, it must exist under
  -- its effective district. A pre-existing FK takes precedence; otherwise the
  -- exact `(area_id, district text)` match is used. Fully unmatched free text
  -- remains compatible with the existing pending-import policy.
  WITH source_rows AS (
    SELECT 'properties'::text AS table_name, p.id, p.area_id, p.district_id, p.district, p.ward FROM public.properties p
    UNION ALL
    SELECT 'user_listings'::text, l.id, l.area_id, l.district_id, l.district, l.ward FROM public.user_listings l
  ), resolved AS (
    SELECT s.table_name, s.id, s.ward, COALESCE(s.district_id, d.id) AS effective_district_id
    FROM source_rows s
    LEFT JOIN public.districts d ON d.area_id = s.area_id
      AND public.normalize_location_label(d.name) = public.normalize_location_label(s.district)
    WHERE public.normalize_location_label(s.ward) IS NOT NULL
  ), failures AS (
    SELECT r.table_name, r.id
    FROM resolved r
    WHERE r.effective_district_id IS NOT NULL
      AND EXISTS (SELECT 1 FROM public.wards w WHERE public.normalize_location_label(w.name) = public.normalize_location_label(r.ward))
      AND NOT EXISTS (SELECT 1 FROM public.wards w WHERE w.district_id = r.effective_district_id AND public.normalize_location_label(w.name) = public.normalize_location_label(r.ward))
  )
  SELECT count(*), (SELECT string_agg((table_name || ':' || id::text), ', ' ORDER BY table_name, id::text) FROM (SELECT table_name, id FROM failures ORDER BY table_name, id LIMIT 10) sample_rows)
  INTO v_count, v_samples
  FROM failures;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'P1: % ward mâu thuẫn district taxonomy. Mẫu table:id: %', v_count, v_samples;
  END IF;

  -- A known neighborhood slug must agree with the row's effective hierarchy.
  -- A missing legacy slug is left untouched here; the trigger will reject a new
  -- submission using it, without changing historic data during this repair.
  WITH source_rows AS (
    SELECT 'properties'::text AS table_name, p.id, p.area_id, p.district_id, p.district, p.ward, p.neighborhood_slug
    FROM public.properties p
    UNION ALL
    SELECT 'user_listings'::text, l.id, l.area_id, l.district_id, l.district, l.ward, l.neighborhood_slug
    FROM public.user_listings l
  ), resolved AS (
    SELECT s.*, COALESCE(s.district_id, d.id) AS effective_district_id, n.id AS neighborhood_id,
      n.area_id AS neighborhood_area_id, n.district_id AS neighborhood_district_id,
      w.id AS neighborhood_ward_id, w.district_id AS neighborhood_ward_district_id,
      w.name AS neighborhood_ward_name
    FROM source_rows s
    LEFT JOIN public.districts d ON d.area_id = s.area_id
      AND public.normalize_location_label(d.name) = public.normalize_location_label(s.district)
    LEFT JOIN public.neighborhoods n ON n.slug = s.neighborhood_slug
    LEFT JOIN public.wards w ON w.id = n.ward_id
  ), failures AS (
    SELECT r.table_name, r.id
    FROM resolved r
    LEFT JOIN public.districts nd ON nd.id = COALESCE(r.neighborhood_district_id, r.neighborhood_ward_district_id)
    WHERE r.neighborhood_id IS NOT NULL
      AND (
        (r.area_id IS NOT NULL AND COALESCE(r.neighborhood_area_id, nd.area_id) IS NOT NULL AND COALESCE(r.neighborhood_area_id, nd.area_id) <> r.area_id)
        OR (r.effective_district_id IS NOT NULL AND COALESCE(r.neighborhood_district_id, r.neighborhood_ward_district_id) IS NOT NULL AND COALESCE(r.neighborhood_district_id, r.neighborhood_ward_district_id) <> r.effective_district_id)
        OR (public.normalize_location_label(r.ward) IS NOT NULL AND r.neighborhood_ward_id IS NOT NULL AND public.normalize_location_label(r.ward) <> public.normalize_location_label(r.neighborhood_ward_name))
      )
  )
  SELECT count(*), (SELECT string_agg((table_name || ':' || id::text), ', ' ORDER BY table_name, id::text) FROM (SELECT table_name, id FROM failures ORDER BY table_name, id LIMIT 10) sample_rows)
  INTO v_count, v_samples
  FROM failures;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'P1: % neighborhood_slug mâu thuẫn hierarchy. Mẫu table:id: %', v_count, v_samples;
  END IF;
END $$;

-- Only validated, exact pairs are filled. No text or timestamp column is touched.
UPDATE public.properties p
SET district_id = d.id
FROM public.districts d
WHERE p.district_id IS NULL
  AND p.area_id = d.area_id
  AND public.normalize_location_label(p.district) = public.normalize_location_label(d.name)
  AND public.normalize_location_label(p.district) IS NOT NULL;

UPDATE public.user_listings l
SET district_id = d.id
FROM public.districts d
WHERE l.district_id IS NULL
  AND l.area_id = d.area_id
  AND public.normalize_location_label(l.district) = public.normalize_location_label(d.name)
  AND public.normalize_location_label(l.district) IS NOT NULL;

-- Verify that the backfill did not leave a resolvable pair without its correct FK.
DO $$
DECLARE
  v_count bigint;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.properties p
  JOIN public.districts d ON d.area_id = p.area_id
    AND public.normalize_location_label(d.name) = public.normalize_location_label(p.district)
  WHERE public.normalize_location_label(p.district) IS NOT NULL
    AND p.district_id IS DISTINCT FROM d.id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'P1 properties: còn % district_id không đúng sau backfill', v_count;
  END IF;

  SELECT count(*) INTO v_count
  FROM public.user_listings l
  JOIN public.districts d ON d.area_id = l.area_id
    AND public.normalize_location_label(d.name) = public.normalize_location_label(l.district)
  WHERE public.normalize_location_label(l.district) IS NOT NULL
    AND l.district_id IS DISTINCT FROM d.id;
  IF v_count > 0 THEN
    RAISE EXCEPTION 'P1 user_listings: còn % district_id không đúng sau backfill', v_count;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validate_listing_location_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  selected_district public.districts%ROWTYPE;
  selected_neighborhood public.neighborhoods%ROWTYPE;
  selected_ward public.wards%ROWTYPE;
  effective_district_id uuid;
  district_match_count integer;
  neighborhood_area_id uuid;
  neighborhood_district_id uuid;
  has_named_ward boolean;
BEGIN
  IF NEW.district_id IS NOT NULL THEN
    SELECT * INTO selected_district FROM public.districts WHERE id = NEW.district_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Quận/huyện đã chọn không còn tồn tại trong taxonomy.';
    END IF;
    effective_district_id := selected_district.id;

    IF NEW.area_id IS NOT NULL AND selected_district.area_id <> NEW.area_id THEN
      RAISE EXCEPTION 'Quận/huyện đã chọn không thuộc tỉnh/thành phố đã chọn.';
    END IF;

    IF public.normalize_location_label(NEW.district) IS NOT NULL
       AND public.normalize_location_label(NEW.district) <> public.normalize_location_label(selected_district.name) THEN
      RAISE EXCEPTION 'Tên quận/huyện không khớp với quận/huyện đã chọn.';
    END IF;
  ELSIF NEW.area_id IS NOT NULL AND public.normalize_location_label(NEW.district) IS NOT NULL THEN
    SELECT count(*) INTO district_match_count
    FROM public.districts d
    WHERE d.area_id = NEW.area_id
      AND public.normalize_location_label(d.name) = public.normalize_location_label(NEW.district);
    IF district_match_count = 1 THEN
      SELECT id INTO effective_district_id
      FROM public.districts d
      WHERE d.area_id = NEW.area_id
        AND public.normalize_location_label(d.name) = public.normalize_location_label(NEW.district);
    END IF;
    IF district_match_count > 1 THEN
      RAISE EXCEPTION 'Tên quận/huyện khớp nhiều taxonomy trong tỉnh/thành đã chọn; hãy chọn lại từ danh sách.';
    END IF;
    -- This is an exact, area-scoped match, not an alias/fuzzy resolution. Persist
    -- it so legacy or API writers cannot reintroduce a resolvable NULL FK.
    IF district_match_count = 1 THEN
      NEW.district_id := effective_district_id;
    END IF;
  END IF;

  IF effective_district_id IS NOT NULL AND public.normalize_location_label(NEW.ward) IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.wards w
      WHERE public.normalize_location_label(w.name) = public.normalize_location_label(NEW.ward)
    ) INTO has_named_ward;
    IF has_named_ward AND NOT EXISTS (
      SELECT 1 FROM public.wards w
      WHERE w.district_id = effective_district_id
        AND public.normalize_location_label(w.name) = public.normalize_location_label(NEW.ward)
    ) THEN
      RAISE EXCEPTION 'Phường/xã đã nhập không thuộc quận/huyện đã chọn.';
    END IF;
  END IF;

  IF NEW.neighborhood_slug IS NOT NULL AND btrim(NEW.neighborhood_slug) <> '' THEN
    SELECT * INTO selected_neighborhood
    FROM public.neighborhoods WHERE slug = NEW.neighborhood_slug;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Khu dân cư đã chọn không còn tồn tại.';
    END IF;

    IF selected_neighborhood.ward_id IS NOT NULL THEN
      SELECT * INTO selected_ward FROM public.wards WHERE id = selected_neighborhood.ward_id;
    END IF;

    neighborhood_district_id := COALESCE(selected_neighborhood.district_id, selected_ward.district_id);
    neighborhood_area_id := selected_neighborhood.area_id;
    IF neighborhood_area_id IS NULL AND neighborhood_district_id IS NOT NULL THEN
      SELECT area_id INTO neighborhood_area_id FROM public.districts WHERE id = neighborhood_district_id;
    END IF;

    IF NEW.area_id IS NOT NULL
       AND neighborhood_area_id IS NOT NULL
       AND neighborhood_area_id <> NEW.area_id THEN
      RAISE EXCEPTION 'Khu dân cư đã chọn không thuộc tỉnh/thành phố đã chọn.';
    END IF;

    -- effective_district_id also covers a legacy/external payload that only has
    -- an exact district label. It must not be able to pair that label with a
    -- neighborhood from another district simply because district_id is blank.
    IF effective_district_id IS NOT NULL
       AND neighborhood_district_id IS NOT NULL
       AND neighborhood_district_id <> effective_district_id THEN
      RAISE EXCEPTION 'Khu dân cư đã chọn không thuộc quận/huyện đã chọn.';
    END IF;

    IF public.normalize_location_label(NEW.ward) IS NOT NULL
       AND selected_ward.id IS NOT NULL
       AND public.normalize_location_label(NEW.ward) <> public.normalize_location_label(selected_ward.name) THEN
      RAISE EXCEPTION 'Tên phường/xã không khớp với khu dân cư đã chọn.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_properties_location_integrity ON public.properties;
CREATE TRIGGER trg_properties_location_integrity
  BEFORE INSERT OR UPDATE OF area_id, district_id, district, ward, neighborhood_slug ON public.properties
  FOR EACH ROW EXECUTE FUNCTION public.validate_listing_location_integrity();

DROP TRIGGER IF EXISTS trg_user_listings_location_integrity ON public.user_listings;
CREATE TRIGGER trg_user_listings_location_integrity
  BEFORE INSERT OR UPDATE OF area_id, district_id, district, ward, neighborhood_slug ON public.user_listings
  FOR EACH ROW EXECUTE FUNCTION public.validate_listing_location_integrity();

-- Listings keep denormalized text for compatibility with existing routes/search.
-- Do not permit a district rename or move to make those rows contradictory later;
-- a future explicit taxonomy-rename migration must update both representations
-- atomically instead of silently breaking this invariant.
CREATE OR REPLACE FUNCTION public.protect_referenced_district_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.name IS NOT DISTINCT FROM OLD.name
     AND NEW.area_id IS NOT DISTINCT FROM OLD.area_id THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.properties p
    WHERE p.district_id = OLD.id
      AND (
        (p.area_id IS NOT NULL AND p.area_id IS DISTINCT FROM NEW.area_id)
        OR (public.normalize_location_label(p.district) IS NOT NULL
            AND public.normalize_location_label(p.district) <> public.normalize_location_label(NEW.name))
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.user_listings l
    WHERE l.district_id = OLD.id
      AND (
        (l.area_id IS NOT NULL AND l.area_id IS DISTINCT FROM NEW.area_id)
        OR (public.normalize_location_label(l.district) IS NOT NULL
            AND public.normalize_location_label(l.district) <> public.normalize_location_label(NEW.name))
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.neighborhoods n
    WHERE n.district_id = OLD.id
      AND n.area_id IS NOT NULL
      AND n.area_id IS DISTINCT FROM NEW.area_id
  ) OR EXISTS (
    SELECT 1
    FROM public.neighborhoods n
    JOIN public.wards w ON w.id = n.ward_id
    WHERE w.district_id = OLD.id
      AND n.area_id IS NOT NULL
      AND n.area_id IS DISTINCT FROM NEW.area_id
  ) THEN
    RAISE EXCEPTION 'Không thể đổi tên hoặc chuyển tỉnh/thành của quận/huyện đang được tin đăng hoặc khu dân cư tham chiếu; hãy dùng migration cascade có kiểm soát.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_districts_protect_referenced_location ON public.districts;
CREATE TRIGGER trg_districts_protect_referenced_location
  BEFORE UPDATE OF name, area_id ON public.districts
  FOR EACH ROW EXECUTE FUNCTION public.protect_referenced_district_location();

NOTIFY pgrst, 'reload schema';
