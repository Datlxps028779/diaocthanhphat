-- =============================================================================
-- Commerce wallet listing basic-fee lifecycle
-- Wallet-enrolled owners reserve on pending, capture on approval, release before approval.
-- Sponsored add-ons use a separate lifecycle and are not bundled into this reservation.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.commerce_reserve_listing_fee_internal(
  p_user_listing_id uuid,
  p_owner_user_id uuid,
  p_basic_product_code text,
  p_idempotency_key text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing public.user_listings%ROWTYPE;
  v_wallet public.commerce_wallet_accounts%ROWTYPE;
  v_product public.commerce_fee_products%ROWTYPE;
  v_reservation public.commerce_wallet_fee_reservations%ROWTYPE;
  v_cycle integer;
  v_total bigint;
  v_key text;
  v_expiry timestamptz := COALESCE(p_expires_at, clock_timestamp() + interval '24 hours');
  v_actor uuid := auth.uid();
BEGIN
  IF p_user_listing_id IS NULL OR p_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Listing and owner are required.' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NOT NULL AND char_length(p_idempotency_key) NOT BETWEEN 16 AND 160 THEN
    RAISE EXCEPTION 'Invalid idempotency key.' USING ERRCODE = '22023';
  END IF;
  IF v_expiry <= clock_timestamp() THEN
    RAISE EXCEPTION 'Fee reservation expiry must be in the future.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_listing
  FROM public.user_listings l
  WHERE l.id = p_user_listing_id
    AND l.user_id = p_owner_user_id
    AND l.status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owned pending listing not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_reservation
  FROM public.commerce_wallet_fee_reservations r
  WHERE r.user_listing_id = p_user_listing_id
    AND r.status = 'reserved'
  FOR UPDATE;
  IF FOUND THEN
    IF p_basic_product_code IS NULL OR EXISTS (
      SELECT 1 FROM public.commerce_fee_products p
      WHERE p.id = v_reservation.basic_product_id AND p.code = p_basic_product_code
    ) THEN
      RETURN v_reservation.id;
    END IF;
    RAISE EXCEPTION 'Listing already has another reserved fee.' USING ERRCODE = '23505';
  END IF;

  SELECT * INTO v_product
  FROM public.commerce_fee_products p
  WHERE p.product_kind = 'listing_basic'
    AND p.is_active = true
    AND (p.valid_from IS NULL OR p.valid_from <= clock_timestamp())
    AND (p.valid_until IS NULL OR p.valid_until > clock_timestamp())
    AND (
      (p_basic_product_code IS NULL AND p.is_default = true)
      OR p.code = p_basic_product_code
    )
  ORDER BY p.is_default DESC, p.version DESC
  LIMIT 1
  FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Listing basic fee product is not available.' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.commerce_wallet_accounts(owner_user_id)
  VALUES (p_owner_user_id)
  ON CONFLICT (owner_user_id) DO NOTHING;

  SELECT * INTO v_wallet
  FROM public.commerce_wallet_accounts w
  WHERE w.owner_user_id = p_owner_user_id
  FOR UPDATE;

  v_total := v_product.amount_minor;
  IF v_wallet.available_minor < v_total THEN
    RAISE EXCEPTION 'Insufficient available wallet balance.' USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(max(r.submission_cycle), 0) + 1 INTO v_cycle
  FROM public.commerce_wallet_fee_reservations r
  WHERE r.user_listing_id = p_user_listing_id;

  v_key := COALESCE(
    p_idempotency_key,
    'wallet-fee:' || p_user_listing_id::text || ':' || v_cycle::text || ':reserve'
  );

  SELECT * INTO v_reservation
  FROM public.commerce_wallet_fee_reservations r
  WHERE r.owner_user_id = p_owner_user_id AND r.idempotency_key = v_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_reservation.user_listing_id = p_user_listing_id
       AND v_reservation.basic_product_id = v_product.id
       AND v_reservation.total_minor = v_total THEN
      RETURN v_reservation.id;
    END IF;
    RAISE EXCEPTION 'Idempotency key was used for another fee reservation.' USING ERRCODE = '22023';
  END IF;

  UPDATE public.commerce_wallet_accounts w
  SET available_minor = w.available_minor - v_total,
      reserved_minor = w.reserved_minor + v_total,
      updated_at = clock_timestamp()
  WHERE w.owner_user_id = p_owner_user_id
  RETURNING * INTO v_wallet;

  INSERT INTO public.commerce_wallet_fee_reservations(
    owner_user_id, user_listing_id, submission_cycle, basic_product_id,
    total_minor, currency, status, pricing_snapshot,
    idempotency_key, expires_at
  ) VALUES (
    p_owner_user_id, p_user_listing_id, v_cycle, v_product.id,
    v_total, 'VND', 'reserved',
    jsonb_build_array(jsonb_build_object(
      'product_id', v_product.id,
      'code', v_product.code,
      'version', v_product.version,
      'name', v_product.name,
      'product_kind', v_product.product_kind,
      'amount_minor', v_product.amount_minor,
      'duration_days', v_product.duration_days,
      'terms_version', v_product.terms_version
    )),
    v_key, v_expiry
  ) RETURNING * INTO v_reservation;

  INSERT INTO public.commerce_wallet_ledger(
    owner_user_id, operation, amount_minor, currency,
    available_after, reserved_after, fee_reservation_id,
    idempotency_key, metadata
  ) VALUES (
    p_owner_user_id, 'fee_reserve', v_total, 'VND',
    v_wallet.available_minor, v_wallet.reserved_minor, v_reservation.id,
    v_key,
    jsonb_build_object('listing_id', p_user_listing_id, 'submission_cycle', v_cycle)
  );

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    p_owner_user_id, v_actor,
    CASE WHEN v_actor = p_owner_user_id THEN 'owner' WHEN v_actor IS NULL THEN 'system' ELSE 'admin' END,
    'wallet_fee_reservation', v_reservation.id,
    'wallet_listing_fee_reserved', v_key,
    jsonb_build_object(
      'listing_id', p_user_listing_id,
      'submission_cycle', v_cycle,
      'total_minor', v_total,
      'available_after', v_wallet.available_minor,
      'reserved_after', v_wallet.reserved_minor
    )
  );

  RETURN v_reservation.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_reserve_listing_fee(
  p_user_listing_id uuid,
  p_basic_product_code text,
  p_idempotency_key text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  RETURN public.commerce_reserve_listing_fee_internal(
    p_user_listing_id, v_actor, p_basic_product_code, p_idempotency_key, p_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_capture_listing_fee_internal(
  p_user_listing_id uuid,
  p_owner_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing public.user_listings%ROWTYPE;
  v_wallet public.commerce_wallet_accounts%ROWTYPE;
  v_reservation public.commerce_wallet_fee_reservations%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_max_duration integer;
  v_windows jsonb;
  v_key text;
  v_receipt text;
  v_actor uuid := auth.uid();
BEGIN
  SELECT * INTO v_listing
  FROM public.user_listings l
  WHERE l.id = p_user_listing_id
    AND l.user_id = p_owner_user_id
    AND l.status = 'approved'
    AND l.property_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.properties p
      WHERE p.id = l.property_id AND p.is_active = true
      FOR KEY SHARE
    )
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved listing with active property not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_reservation
  FROM public.commerce_wallet_fee_reservations r
  WHERE r.user_listing_id = p_user_listing_id
    AND r.owner_user_id = p_owner_user_id
    AND r.status = 'reserved'
  ORDER BY r.submission_cycle DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved wallet listing has no reserved fee.' USING ERRCODE = 'P0001';
  END IF;
  IF v_reservation.expires_at <= v_now THEN
    RAISE EXCEPTION 'Listing fee reservation expired before approval.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_wallet
  FROM public.commerce_wallet_accounts w
  WHERE w.owner_user_id = p_owner_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_wallet.reserved_minor < v_reservation.total_minor THEN
    RAISE EXCEPTION 'Reserved wallet balance is inconsistent.' USING ERRCODE = '23514';
  END IF;

  SELECT max((item->>'duration_days')::integer),
         COALESCE(jsonb_agg(item || jsonb_build_object(
           'starts_at', v_now,
           'ends_at', v_now + make_interval(days => (item->>'duration_days')::integer)
         )), '[]'::jsonb)
  INTO v_max_duration, v_windows
  FROM jsonb_array_elements(v_reservation.pricing_snapshot) item;

  UPDATE public.commerce_wallet_accounts w
  SET reserved_minor = w.reserved_minor - v_reservation.total_minor,
      updated_at = v_now
  WHERE w.owner_user_id = p_owner_user_id
  RETURNING * INTO v_wallet;

  UPDATE public.commerce_wallet_fee_reservations r
  SET status = 'captured',
      property_id = v_listing.property_id,
      benefit_windows = v_windows,
      starts_at = v_now,
      ends_at = v_now + make_interval(days => v_max_duration),
      captured_at = v_now,
      updated_at = v_now
  WHERE r.id = v_reservation.id;

  v_key := 'wallet-fee:' || v_reservation.id::text || ':capture';
  INSERT INTO public.commerce_wallet_ledger(
    owner_user_id, operation, amount_minor, currency,
    available_after, reserved_after, fee_reservation_id,
    idempotency_key, metadata
  ) VALUES (
    p_owner_user_id, 'fee_capture', v_reservation.total_minor, 'VND',
    v_wallet.available_minor, v_wallet.reserved_minor, v_reservation.id,
    v_key,
    jsonb_build_object('listing_id', p_user_listing_id, 'property_id', v_listing.property_id)
  ) ON CONFLICT (owner_user_id, idempotency_key) DO NOTHING;

  v_receipt := 'FEE-' || replace(v_reservation.id::text, '-', '');
  INSERT INTO public.commerce_wallet_receipts(
    owner_user_id, receipt_number, receipt_kind, document_type,
    status, amount_minor, currency, fee_reservation_id, snapshot
  ) VALUES (
    p_owner_user_id, v_receipt, 'listing_fee', 'internal_receipt',
    'issued', v_reservation.total_minor, 'VND', v_reservation.id,
    jsonb_build_object(
      'listing_id', p_user_listing_id,
      'property_id', v_listing.property_id,
      'pricing_snapshot', v_reservation.pricing_snapshot
    )
  ) ON CONFLICT (receipt_number) DO NOTHING;

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
    'wallet_listing_fee_captured', v_key,
    jsonb_build_object(
      'listing_id', p_user_listing_id,
      'property_id', v_listing.property_id,
      'total_minor', v_reservation.total_minor,
      'available_after', v_wallet.available_minor,
      'reserved_after', v_wallet.reserved_minor
    )
  );

  RETURN v_reservation.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_release_listing_fee_internal(
  p_user_listing_id uuid,
  p_owner_user_id uuid,
  p_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_wallet public.commerce_wallet_accounts%ROWTYPE;
  v_reservation public.commerce_wallet_fee_reservations%ROWTYPE;
  v_status text;
  v_key text;
  v_now timestamptz := clock_timestamp();
  v_actor uuid := auth.uid();
BEGIN
  IF p_reason NOT IN ('rejected','expired','deleted','timeout','free_approval') THEN
    RAISE EXCEPTION 'Invalid listing fee release reason.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_reservation
  FROM public.commerce_wallet_fee_reservations r
  WHERE r.user_listing_id = p_user_listing_id
    AND r.owner_user_id = p_owner_user_id
    AND r.status = 'reserved'
  ORDER BY r.submission_cycle DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_wallet
  FROM public.commerce_wallet_accounts w
  WHERE w.owner_user_id = p_owner_user_id
  FOR UPDATE;
  IF NOT FOUND OR v_wallet.reserved_minor < v_reservation.total_minor THEN
    RAISE EXCEPTION 'Reserved wallet balance is inconsistent.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.commerce_wallet_accounts w
  SET available_minor = w.available_minor + v_reservation.total_minor,
      reserved_minor = w.reserved_minor - v_reservation.total_minor,
      updated_at = v_now
  WHERE w.owner_user_id = p_owner_user_id
  RETURNING * INTO v_wallet;

  v_status := CASE WHEN p_reason IN ('expired','timeout') THEN 'expired' ELSE 'released' END;
  UPDATE public.commerce_wallet_fee_reservations r
  SET status = v_status,
      released_at = v_now,
      updated_at = v_now
  WHERE r.id = v_reservation.id;

  v_key := 'wallet-fee:' || v_reservation.id::text || ':release:' || p_reason;
  INSERT INTO public.commerce_wallet_ledger(
    owner_user_id, operation, amount_minor, currency,
    available_after, reserved_after, fee_reservation_id,
    idempotency_key, metadata
  ) VALUES (
    p_owner_user_id, 'fee_release', v_reservation.total_minor, 'VND',
    v_wallet.available_minor, v_wallet.reserved_minor, v_reservation.id,
    v_key,
    jsonb_build_object('listing_id', p_user_listing_id, 'reason', p_reason)
  ) ON CONFLICT (owner_user_id, idempotency_key) DO NOTHING;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    p_owner_user_id, v_actor,
    CASE WHEN v_actor = p_owner_user_id THEN 'owner' WHEN v_actor IS NULL THEN 'system' ELSE 'admin' END,
    'wallet_fee_reservation', v_reservation.id,
    'wallet_listing_fee_released', v_key,
    jsonb_build_object(
      'listing_id', p_user_listing_id,
      'reason', p_reason,
      'available_after', v_wallet.available_minor,
      'reserved_after', v_wallet.reserved_minor
    )
  );

  RETURN v_reservation.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_commerce_wallet_listing_fee_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  v_owner_user_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_accounts w
    WHERE w.owner_user_id = v_owner_user_id
  ) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.commerce_release_listing_fee_internal(v_listing_id, v_owner_user_id, 'deleted');
    RETURN OLD;
  END IF;

  IF NEW.status = 'pending' THEN
    PERFORM public.commerce_reserve_listing_fee_internal(
      v_listing_id, v_owner_user_id, NULL, NULL, NULL
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'approved' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.commerce_capture_listing_fee_internal(v_listing_id, v_owner_user_id);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status IN ('rejected','expired') AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.commerce_release_listing_fee_internal(v_listing_id, v_owner_user_id, NEW.status);
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_reserve_listing_fee_internal(uuid, uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_capture_listing_fee_internal(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_release_listing_fee_internal(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_commerce_wallet_listing_fee_lifecycle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_reserve_listing_fee(uuid, text, text, timestamptz) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.commerce_reserve_listing_fee(uuid, text, text, timestamptz) TO authenticated;

DROP TRIGGER IF EXISTS trg_commerce_wallet_listing_fee_lifecycle ON public.user_listings;
CREATE TRIGGER trg_commerce_wallet_listing_fee_lifecycle
  AFTER INSERT OR UPDATE ON public.user_listings
  FOR EACH ROW EXECUTE FUNCTION public.sync_commerce_wallet_listing_fee_lifecycle();

DROP TRIGGER IF EXISTS trg_commerce_wallet_listing_fee_delete ON public.user_listings;
CREATE TRIGGER trg_commerce_wallet_listing_fee_delete
  BEFORE DELETE ON public.user_listings
  FOR EACH ROW EXECUTE FUNCTION public.sync_commerce_wallet_listing_fee_lifecycle();

NOTIFY pgrst, 'reload schema';
