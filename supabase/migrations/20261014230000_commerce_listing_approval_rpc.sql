-- =============================================================================
-- Commerce listing approval with explicit Admin free/paid fee decision
-- Atomic approval contract. Production execution is user-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.commerce_reserve_listing_fee_for_approval_internal(
  p_user_listing_id uuid,
  p_owner_user_id uuid,
  p_fee_product_id uuid,
  p_rule_id uuid,
  p_idempotency_key text,
  p_approval_cycle integer
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing public.user_listings%ROWTYPE;
  v_product public.commerce_fee_products%ROWTYPE;
  v_wallet public.commerce_wallet_accounts%ROWTYPE;
  v_reservation public.commerce_wallet_fee_reservations%ROWTYPE;
  v_cycle integer;
  v_reservation_key text := 'approval-fee:' || md5(p_idempotency_key);
  v_expires_at timestamptz := clock_timestamp() + interval '24 hours';
  v_actor uuid := auth.uid();
BEGIN
  IF p_user_listing_id IS NULL OR p_owner_user_id IS NULL OR p_fee_product_id IS NULL THEN
    RAISE EXCEPTION 'Listing, owner and fee product are required.' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 160 THEN
    RAISE EXCEPTION 'Invalid idempotency key.' USING ERRCODE = '22023';
  END IF;
  IF p_approval_cycle IS NULL OR p_approval_cycle < 1 THEN
    RAISE EXCEPTION 'Invalid approval cycle.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_listing
  FROM public.user_listings l
  WHERE l.id = p_user_listing_id
    AND l.user_id = p_owner_user_id
    AND l.status IN ('pending', 'rejected', 'expired')
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approvable listing not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_product
  FROM public.commerce_fee_products p
  WHERE p.id = p_fee_product_id
    AND p.product_kind = 'listing_basic'
    AND p.is_active = true
    AND (p.valid_from IS NULL OR p.valid_from <= clock_timestamp())
    AND (p.valid_until IS NULL OR p.valid_until > clock_timestamp())
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resolved listing fee product is no longer available.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_reservation
  FROM public.commerce_wallet_fee_reservations r
  WHERE r.owner_user_id = p_owner_user_id
    AND r.idempotency_key = v_reservation_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_reservation.user_listing_id = p_user_listing_id
       AND v_reservation.basic_product_id = p_fee_product_id
       AND v_reservation.total_minor = v_product.amount_minor
       AND v_reservation.status = 'reserved' THEN
      RETURN v_reservation.id;
    END IF;
    RAISE EXCEPTION 'Approval fee idempotency key was already used for another reservation.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.commerce_wallet_accounts(owner_user_id)
  VALUES (p_owner_user_id)
  ON CONFLICT (owner_user_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.commerce_wallet_accounts w
  WHERE w.owner_user_id = p_owner_user_id
  FOR UPDATE;

  IF v_wallet.currency <> 'VND' THEN
    RAISE EXCEPTION 'Unsupported wallet currency.' USING ERRCODE = '23514';
  END IF;
  IF v_wallet.available_minor < v_product.amount_minor THEN
    RAISE EXCEPTION 'Insufficient available wallet balance.' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(max(r.submission_cycle), 0) + 1
    INTO v_cycle
    FROM public.commerce_wallet_fee_reservations r
   WHERE r.user_listing_id = p_user_listing_id;

  UPDATE public.commerce_wallet_accounts w
  SET available_minor = w.available_minor - v_product.amount_minor,
      reserved_minor = w.reserved_minor + v_product.amount_minor,
      updated_at = clock_timestamp()
  WHERE w.owner_user_id = p_owner_user_id
    AND w.available_minor >= v_product.amount_minor
  RETURNING * INTO v_wallet;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient available wallet balance.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.commerce_wallet_fee_reservations(
    owner_user_id, user_listing_id, submission_cycle, basic_product_id,
    total_minor, currency, status, pricing_snapshot,
    idempotency_key, expires_at
  ) VALUES (
    p_owner_user_id, p_user_listing_id, v_cycle, v_product.id,
    v_product.amount_minor, v_product.currency, 'reserved',
    jsonb_build_array(jsonb_build_object(
      'rule_id', p_rule_id,
      'approval_cycle', p_approval_cycle,
      'product_id', v_product.id,
      'code', v_product.code,
      'version', v_product.version,
      'name', v_product.name,
      'product_kind', v_product.product_kind,
      'amount_minor', v_product.amount_minor,
      'currency', v_product.currency,
      'duration_days', v_product.duration_days,
      'terms_version', v_product.terms_version
    )),
    v_reservation_key, v_expires_at
  ) RETURNING * INTO v_reservation;

  INSERT INTO public.commerce_wallet_ledger(
    owner_user_id, operation, amount_minor, currency,
    available_after, reserved_after, fee_reservation_id,
    idempotency_key, metadata
  ) VALUES (
    p_owner_user_id, 'fee_reserve', v_product.amount_minor, v_product.currency,
    v_wallet.available_minor, v_wallet.reserved_minor, v_reservation.id,
    v_reservation_key,
    jsonb_build_object(
      'listing_id', p_user_listing_id,
      'approval_cycle', p_approval_cycle,
      'submission_cycle', v_cycle,
      'rule_id', p_rule_id
    )
  );

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    p_owner_user_id, v_actor,
    CASE
      WHEN v_actor IS NULL THEN 'system'
      WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_actor AND p.role = 'staff') THEN 'staff'
      ELSE 'admin'
    END,
    'wallet_fee_reservation', v_reservation.id,
    'wallet_listing_fee_reserved', p_idempotency_key,
    jsonb_build_object(
      'listing_id', p_user_listing_id,
      'approval_cycle', p_approval_cycle,
      'rule_id', p_rule_id,
      'product_id', v_product.id,
      'total_minor', v_product.amount_minor,
      'available_after', v_wallet.available_minor,
      'reserved_after', v_wallet.reserved_minor
    )
  );

  RETURN v_reservation.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_user_listing_with_fee_decision(
  p_listing_id uuid,
  p_fee_mode text,
  p_idempotency_key text,
  p_fee_product_code text DEFAULT NULL,
  p_manual_reason text DEFAULT NULL
)
RETURNS TABLE (
  listing_id uuid,
  property_id uuid,
  fee_mode text,
  fee_product_id uuid,
  fee_product_code text,
  fee_product_version integer,
  amount_minor bigint,
  currency text,
  duration_days integer,
  terms_version text,
  approval_cycle integer,
  idempotency_key text,
  receipt_number text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_fee_mode text := lower(btrim(COALESCE(p_fee_mode, '')));
  v_product_code text := NULLIF(lower(btrim(COALESCE(p_fee_product_code, ''))), '');
  v_reason text := NULLIF(btrim(COALESCE(p_manual_reason, '')), '');
  v_listing public.user_listings%ROWTYPE;
  v_existing public.commerce_listing_approval_fee_decisions%ROWTYPE;
  v_decision public.commerce_listing_approval_fee_decisions%ROWTYPE;
  v_resolved record;
  v_neighborhood_id uuid;
  v_property_id uuid;
  v_decision_id uuid;
  v_reservation_id uuid;
  v_receipt_number text;
  v_approval_cycle integer;
  v_expires_at timestamptz;
  v_prior_property_active boolean;
  v_decision_json jsonb;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_listing_id IS NULL THEN
    RAISE EXCEPTION 'Listing is required.' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 160 THEN
    RAISE EXCEPTION 'Invalid idempotency key.' USING ERRCODE = '22023';
  END IF;
  IF v_fee_mode NOT IN ('free', 'paid') THEN
    RAISE EXCEPTION 'Fee mode must be free or paid.' USING ERRCODE = '22023';
  END IF;
  IF v_fee_mode = 'free' THEN
    IF v_reason IS NULL OR char_length(v_reason) > 1000 THEN
      RAISE EXCEPTION 'Free approval requires a manual reason.' USING ERRCODE = '22023';
    END IF;
    IF v_product_code IS NOT NULL THEN
      RAISE EXCEPTION 'Free approval cannot include a fee product.' USING ERRCODE = '22023';
    END IF;
  ELSE
    IF v_product_code IS NULL THEN
      RAISE EXCEPTION 'Paid approval requires a fee product.' USING ERRCODE = '22023';
    END IF;
    IF v_reason IS NOT NULL THEN
      RAISE EXCEPTION 'Paid approval cannot include a manual free reason.' USING ERRCODE = '22023';
    END IF;
  END IF;

  SELECT * INTO v_existing
  FROM public.commerce_listing_approval_fee_decisions d
  WHERE d.user_listing_id = p_listing_id
    AND d.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_existing.user_listing_id IS DISTINCT FROM p_listing_id
       OR v_existing.fee_mode IS DISTINCT FROM v_fee_mode
       OR (v_fee_mode = 'free' AND v_existing.manual_reason IS DISTINCT FROM v_reason)
       OR (v_fee_mode = 'paid' AND v_existing.fee_product_code IS DISTINCT FROM v_product_code) THEN
      RAISE EXCEPTION 'Approval idempotency key was already used for another decision.' USING ERRCODE = '22023';
    END IF;

    SELECT l.property_id INTO v_property_id
    FROM public.user_listings l
    WHERE l.id = p_listing_id
      AND l.status = 'approved';
    IF v_property_id IS NULL THEN
      RAISE EXCEPTION 'Approval idempotency state is incomplete.' USING ERRCODE = '40001';
    END IF;

    SELECT r.receipt_number
      INTO v_receipt_number
      FROM public.commerce_wallet_fee_reservations fr
      JOIN public.commerce_wallet_receipts r ON r.fee_reservation_id = fr.id
     WHERE fr.user_listing_id = p_listing_id
       AND fr.submission_cycle = v_existing.approval_cycle
     ORDER BY r.issued_at DESC
     LIMIT 1;

    RETURN QUERY SELECT
      p_listing_id,
      v_property_id,
      v_existing.fee_mode,
      v_existing.fee_product_id,
      v_existing.fee_product_code,
      v_existing.fee_product_version,
      v_existing.amount_minor,
      v_existing.currency,
      v_existing.duration_days,
      v_existing.terms_version,
      v_existing.approval_cycle,
      v_existing.idempotency_key,
      v_receipt_number;
    RETURN;
  END IF;

  SELECT * INTO v_listing
  FROM public.user_listings l
  WHERE l.id = p_listing_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Không tìm thấy tin đăng' USING ERRCODE = 'P0002';
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
    RAISE EXCEPTION 'Không có quyền duyệt tin đăng trong phạm vi này' USING ERRCODE = '42501';
  END IF;

  v_actor_role := CASE
    WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_actor AND p.role = 'staff') THEN 'staff'
    ELSE 'admin'
  END;

  IF v_listing.status = 'approved' THEN
    RAISE EXCEPTION 'Tin đăng đã được duyệt; không thể duyệt trùng' USING ERRCODE = 'P0001';
  END IF;
  IF v_listing.status NOT IN ('pending', 'rejected', 'expired') THEN
    RAISE EXCEPTION 'Trạng thái tin đăng không thể duyệt: %', v_listing.status USING ERRCODE = 'P0001';
  END IF;

  IF v_listing.property_id IS NOT NULL THEN
    SELECT p.is_active INTO v_prior_property_active
    FROM public.properties p
    WHERE p.id = v_listing.property_id
    FOR UPDATE;
    IF COALESCE(v_prior_property_active, false) THEN
      RAISE EXCEPTION 'Tin đăng còn property công khai liên kết; cần xử lý trạng thái hiện tại trước khi duyệt lại'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_fee_mode = 'paid' THEN
    SELECT * INTO v_resolved
    FROM public.commerce_resolve_listing_fee_product(p_listing_id, v_product_code);

    SELECT COALESCE(max(d.approval_cycle), 0) + 1
      INTO v_approval_cycle
      FROM public.commerce_listing_approval_fee_decisions d
     WHERE d.user_listing_id = p_listing_id;

    IF EXISTS (
      SELECT 1
      FROM public.commerce_wallet_fee_reservations r
      WHERE r.user_listing_id = p_listing_id
        AND r.owner_user_id = v_listing.user_id
        AND r.status = 'reserved'
    ) THEN
      PERFORM public.commerce_release_listing_fee_internal(p_listing_id, v_listing.user_id, 'timeout');
    END IF;

    v_reservation_id := public.commerce_reserve_listing_fee_for_approval_internal(
      p_listing_id,
      v_listing.user_id,
      v_resolved.fee_product_id,
      v_resolved.rule_id,
      p_idempotency_key,
      v_approval_cycle
    );
  ELSE
    SELECT COALESCE(max(d.approval_cycle), 0) + 1
      INTO v_approval_cycle
      FROM public.commerce_listing_approval_fee_decisions d
     WHERE d.user_listing_id = p_listing_id;

    IF EXISTS (
      SELECT 1
      FROM public.commerce_wallet_fee_reservations r
      WHERE r.user_listing_id = p_listing_id
        AND r.owner_user_id = v_listing.user_id
        AND r.status = 'reserved'
    ) THEN
      PERFORM public.commerce_release_listing_fee_internal(p_listing_id, v_listing.user_id, 'free_approval');
    END IF;
  END IF;

  v_expires_at := CASE
    WHEN v_listing.expires_at IS NOT NULL AND v_listing.expires_at > v_now
      THEN v_listing.expires_at
    ELSE v_now + interval '60 days'
  END;

  INSERT INTO public.properties (
    title, description,
    price, price_unit, price_label, price_per_month, loan_support, listing_type,
    area_sqm, address, city, district, ward,
    area_id, district_id, neighborhood_slug, property_type_id,
    image_url, images, legal_status,
    bedrooms, bathrooms, direction,
    contact_name, contact_phone, contact_zalo,
    amenities, latitude, longitude, formatted_address, vr_tour_url, video_url,
    meta_title, meta_description, focus_keywords, schema_markup, faq,
    is_active, is_featured, is_hot
  ) VALUES (
    v_listing.title, v_listing.description,
    v_listing.price, v_listing.price_unit, v_listing.price_label, v_listing.price_per_month, v_listing.loan_support, v_listing.listing_type,
    v_listing.area_sqm, v_listing.address, v_listing.city, v_listing.district, v_listing.ward,
    v_listing.area_id, v_listing.district_id, v_listing.neighborhood_slug, v_listing.property_type_id,
    v_listing.image_url, v_listing.images, v_listing.legal_status,
    v_listing.bedrooms, v_listing.bathrooms, v_listing.direction,
    v_listing.contact_name, v_listing.contact_phone, v_listing.contact_zalo,
    v_listing.amenities, v_listing.latitude, v_listing.longitude, v_listing.formatted_address, v_listing.vr_tour_url, v_listing.video_url,
    v_listing.meta_title, v_listing.meta_description, v_listing.focus_keywords, v_listing.schema_markup, v_listing.faq,
    true, false, false
  ) RETURNING id INTO v_property_id;

  IF v_fee_mode = 'free' THEN
    INSERT INTO public.commerce_listing_approval_fee_decisions(
      user_listing_id, owner_user_id, approval_cycle, fee_mode,
      manual_reason, idempotency_key, decided_by, approved_at
    ) VALUES (
      p_listing_id, v_listing.user_id, v_approval_cycle, 'free',
      v_reason, p_idempotency_key, v_actor, v_now
    ) RETURNING * INTO v_decision;
  ELSE
    INSERT INTO public.commerce_listing_approval_fee_decisions(
      user_listing_id, owner_user_id, approval_cycle, fee_mode,
      fee_product_id, fee_product_code, fee_product_version,
      amount_minor, currency, duration_days, terms_version,
      idempotency_key, decided_by, approved_at
    ) VALUES (
      p_listing_id, v_listing.user_id, v_approval_cycle, 'paid',
      v_resolved.fee_product_id, v_resolved.code, v_resolved.version,
      v_resolved.amount_minor, v_resolved.currency, v_resolved.duration_days, v_resolved.terms_version,
      p_idempotency_key, v_actor, v_now
    ) RETURNING * INTO v_decision;
  END IF;

  SELECT to_jsonb(d) INTO v_decision_json
  FROM public.commerce_listing_approval_fee_decisions d
  WHERE d.id = v_decision.id;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    v_listing.user_id, v_actor, v_actor_role, 'user_listing_approval', p_listing_id,
    'listing_fee_decision_created', p_idempotency_key, v_decision_json
  );

  UPDATE public.user_listings
  SET status = 'approved',
      property_id = v_property_id,
      expires_at = v_expires_at,
      reject_reason = NULL
  WHERE id = p_listing_id;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    v_listing.user_id, v_actor, v_actor_role, 'user_listing', p_listing_id,
    CASE WHEN v_fee_mode = 'free' THEN 'listing_approved_free' ELSE 'listing_approved_paid' END,
    p_idempotency_key,
    jsonb_build_object(
      'status', 'approved',
      'property_id', v_property_id,
      'approval_cycle', v_approval_cycle,
      'fee_mode', v_fee_mode,
      'fee_product_id', v_decision.fee_product_id,
      'amount_minor', v_decision.amount_minor,
      'duration_days', v_decision.duration_days
    )
  );

  IF v_fee_mode = 'paid' THEN
    SELECT r.receipt_number
      INTO v_receipt_number
      FROM public.commerce_wallet_fee_reservations fr
      JOIN public.commerce_wallet_receipts r ON r.fee_reservation_id = fr.id
     WHERE fr.id = v_reservation_id
     ORDER BY r.issued_at DESC
     LIMIT 1;
  END IF;

  RETURN QUERY SELECT
    p_listing_id,
    v_property_id,
    v_decision.fee_mode,
    v_decision.fee_product_id,
    v_decision.fee_product_code,
    v_decision.fee_product_version,
    v_decision.amount_minor,
    v_decision.currency,
    v_decision.duration_days,
    v_decision.terms_version,
    v_decision.approval_cycle,
    v_decision.idempotency_key,
    v_receipt_number;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_reserve_listing_fee_for_approval_internal(uuid, uuid, uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.approve_user_listing(uuid);
GRANT EXECUTE ON FUNCTION public.approve_user_listing_with_fee_decision(uuid, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
