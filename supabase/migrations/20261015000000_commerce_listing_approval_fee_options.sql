-- =============================================================================
-- Commerce listing approval fee options for Admin UI
-- Read-only server-side option resolver. Production execution is user-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.commerce_get_listing_approval_fee_options(
  p_listing_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_listing public.user_listings%ROWTYPE;
  v_neighborhood_id uuid;
  v_available_minor bigint := 0;
  v_reserved_minor bigint := 0;
  v_products jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_listing_id IS NULL THEN
    RAISE EXCEPTION 'Listing is required.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_listing
  FROM public.user_listings l
  WHERE l.id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT n.id INTO v_neighborhood_id
  FROM public.neighborhoods n
  WHERE n.slug = v_listing.neighborhood_slug
  LIMIT 1;

  IF NOT public.is_admin()
     AND (
       NOT public.is_customer_member(v_listing.user_id)
       OR NOT public.has_staff_permission(
         'user-listings', 'approve', v_listing.area_id, v_listing.district_id,
         v_listing.ward_id, v_neighborhood_id
       )
     ) THEN
    RAISE EXCEPTION 'Không có quyền xem fee options trong phạm vi này' USING ERRCODE = '42501';
  END IF;

  SELECT w.available_minor, w.reserved_minor
    INTO v_available_minor, v_reserved_minor
    FROM public.commerce_wallet_accounts w
   WHERE w.owner_user_id = v_listing.user_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(option_row) ORDER BY
      option_row.rule_specificity DESC,
      option_row.priority DESC,
      option_row.version DESC,
      option_row.code), '[]'::jsonb)
    INTO v_products
  FROM (
    SELECT DISTINCT ON (p.id)
      r.id AS rule_id,
      p.id AS fee_product_id,
      p.code,
      p.version,
      p.name,
      p.description,
      p.amount_minor,
      p.currency,
      p.duration_days,
      p.terms_version,
      r.listing_type,
      r.property_type_id,
      r.priority,
      CASE WHEN r.property_type_id IS NULL THEN 'listing_type' ELSE 'property_type' END AS rule_specificity
    FROM public.commerce_fee_product_rules r
    JOIN public.commerce_fee_products p ON p.id = r.fee_product_id
    WHERE r.listing_type = v_listing.listing_type
      AND (r.property_type_id IS NULL OR r.property_type_id = v_listing.property_type_id)
      AND r.is_active = true
      AND (r.valid_from IS NULL OR r.valid_from <= clock_timestamp())
      AND (r.valid_until IS NULL OR r.valid_until > clock_timestamp())
      AND p.product_kind = 'listing_basic'
      AND p.is_active = true
      AND (p.valid_from IS NULL OR p.valid_from <= clock_timestamp())
      AND (p.valid_until IS NULL OR p.valid_until > clock_timestamp())
    ORDER BY p.id,
      (r.property_type_id IS NOT NULL) DESC,
      r.priority DESC,
      p.version DESC,
      r.id
  ) option_row;

  RETURN jsonb_build_object(
    'listing_id', p_listing_id,
    'owner_user_id', v_listing.user_id,
    'listing_type', v_listing.listing_type,
    'property_type_id', v_listing.property_type_id,
    'available_minor', v_available_minor,
    'reserved_minor', v_reserved_minor,
    'products', v_products
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_get_listing_approval_fee_options(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commerce_get_listing_approval_fee_options(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
