-- =============================================================================
-- P1 follow-up: preserve listing location integrity when neighborhood taxonomy
-- hierarchy is edited after district_id backfill has already been deployed.
-- =============================================================================

-- The P1 listing trigger validates a listing when that listing is written. An
-- edit to neighborhoods does not touch those rows, so protect the relationship
-- at the taxonomy writer boundary. Referenced slugs cannot be changed through
-- a direct table update; the existing rename_neighborhood_slug RPC remains the
-- atomic rename path and this migration redefines it below to mark that path.
CREATE OR REPLACE FUNCTION public.protect_referenced_neighborhood_location()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  rename_function_owner text := (
    SELECT pg_get_userbyid(proowner)::text
    FROM pg_proc
    WHERE oid = 'public.rename_neighborhood_slug(uuid,text,text)'::regprocedure
  );
  selected_district public.districts%ROWTYPE;
  selected_ward public.wards%ROWTYPE;
  effective_district_id uuid;
  effective_district_area_id uuid;
  effective_area_id uuid;
BEGIN
  IF TG_OP = 'UPDATE'
     AND NEW.slug IS DISTINCT FROM OLD.slug
     AND current_user IS DISTINCT FROM rename_function_owner
     AND (
       EXISTS (SELECT 1 FROM public.properties p WHERE p.neighborhood_slug = OLD.slug)
       OR EXISTS (SELECT 1 FROM public.user_listings l WHERE l.neighborhood_slug = OLD.slug)
     ) THEN
    RAISE EXCEPTION 'Không thể đổi slug khu dân cư đang được tin đăng tham chiếu; hãy dùng rename_neighborhood_slug.';
  END IF;

  -- A referenced neighborhood may not lose any known hierarchy level. That
  -- would make formerly validated listing relations unknowable rather than
  -- merely different.
  IF TG_OP = 'UPDATE'
     AND (
       NEW.area_id IS DISTINCT FROM OLD.area_id
       OR NEW.district_id IS DISTINCT FROM OLD.district_id
       OR NEW.ward_id IS DISTINCT FROM OLD.ward_id
     )
     AND (
       EXISTS (SELECT 1 FROM public.properties p WHERE p.neighborhood_slug = OLD.slug)
       OR EXISTS (SELECT 1 FROM public.user_listings l WHERE l.neighborhood_slug = OLD.slug)
     ) THEN
    RAISE EXCEPTION 'Không thể đổi hierarchy của khu dân cư đang được tin đăng tham chiếu; hãy dùng migration cascade có kiểm soát.';
  END IF;

  IF NEW.district_id IS NOT NULL THEN
    SELECT * INTO selected_district FROM public.districts WHERE id = NEW.district_id;
    effective_district_id := selected_district.id;
  END IF;

  IF NEW.ward_id IS NOT NULL THEN
    SELECT * INTO selected_ward FROM public.wards WHERE id = NEW.ward_id;
    IF effective_district_id IS NOT NULL AND selected_ward.district_id <> effective_district_id THEN
      RAISE EXCEPTION 'Phường/xã của khu dân cư không thuộc quận/huyện đã chọn.';
    END IF;
    effective_district_id := COALESCE(effective_district_id, selected_ward.district_id);
  END IF;

  effective_area_id := NEW.area_id;
  IF effective_district_id IS NOT NULL THEN
    SELECT area_id INTO effective_district_area_id FROM public.districts WHERE id = effective_district_id;
    IF effective_area_id IS NOT NULL AND effective_district_area_id <> effective_area_id THEN
      RAISE EXCEPTION 'Khu dân cư không thuộc tỉnh/thành phố đã chọn.';
    END IF;
    effective_area_id := COALESCE(effective_area_id, effective_district_area_id);
  END IF;

  IF TG_OP = 'UPDATE' AND (
    EXISTS (
      SELECT 1
      FROM public.properties p
      LEFT JOIN public.districts pd ON pd.area_id = p.area_id
        AND public.normalize_location_label(pd.name) = public.normalize_location_label(p.district)
      WHERE p.neighborhood_slug = OLD.slug
        AND (
          (p.area_id IS NOT NULL AND effective_area_id IS NOT NULL AND p.area_id <> effective_area_id)
          OR (COALESCE(p.district_id, pd.id) IS NOT NULL AND effective_district_id IS NOT NULL AND COALESCE(p.district_id, pd.id) <> effective_district_id)
          OR (public.normalize_location_label(p.ward) IS NOT NULL AND selected_ward.id IS NOT NULL AND public.normalize_location_label(p.ward) <> public.normalize_location_label(selected_ward.name))
        )
    ) OR EXISTS (
      SELECT 1
      FROM public.user_listings l
      LEFT JOIN public.districts ld ON ld.area_id = l.area_id
        AND public.normalize_location_label(ld.name) = public.normalize_location_label(l.district)
      WHERE l.neighborhood_slug = OLD.slug
        AND (
          (l.area_id IS NOT NULL AND effective_area_id IS NOT NULL AND l.area_id <> effective_area_id)
          OR (COALESCE(l.district_id, ld.id) IS NOT NULL AND effective_district_id IS NOT NULL AND COALESCE(l.district_id, ld.id) <> effective_district_id)
          OR (public.normalize_location_label(l.ward) IS NOT NULL AND selected_ward.id IS NOT NULL AND public.normalize_location_label(l.ward) <> public.normalize_location_label(selected_ward.name))
        )
    )
  ) THEN
    RAISE EXCEPTION 'Không thể đổi hierarchy của khu dân cư đang được tin đăng tham chiếu; hãy dùng migration cascade có kiểm soát.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_neighborhoods_protect_referenced_location ON public.neighborhoods;
