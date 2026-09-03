-- =============================================================================
-- User listing owner mapping: database-owned owner on submit + safe legacy links
-- =============================================================================
-- Production execution is intentionally user-run after the read-only dry-run.
-- Never infer ownership from a name or phone number alone.

ALTER TABLE public.user_listings
  ADD COLUMN IF NOT EXISTS property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL;

-- Migration maintenance may repair only the property link. It can never change
-- the owner UUID, even when auth.uid() is absent in the SQL editor session.
CREATE OR REPLACE FUNCTION public.assert_user_listing_mutation_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Không được thay đổi chủ sở hữu tin đăng' USING ERRCODE = '42501';
  END IF;

  IF auth.uid() IS NULL AND session_user IN ('postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;

  IF auth.uid() = OLD.user_id THEN
    RETURN NEW;
  END IF;

  IF NOT public.is_customer_member(OLD.user_id) THEN
    RAISE EXCEPTION 'Tin đăng ngoài phạm vi customer được phân công' USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assert_user_listing_mutation_scope() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.assign_user_listing_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'Authentication required to submit a listing'
        USING ERRCODE = '42501';
    END IF;
    NEW.user_id := auth.uid();
  ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Không được thay đổi chủ sở hữu tin đăng'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.assign_user_listing_owner() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_assign_user_listing_owner ON public.user_listings;
CREATE TRIGGER trg_assign_user_listing_owner
  BEFORE INSERT OR UPDATE ON public.user_listings
  FOR EACH ROW
  EXECUTE FUNCTION public.assign_user_listing_owner();

-- Link only approved legacy rows where the normalized listing fingerprint has
-- exactly one property candidate and exactly one user-listing candidate.
WITH property_fingerprints AS (
  SELECT
    p.id AS property_id,
    md5(concat_ws('|',
      lower(regexp_replace(btrim(coalesce(p.title, '')), '\s+', ' ', 'g')),
      coalesce(p.description, ''),
      coalesce(p.price::text, ''),
      coalesce(p.price_unit, ''),
      coalesce(p.price_label, ''),
      coalesce(p.price_per_month::text, ''),
      coalesce(p.loan_support::text, ''),
      coalesce(p.listing_type, ''),
      coalesce(p.area_sqm::text, ''),
      coalesce(p.address, ''),
      coalesce(p.city, ''),
      coalesce(p.district, ''),
      coalesce(p.ward, ''),
      coalesce(p.image_url, ''),
      coalesce(p.contact_name, ''),
      coalesce(p.contact_phone, '')
    )) AS fingerprint
  FROM public.properties p
  WHERE p.is_active = true
    AND NOT EXISTS (
      SELECT 1 FROM public.user_listings linked
      WHERE linked.property_id = p.id
    )
), listing_fingerprints AS (
  SELECT
    ul.id AS listing_id,
    md5(concat_ws('|',
      lower(regexp_replace(btrim(coalesce(ul.title, '')), '\s+', ' ', 'g')),
      coalesce(ul.description, ''),
      coalesce(ul.price::text, ''),
      coalesce(ul.price_unit, ''),
      coalesce(ul.price_label, ''),
      coalesce(ul.price_per_month::text, ''),
      coalesce(ul.loan_support::text, ''),
      coalesce(ul.listing_type, ''),
      coalesce(ul.area_sqm::text, ''),
      coalesce(ul.address, ''),
      coalesce(ul.city, ''),
      coalesce(ul.district, ''),
      coalesce(ul.ward, ''),
      coalesce(ul.image_url, ''),
      coalesce(ul.contact_name, ''),
      coalesce(ul.contact_phone, '')
    )) AS fingerprint
  FROM public.user_listings ul
  WHERE ul.status = 'approved'
    AND ul.property_id IS NULL
), candidate_pairs AS (
  SELECT
    p.property_id,
    u.listing_id,
    count(*) OVER (PARTITION BY p.property_id) AS property_candidate_count,
    count(*) OVER (PARTITION BY u.listing_id) AS listing_candidate_count
  FROM property_fingerprints p
  JOIN listing_fingerprints u USING (fingerprint)
), unique_pairs AS (
  SELECT property_id, listing_id
  FROM candidate_pairs
  WHERE property_candidate_count = 1
    AND listing_candidate_count = 1
)
UPDATE public.user_listings ul
SET property_id = pairs.property_id,
    updated_at = now()
FROM unique_pairs pairs
WHERE ul.id = pairs.listing_id
  AND ul.property_id IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_listings already_linked
    WHERE already_linked.property_id = pairs.property_id
  );

NOTIFY pgrst, 'reload schema';
