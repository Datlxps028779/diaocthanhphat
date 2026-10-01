-- =============================================================================
-- Commerce RPC foundation: server-priced orders and atomic quota reservations
-- Additive only. Production execution is user-run.
-- =============================================================================

ALTER TABLE public.commerce_quota_ledger
  DROP CONSTRAINT IF EXISTS commerce_quota_ledger_delta_check;
ALTER TABLE public.commerce_quota_ledger
  ADD CONSTRAINT commerce_quota_ledger_delta_check CHECK (
    (operation = 'consume' AND delta = 0)
    OR (operation <> 'consume' AND delta <> 0)
  );

CREATE OR REPLACE FUNCTION public.commerce_create_order(
  p_package_version_id uuid,
  p_quantity integer,
  p_idempotency_key text
)
RETURNS TABLE(
  order_id uuid,
  order_number bigint,
  order_status text,
  subtotal_minor bigint,
  tax_minor bigint,
  total_minor bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_package public.commerce_packages%ROWTYPE;
  v_version public.commerce_package_versions%ROWTYPE;
  v_order public.commerce_orders%ROWTYPE;
  v_existing_item public.commerce_order_items%ROWTYPE;
  v_subtotal bigint;
  v_tax bigint;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > 100 THEN
    RAISE EXCEPTION 'Invalid quantity.' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 160 THEN
    RAISE EXCEPTION 'Invalid idempotency key.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_order
  FROM public.commerce_orders
  WHERE owner_user_id = v_actor
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    SELECT * INTO v_existing_item
    FROM public.commerce_order_items
    WHERE commerce_order_items.order_id = v_order.id
    ORDER BY created_at, id
    LIMIT 1;

    IF NOT FOUND
       OR v_existing_item.package_version_id <> p_package_version_id
       OR v_existing_item.quantity <> p_quantity THEN
      RAISE EXCEPTION 'Idempotency key was already used for another order request.' USING ERRCODE = '22023';
    END IF;

    RETURN QUERY SELECT
      v_order.id, v_order.order_number, v_order.status,
      v_order.subtotal_minor, v_order.tax_minor, v_order.total_minor;
    RETURN;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_actor::text, 140000));

  IF (
    SELECT count(*)
    FROM public.commerce_orders
    WHERE owner_user_id = v_actor
      AND created_at > now() - interval '1 hour'
  ) >= 30 THEN
    RAISE EXCEPTION 'Order creation rate limit exceeded.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_version
  FROM public.commerce_package_versions
  WHERE id = p_package_version_id
    AND status = 'active'
    AND (valid_from IS NULL OR valid_from <= now())
    AND (valid_until IS NULL OR valid_until > now())
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package version is not available.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_package
  FROM public.commerce_packages
  WHERE id = v_version.package_id
    AND is_active = true
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Package is not available.' USING ERRCODE = 'P0002';
  END IF;

  v_subtotal := v_version.unit_amount_minor * p_quantity;
  v_tax := round(v_subtotal::numeric * v_version.tax_rate_basis_points / 10000)::bigint;

  INSERT INTO public.commerce_orders (
    owner_user_id, status, currency, subtotal_minor, tax_minor, total_minor,
    terms_version, package_snapshot, idempotency_key
  ) VALUES (
    v_actor, 'draft', v_version.currency, v_subtotal, v_tax, v_subtotal + v_tax,
    v_version.terms_version,
    jsonb_build_object(
      'package_id', v_package.id,
      'package_code', v_package.code,
      'package_name', v_package.name,
      'package_version_id', v_version.id,
      'version', v_version.version,
      'billing_mode', v_version.billing_mode,
      'billing_period_days', v_version.billing_period_days,
      'benefits', v_version.benefits,
      'unit_amount_minor', v_version.unit_amount_minor,
      'tax_rate_basis_points', v_version.tax_rate_basis_points,
      'currency', v_version.currency,
      'terms_version', v_version.terms_version
    ),
    p_idempotency_key
  )
  ON CONFLICT (owner_user_id, idempotency_key) DO NOTHING
  RETURNING * INTO v_order;

  IF NOT FOUND THEN
    SELECT * INTO v_order
    FROM public.commerce_orders
    WHERE owner_user_id = v_actor
      AND idempotency_key = p_idempotency_key
    FOR UPDATE;

    SELECT * INTO v_existing_item
    FROM public.commerce_order_items
    WHERE commerce_order_items.order_id = v_order.id
    ORDER BY created_at, id
    LIMIT 1;

    IF NOT FOUND
       OR v_existing_item.package_version_id <> p_package_version_id
       OR v_existing_item.quantity <> p_quantity THEN
      RAISE EXCEPTION 'Concurrent idempotency conflict.' USING ERRCODE = '40001';
    END IF;
  ELSE
    INSERT INTO public.commerce_order_items (
      order_id, package_version_id, quantity, unit_amount_minor,
      total_amount_minor, benefit_snapshot
    ) VALUES (
      v_order.id, v_version.id, p_quantity, v_version.unit_amount_minor,
      v_subtotal, v_version.benefits
    );

    INSERT INTO public.commerce_audit_events (
      owner_user_id, actor_id, actor_role, entity_type, entity_id,
      event_type, correlation_id, after_state
    ) VALUES (
      v_actor, v_actor, 'owner', 'order', v_order.id,
      'order_created', p_idempotency_key,
      jsonb_build_object('status', v_order.status, 'total_minor', v_order.total_minor, 'currency', v_order.currency)
    );
  END IF;

  RETURN QUERY SELECT
    v_order.id, v_order.order_number, v_order.status,
    v_order.subtotal_minor, v_order.tax_minor, v_order.total_minor;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_reserve_listing_quota(
  p_entitlement_id uuid,
  p_user_listing_id uuid,
  p_quantity integer,
  p_idempotency_key text,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_entitlement public.commerce_entitlements%ROWTYPE;
  v_listing public.user_listings%ROWTYPE;
  v_reservation public.commerce_quota_reservations%ROWTYPE;
  v_expires_at timestamptz := COALESCE(p_expires_at, now() + interval '24 hours');
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'Invalid quantity.' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 160 THEN
    RAISE EXCEPTION 'Invalid idempotency key.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_entitlement
  FROM public.commerce_entitlements
  WHERE id = p_entitlement_id
  FOR UPDATE;

  IF NOT FOUND
     OR v_entitlement.owner_user_id <> v_actor
     OR v_entitlement.benefit_kind <> 'listing_quota' THEN
    RAISE EXCEPTION 'Listing quota entitlement not found.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_reservation
  FROM public.commerce_quota_reservations
  WHERE entitlement_id = p_entitlement_id
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_reservation.user_listing_id IS DISTINCT FROM p_user_listing_id
       OR v_reservation.quantity <> p_quantity
       OR (p_expires_at IS NOT NULL AND v_reservation.expires_at IS DISTINCT FROM p_expires_at) THEN
      RAISE EXCEPTION 'Idempotency key was already used for another reservation.' USING ERRCODE = '22023';
    END IF;
    RETURN v_reservation.id;
  END IF;

  IF v_expires_at <= now() THEN
    RAISE EXCEPTION 'Reservation expiry must be in the future.' USING ERRCODE = '22023';
  END IF;

  IF v_entitlement.status <> 'active'
     OR (v_entitlement.starts_at IS NOT NULL AND v_entitlement.starts_at > now())
     OR (v_entitlement.ends_at IS NOT NULL AND v_entitlement.ends_at <= now()) THEN
    RAISE EXCEPTION 'Active listing quota entitlement not found.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_listing
  FROM public.user_listings
  WHERE id = p_user_listing_id
    AND user_id = v_actor
    AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Owned pending listing not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_entitlement.quantity_remaining < p_quantity THEN
    RAISE EXCEPTION 'Insufficient listing quota.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.commerce_quota_reservations
    WHERE user_listing_id = p_user_listing_id
      AND status IN ('reserved', 'consumed')
  ) THEN
    RAISE EXCEPTION 'Listing already has an active quota reservation.' USING ERRCODE = '23505';
  END IF;

  UPDATE public.commerce_entitlements
  SET quantity_remaining = quantity_remaining - p_quantity,
      updated_at = now()
  WHERE id = v_entitlement.id
  RETURNING * INTO v_entitlement;

  INSERT INTO public.commerce_quota_reservations (
    entitlement_id, owner_user_id, user_listing_id, quantity,
    status, idempotency_key, expires_at
  ) VALUES (
    v_entitlement.id, v_actor, p_user_listing_id, p_quantity,
    'reserved', p_idempotency_key, v_expires_at
  ) RETURNING * INTO v_reservation;

  INSERT INTO public.commerce_quota_ledger (
    entitlement_id, owner_user_id, user_listing_id, operation,
    delta, balance_after, idempotency_key,
    metadata
  ) VALUES (
    v_entitlement.id, v_actor, p_user_listing_id, 'reserve',
    -p_quantity, v_entitlement.quantity_remaining, p_idempotency_key,
    jsonb_build_object('reservation_id', v_reservation.id)
  );

  RETURN v_reservation.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_consume_listing_quota(
  p_reservation_id uuid,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reservation public.commerce_quota_reservations%ROWTYPE;
  v_entitlement public.commerce_entitlements%ROWTYPE;
  v_existing_ledger public.commerce_quota_ledger%ROWTYPE;
  v_entitlement_id uuid;
  v_approved_at timestamptz;
  v_latest_lifecycle_event_type text;
BEGIN
  IF v_actor IS NULL OR NOT public.is_admin() THEN
    RAISE EXCEPTION 'Admin approval required.' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 160 THEN
    RAISE EXCEPTION 'Invalid idempotency key.' USING ERRCODE = '22023';
  END IF;

  SELECT entitlement_id INTO v_entitlement_id
  FROM public.commerce_quota_reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quota reservation not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_entitlement
  FROM public.commerce_entitlements
  WHERE id = v_entitlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quota entitlement not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_reservation
  FROM public.commerce_quota_reservations
  WHERE id = p_reservation_id
    AND entitlement_id = v_entitlement.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quota reservation changed concurrently.' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_existing_ledger
  FROM public.commerce_quota_ledger
  WHERE entitlement_id = v_entitlement.id
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_ledger.operation = 'consume'
       AND v_existing_ledger.metadata->>'reservation_id' = v_reservation.id::text
       AND v_reservation.status = 'consumed' THEN
      RETURN v_reservation.id;
    END IF;
    RAISE EXCEPTION 'Idempotency key was already used for another quota operation.' USING ERRCODE = '22023';
  END IF;

  IF v_entitlement.status <> 'active'
     OR (v_entitlement.starts_at IS NOT NULL AND v_entitlement.starts_at > now())
     OR (v_entitlement.ends_at IS NOT NULL AND v_entitlement.ends_at <= now()) THEN
    RAISE EXCEPTION 'Active quota entitlement not found.' USING ERRCODE = 'P0001';
  END IF;

  IF v_reservation.status = 'consumed' THEN
    RAISE EXCEPTION 'Reservation was consumed with another idempotency key.' USING ERRCODE = '22023';
  END IF;
  IF v_reservation.status <> 'reserved' THEN
    RAISE EXCEPTION 'Quota reservation is not consumable.' USING ERRCODE = 'P0001';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.user_listings l
    JOIN public.properties p ON p.id = l.property_id AND p.is_active = true
    WHERE l.id = v_reservation.user_listing_id
      AND l.user_id = v_reservation.owner_user_id
      AND l.status = 'approved'
    FOR UPDATE OF l, p
  ) THEN
    RAISE EXCEPTION 'Approved listing with active property not found.' USING ERRCODE = 'P0002';
  END IF;

  IF v_reservation.expires_at <= now() THEN
    SELECT event_type, occurred_at
    INTO v_latest_lifecycle_event_type, v_approved_at
    FROM public.user_listing_lifecycle_events
    WHERE listing_id = v_reservation.user_listing_id
      AND event_type IN ('submitted', 'approved', 'rejected', 'resubmitted', 'renewed', 'expired')
    ORDER BY occurred_at DESC, (to_status = 'approved') DESC, id DESC
    LIMIT 1;

    IF v_latest_lifecycle_event_type IS DISTINCT FROM 'approved'
       OR v_approved_at < v_reservation.created_at
       OR v_approved_at > v_reservation.expires_at THEN
      RAISE EXCEPTION 'Expired reservation was not approved within its validity window.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  UPDATE public.commerce_quota_reservations
  SET status = 'consumed', consumed_at = now(), updated_at = now()
  WHERE id = v_reservation.id;

  INSERT INTO public.commerce_quota_ledger (
    entitlement_id, owner_user_id, user_listing_id, operation,
    delta, balance_after, idempotency_key,
    metadata
  ) VALUES (
    v_entitlement.id, v_entitlement.owner_user_id, v_reservation.user_listing_id, 'consume',
    0, v_entitlement.quantity_remaining, p_idempotency_key,
    jsonb_build_object('reservation_id', v_reservation.id, 'approved_by', v_actor)
  );

  RETURN v_reservation.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_release_listing_quota(
  p_reservation_id uuid,
  p_idempotency_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_reservation public.commerce_quota_reservations%ROWTYPE;
  v_entitlement public.commerce_entitlements%ROWTYPE;
  v_existing_ledger public.commerce_quota_ledger%ROWTYPE;
  v_entitlement_id uuid;
  v_listing_status text;
  v_next_status text;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;
  IF p_idempotency_key IS NULL OR char_length(p_idempotency_key) NOT BETWEEN 16 AND 160 THEN
    RAISE EXCEPTION 'Invalid idempotency key.' USING ERRCODE = '22023';
  END IF;

  SELECT entitlement_id INTO v_entitlement_id
  FROM public.commerce_quota_reservations
  WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quota reservation not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_entitlement
  FROM public.commerce_entitlements
  WHERE id = v_entitlement_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quota entitlement not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_reservation
  FROM public.commerce_quota_reservations
  WHERE id = p_reservation_id
    AND entitlement_id = v_entitlement.id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quota reservation changed concurrently.' USING ERRCODE = '40001';
  END IF;
  IF v_reservation.owner_user_id <> v_actor AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'Not allowed.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_existing_ledger
  FROM public.commerce_quota_ledger
  WHERE entitlement_id = v_entitlement.id
    AND idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing_ledger.operation IN ('release', 'expire')
       AND v_existing_ledger.metadata->>'reservation_id' = v_reservation.id::text
       AND v_reservation.status IN ('released', 'expired') THEN
      RETURN v_reservation.id;
    END IF;
    RAISE EXCEPTION 'Idempotency key was already used for another quota operation.' USING ERRCODE = '22023';
  END IF;

  IF v_reservation.status IN ('released', 'expired') THEN
    RAISE EXCEPTION 'Reservation was released with another idempotency key.' USING ERRCODE = '22023';
  END IF;
  IF v_reservation.status <> 'reserved' THEN
    RAISE EXCEPTION 'Consumed quota cannot be released.' USING ERRCODE = 'P0001';
  END IF;

  SELECT status INTO v_listing_status
  FROM public.user_listings
  WHERE id = v_reservation.user_listing_id
  FOR UPDATE;

  IF v_listing_status = 'approved' THEN
    RAISE EXCEPTION 'Approved listing quota must be consumed, not released.' USING ERRCODE = 'P0001';
  END IF;
  IF COALESCE(v_listing_status, 'deleted') NOT IN ('rejected', 'expired', 'deleted')
     AND v_reservation.expires_at > now() THEN
    RAISE EXCEPTION 'Reservation is not releasable yet.' USING ERRCODE = 'P0001';
  END IF;

  IF v_entitlement.quantity_remaining + v_reservation.quantity > v_entitlement.quantity_total THEN
    RAISE EXCEPTION 'Quota balance would exceed entitlement total.' USING ERRCODE = '23514';
  END IF;

  UPDATE public.commerce_entitlements
  SET quantity_remaining = quantity_remaining + v_reservation.quantity,
      updated_at = now()
  WHERE id = v_entitlement.id
  RETURNING * INTO v_entitlement;

  v_next_status := CASE WHEN v_reservation.expires_at <= now() THEN 'expired' ELSE 'released' END;
  UPDATE public.commerce_quota_reservations
  SET status = v_next_status,
      released_at = CASE WHEN v_next_status = 'released' THEN now() ELSE released_at END,
      updated_at = now()
  WHERE id = v_reservation.id;

  INSERT INTO public.commerce_quota_ledger (
    entitlement_id, owner_user_id, user_listing_id, operation,
    delta, balance_after, idempotency_key,
    metadata
  ) VALUES (
    v_entitlement.id, v_entitlement.owner_user_id, v_reservation.user_listing_id,
    CASE WHEN v_next_status = 'expired' THEN 'expire' ELSE 'release' END,
    v_reservation.quantity, v_entitlement.quantity_remaining, p_idempotency_key,
    jsonb_build_object('reservation_id', v_reservation.id, 'released_by', v_actor, 'reservation_status', v_next_status)
  );

  RETURN v_reservation.id;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_create_order(uuid, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_reserve_listing_quota(uuid, uuid, integer, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_consume_listing_quota(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_release_listing_quota(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.commerce_create_order(uuid, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_reserve_listing_quota(uuid, uuid, integer, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_consume_listing_quota(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_release_listing_quota(uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