CREATE TRIGGER trg_neighborhoods_protect_referenced_location
  BEFORE INSERT OR UPDATE OF slug, area_id, district_id, ward_id ON public.neighborhoods
  FOR EACH ROW EXECUTE FUNCTION public.protect_referenced_neighborhood_location();

-- Reinstall the existing SECURITY DEFINER atomic rename RPC. The guard permits
-- the function owner only during this trusted cascade, while direct admin table
-- updates to a referenced slug remain rejected.
CREATE OR REPLACE FUNCTION public.rename_neighborhood_slug(p_id uuid, p_old text, p_new text)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  canonical_old_slug text;
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Chỉ admin được đổi slug khu dân cư';
  END IF;

  IF p_new IS NULL OR btrim(p_new) = '' THEN
    RAISE EXCEPTION 'Slug mới không được để trống';
  END IF;

  -- Lock and derive the canonical old slug server-side. The caller-supplied
  -- p_old must agree, otherwise a rename could update the entity but cascade a
  -- different slug's consumers.
  SELECT slug INTO canonical_old_slug FROM neighborhoods WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Khu dân cư không tồn tại';
  END IF;
  IF canonical_old_slug IS DISTINCT FROM p_old THEN
    RAISE EXCEPTION 'Slug cũ không khớp khu dân cư hiện tại';
  END IF;

  IF EXISTS (SELECT 1 FROM neighborhoods WHERE slug = p_new AND id <> p_id) THEN
    RAISE EXCEPTION 'Slug "%" đã được dùng cho khu dân cư khác', p_new;
  END IF;

  IF canonical_old_slug IS NOT DISTINCT FROM p_new THEN
    RETURN;
  END IF;

  PERFORM set_config('app.neighborhood_slug_rename', 'on', true);
  UPDATE neighborhoods SET slug = p_new WHERE id = p_id;
  UPDATE properties    SET neighborhood_slug = p_new WHERE neighborhood_slug = canonical_old_slug;
  UPDATE user_listings SET neighborhood_slug = p_new WHERE neighborhood_slug = canonical_old_slug;
  UPDATE managed_pages SET slug = 'khu-dan-cu:' || p_new WHERE slug = 'khu-dan-cu:' || canonical_old_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_neighborhood_slug(uuid, text, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.rename_neighborhood_slug(uuid, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
