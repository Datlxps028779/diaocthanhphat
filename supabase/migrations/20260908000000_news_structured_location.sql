-- =============================================================================
-- News → taxonomy location references
--
-- These nullable IDs are editorial context only. Existing free-form GEO fields
-- remain narrative SEO/GEO/AIO content and are never parsed or backfilled here.
-- =============================================================================

ALTER TABLE public.news
  ADD COLUMN IF NOT EXISTS area_id uuid REFERENCES public.areas(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS district_id uuid REFERENCES public.districts(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS ward_id uuid REFERENCES public.wards(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS neighborhood_id uuid REFERENCES public.neighborhoods(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.news.area_id IS 'Tỉnh/thành editorial context for related active listings; selected from taxonomy.';
COMMENT ON COLUMN public.news.district_id IS 'Quận/huyện editorial context; must belong to news.area_id.';
COMMENT ON COLUMN public.news.ward_id IS 'Phường/xã editorial context; must belong to news.district_id.';
COMMENT ON COLUMN public.news.neighborhood_id IS 'Khu dân cư editorial context; hierarchy is checked against the selected taxonomy IDs.';

CREATE INDEX IF NOT EXISTS news_area_id_idx ON public.news(area_id);
CREATE INDEX IF NOT EXISTS news_district_id_idx ON public.news(district_id);
CREATE INDEX IF NOT EXISTS news_ward_id_idx ON public.news(ward_id);
CREATE INDEX IF NOT EXISTS news_neighborhood_id_idx ON public.news(neighborhood_id);

CREATE OR REPLACE FUNCTION public.validate_news_location_integrity()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  selected_area public.areas%ROWTYPE;
  selected_district public.districts%ROWTYPE;
  selected_ward public.wards%ROWTYPE;
  selected_neighborhood public.neighborhoods%ROWTYPE;
  effective_area_id uuid;
  effective_district_id uuid;
  effective_ward_id uuid;
BEGIN
  IF NEW.area_id IS NOT NULL THEN
    SELECT * INTO selected_area FROM public.areas WHERE id = NEW.area_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Tỉnh/thành đã chọn cho bài viết không tồn tại.';
    END IF;
  END IF;

  IF NEW.district_id IS NOT NULL THEN
    SELECT * INTO selected_district FROM public.districts WHERE id = NEW.district_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Quận/huyện đã chọn cho bài viết không tồn tại.';
    END IF;
    IF NEW.area_id IS NULL THEN
      NEW.area_id := selected_district.area_id;
    ELSIF selected_district.area_id <> NEW.area_id THEN
      RAISE EXCEPTION 'Quận/huyện của bài viết không thuộc tỉnh/thành đã chọn.';
    END IF;
  END IF;

  IF NEW.ward_id IS NOT NULL THEN
    SELECT * INTO selected_ward FROM public.wards WHERE id = NEW.ward_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Phường/xã đã chọn cho bài viết không tồn tại.';
    END IF;
    IF NEW.district_id IS NULL THEN
      NEW.district_id := selected_ward.district_id;
    ELSIF selected_ward.district_id <> NEW.district_id THEN
      RAISE EXCEPTION 'Phường/xã của bài viết không thuộc quận/huyện đã chọn.';
    END IF;
    SELECT area_id INTO effective_area_id FROM public.districts WHERE id = selected_ward.district_id;
    IF NEW.area_id IS NULL THEN
      NEW.area_id := effective_area_id;
    ELSIF effective_area_id IS DISTINCT FROM NEW.area_id THEN
      RAISE EXCEPTION 'Phường/xã của bài viết không thuộc tỉnh/thành đã chọn.';
    END IF;
  END IF;

  IF NEW.neighborhood_id IS NOT NULL THEN
    SELECT * INTO selected_neighborhood FROM public.neighborhoods WHERE id = NEW.neighborhood_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Khu dân cư đã chọn cho bài viết không tồn tại.';
    END IF;

    effective_area_id := selected_neighborhood.area_id;
    effective_district_id := selected_neighborhood.district_id;
    effective_ward_id := selected_neighborhood.ward_id;

    IF effective_district_id IS NULL AND effective_ward_id IS NOT NULL THEN
      SELECT district_id INTO effective_district_id FROM public.wards WHERE id = effective_ward_id;
    END IF;
    IF effective_area_id IS NULL AND effective_district_id IS NOT NULL THEN
      SELECT area_id INTO effective_area_id FROM public.districts WHERE id = effective_district_id;
    END IF;
    IF effective_area_id IS NULL THEN
      RAISE EXCEPTION 'Khu dân cư đã chọn chưa có tỉnh/thành taxonomy; hãy chuẩn hóa khu dân cư trước khi liên kết bài viết.';
    END IF;

    IF NEW.area_id IS NOT NULL AND NEW.area_id <> effective_area_id THEN
      RAISE EXCEPTION 'Khu dân cư của bài viết không thuộc tỉnh/thành đã chọn.';
    END IF;
    IF NEW.district_id IS NOT NULL AND effective_district_id IS NULL THEN
      RAISE EXCEPTION 'Khu dân cư của bài viết chưa có quận/huyện taxonomy để gắn với cấp đã chọn.';
    END IF;
    IF NEW.district_id IS NOT NULL AND NEW.district_id <> effective_district_id THEN
      RAISE EXCEPTION 'Khu dân cư của bài viết không thuộc quận/huyện đã chọn.';
    END IF;
    IF NEW.ward_id IS NOT NULL AND effective_ward_id IS NULL THEN
      RAISE EXCEPTION 'Khu dân cư của bài viết chưa có phường/xã taxonomy để gắn với cấp đã chọn.';
    END IF;
    IF NEW.ward_id IS NOT NULL AND NEW.ward_id <> effective_ward_id THEN
      RAISE EXCEPTION 'Khu dân cư của bài viết không thuộc phường/xã đã chọn.';
    END IF;

    -- Fill only the unambiguous parent IDs exposed by the selected neighborhood.
    NEW.area_id := COALESCE(NEW.area_id, effective_area_id);
    NEW.district_id := COALESCE(NEW.district_id, effective_district_id);
    NEW.ward_id := COALESCE(NEW.ward_id, effective_ward_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_news_validate_location ON public.news;
CREATE TRIGGER trg_news_validate_location
  BEFORE INSERT OR UPDATE OF area_id, district_id, ward_id, neighborhood_id ON public.news
  FOR EACH ROW EXECUTE FUNCTION public.validate_news_location_integrity();

NOTIFY pgrst, 'reload schema';
