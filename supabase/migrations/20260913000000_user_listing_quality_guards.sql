-- Guard malformed listing values at the database boundary.
-- This migration does not backfill historical rows. NOT VALID checks enforce new
-- writes while allowing an operator to review legacy violations first.

CREATE OR REPLACE FUNCTION public.listing_plain_text(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT btrim(regexp_replace(regexp_replace(COALESCE(p_value, ''), '<[^>]*>', ' ', 'g'), '&(nbsp|amp|lt|gt|quot|#39);', ' ', 'gi'));
$$;

REVOKE ALL ON FUNCTION public.listing_plain_text(text) FROM PUBLIC, anon, authenticated;

ALTER TABLE public.user_listings
  DROP CONSTRAINT IF EXISTS user_listings_area_positive,
  DROP CONSTRAINT IF EXISTS user_listings_bedrooms_nonnegative,
  DROP CONSTRAINT IF EXISTS user_listings_bathrooms_nonnegative,
  DROP CONSTRAINT IF EXISTS user_listings_coordinates_valid;
ALTER TABLE public.user_listings
  ADD CONSTRAINT user_listings_area_positive CHECK (area_sqm IS NULL OR area_sqm > 0) NOT VALID,
  ADD CONSTRAINT user_listings_bedrooms_nonnegative CHECK (bedrooms IS NULL OR bedrooms >= 0) NOT VALID,
  ADD CONSTRAINT user_listings_bathrooms_nonnegative CHECK (bathrooms IS NULL OR bathrooms >= 0) NOT VALID,
  ADD CONSTRAINT user_listings_coordinates_valid CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  ) NOT VALID;

ALTER TABLE public.properties
  DROP CONSTRAINT IF EXISTS properties_area_positive,
  DROP CONSTRAINT IF EXISTS properties_bedrooms_nonnegative,
  DROP CONSTRAINT IF EXISTS properties_bathrooms_nonnegative,
  DROP CONSTRAINT IF EXISTS properties_floor_count_nonnegative,
  DROP CONSTRAINT IF EXISTS properties_road_width_positive,
  DROP CONSTRAINT IF EXISTS properties_frontage_positive,
  DROP CONSTRAINT IF EXISTS properties_coordinates_valid;
ALTER TABLE public.properties
  ADD CONSTRAINT properties_area_positive CHECK (area_sqm IS NULL OR area_sqm > 0) NOT VALID,
  ADD CONSTRAINT properties_bedrooms_nonnegative CHECK (bedrooms IS NULL OR bedrooms >= 0) NOT VALID,
  ADD CONSTRAINT properties_bathrooms_nonnegative CHECK (bathrooms IS NULL OR bathrooms >= 0) NOT VALID,
  ADD CONSTRAINT properties_floor_count_nonnegative CHECK (floor_count IS NULL OR floor_count >= 0) NOT VALID,
  ADD CONSTRAINT properties_road_width_positive CHECK (road_width IS NULL OR road_width > 0) NOT VALID,
  ADD CONSTRAINT properties_frontage_positive CHECK (frontage IS NULL OR frontage > 0) NOT VALID,
  ADD CONSTRAINT properties_coordinates_valid CHECK (
    (latitude IS NULL AND longitude IS NULL)
    OR (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.guard_pending_user_listing_quality()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    IF NULLIF(btrim(NEW.title), '') IS NULL OR char_length(NEW.title) > 120 THEN
      RAISE EXCEPTION 'Tiêu đề tin bắt buộc và tối đa 120 ký tự' USING ERRCODE = '22023';
    END IF;
    IF NEW.listing_type = 'mua_ban' AND (NEW.price IS NULL OR NEW.price <= 0) THEN
      RAISE EXCEPTION 'Giá bán phải lớn hơn 0' USING ERRCODE = '22023';
    END IF;
    IF NEW.listing_type = 'cho_thue' AND COALESCE(NEW.price_per_month, NEW.price) <= 0 THEN
      RAISE EXCEPTION 'Giá thuê phải lớn hơn 0' USING ERRCODE = '22023';
    END IF;
    IF NEW.listing_type = 'cho_thue' AND NEW.loan_support IS NOT NULL THEN
      RAISE EXCEPTION 'Tin cho thuê không được có khoản vay' USING ERRCODE = '22023';
    END IF;
    IF NEW.listing_type = 'mua_ban' AND NEW.loan_support IS NOT NULL AND (NEW.loan_support <= 0 OR NEW.loan_support >= NEW.price) THEN
      RAISE EXCEPTION 'Khoản vay phải lớn hơn 0 và nhỏ hơn giá bán' USING ERRCODE = '22023';
    END IF;
    IF NEW.image_url IS NULL AND COALESCE(array_length(NEW.images, 1), 0) = 0 THEN
      RAISE EXCEPTION 'Tin đăng cần ít nhất một ảnh' USING ERRCODE = '22023';
    END IF;
    IF length(public.listing_plain_text(NEW.description)) < 80 THEN
      RAISE EXCEPTION 'Mô tả tin đăng cần ít nhất 80 ký tự có nội dung' USING ERRCODE = '22023';
    END IF;
    IF NULLIF(btrim(NEW.city), '') IS NULL OR ((NULLIF(btrim(NEW.address), '') IS NULL) AND (NEW.latitude IS NULL OR NEW.longitude IS NULL)) THEN
      RAISE EXCEPTION 'Cần có tỉnh/thành và địa chỉ hoặc vị trí bản đồ hợp lệ' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_pending_user_listing_quality() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_guard_pending_user_listing_quality ON public.user_listings;
CREATE TRIGGER trg_guard_pending_user_listing_quality
BEFORE INSERT OR UPDATE OF status, title, description, image_url, images, listing_type, price, price_per_month, loan_support, city, address, latitude, longitude
ON public.user_listings
FOR EACH ROW EXECUTE FUNCTION public.guard_pending_user_listing_quality();

NOTIFY pgrst, 'reload schema';
