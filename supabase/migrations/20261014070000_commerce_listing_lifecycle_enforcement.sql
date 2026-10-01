-- =============================================================================
-- Commerce listing lifecycle enforcement for enrolled quota owners
-- =============================================================================

ALTER TABLE public.commerce_quota_reservations
  ADD COLUMN IF NOT EXISTS submission_cycle integer;

WITH ranked_cycles AS (
  SELECT
    r.id,
    row_number() OVER (
      PARTITION BY r.user_listing_id
      ORDER BY r.created_at, r.id
    )::integer AS submission_cycle
  FROM public.commerce_quota_reservations r
  WHERE r.user_listing_id IS NOT NULL
    AND r.submission_cycle IS NULL
)
UPDATE public.commerce_quota_reservations r
SET submission_cycle = ranked_cycles.submission_cycle
FROM ranked_cycles
WHERE r.id = ranked_cycles.id;

UPDATE public.commerce_quota_reservations
SET submission_cycle = 1
WHERE submission_cycle IS NULL;

ALTER TABLE public.commerce_quota_reservations
  ALTER COLUMN submission_cycle SET DEFAULT 1,
  ALTER COLUMN submission_cycle SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commerce_quota_reservations'::regclass
      AND conname = 'commerce_quota_reservations_submission_cycle_check'
  ) THEN
    ALTER TABLE public.commerce_quota_reservations
      ADD CONSTRAINT commerce_quota_reservations_submission_cycle_check
      CHECK (submission_cycle > 0);
  END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_quota_listing_cycle
  ON public.commerce_quota_reservations(user_listing_id, submission_cycle)
  WHERE user_listing_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_quota_listing_reserved
  ON public.commerce_quota_reservations(user_listing_id)
  WHERE user_listing_id IS NOT NULL AND status = 'reserved';

CREATE OR REPLACE FUNCTION public.commerce_owner_has_quota_history(p_owner_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.commerce_entitlements e
    WHERE e.owner_user_id = p_owner_user_id
      AND e.benefit_kind = 'listing_quota'
  )
$$;

CREATE OR REPLACE FUNCTION public.commerce_reserve_listing_quota_cycle_internal(
  p_user_listing_id uuid,
  p_owner_user_id uuid,
  p_entitlement_id uuid DEFAULT NULL,
  p_quantity integer DEFAULT 1,
  p_idempotency_key text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing public.user_listings%ROWTYPE;
  v_entitlement public.commerce_entitlements%ROWTYPE;
  v_reservation public.commerce_quota_reservations%ROWTYPE;
  v_submission_cycle integer;
  v_idempotency_key text;
  v_expires_at timestamptz := COALESCE(p_expires_at, clock_timestamp() + interval '24 hours');
  v_actor uuid := auth.uid();
BEGIN
  IF p_user_listing_id IS NULL OR p_owner_user_id IS NULL THEN
    RAISE EXCEPTION 'Listing and owner are required.' USING ERRCODE = '22023';
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 THEN
    RAISE EXCEPTION 'Invalid quantity.' USING ERRCODE = '22023';
  END IF;
  IF p_idempotency_key IS NOT NULL AND char_length(p_idempotency_key) NOT BETWEEN 16 AND 160 THEN
    RAISE EXCEPTION 'Invalid idempotency key.' USING ERRCODE = '22023';
  END IF;
  IF v_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Reservation expiry must be in the future.' USING ERRCODE = '22023';
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

  IF p_entitlement_id IS NOT NULL AND p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_reservation
    FROM public.commerce_quota_reservations r
    WHERE r.entitlement_id = p_entitlement_id
      AND r.idempotency_key = p_idempotency_key
    FOR UPDATE;

    IF FOUND THEN
      IF v_reservation.owner_user_id <> p_owner_user_id
         OR v_reservation.user_listing_id IS DISTINCT FROM p_user_listing_id
         OR v_reservation.quantity <> p_quantity
         OR (p_expires_at IS NOT NULL AND v_reservation.expires_at IS DISTINCT FROM p_expires_at) THEN
        RAISE EXCEPTION 'Idempotency key was already used for another reservation.' USING ERRCODE = '22023';
      END IF;
      RETURN v_reservation.id;
    END IF;
  END IF;

  SELECT * INTO v_reservation
  FROM public.commerce_quota_reservations r
  WHERE r.user_listing_id = p_user_listing_id
    AND r.status = 'reserved'
  ORDER BY r.submission_cycle DESC
  LIMIT 1
  FOR UPDATE;

  IF FOUND THEN
    IF p_entitlement_id IS NULL
       OR (v_reservation.entitlement_id = p_entitlement_id AND v_reservation.quantity = p_quantity) THEN
      RETURN v_reservation.id;
    END IF;
    RAISE EXCEPTION 'Listing already has an active quota reservation.' USING ERRCODE = '23505';
  END IF;

  SELECT COALESCE(max(r.submission_cycle), 0) + 1
  INTO v_submission_cycle
  FROM public.commerce_quota_reservations r
  WHERE r.user_listing_id = p_user_listing_id;

  SELECT * INTO v_entitlement
  FROM public.commerce_entitlements e
  WHERE e.owner_user_id = p_owner_user_id
    AND e.benefit_kind = 'listing_quota'
    AND e.status = 'active'
    AND e.quantity_remaining >= p_quantity
    AND (e.starts_at IS NULL OR e.starts_at <= clock_timestamp())
    AND (e.ends_at IS NULL OR e.ends_at > clock_timestamp())
    AND (p_entitlement_id IS NULL OR e.id = p_entitlement_id)
  ORDER BY e.ends_at ASC NULLS LAST, e.created_at, e.id
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient active listing quota.' USING ERRCODE = 'P0001';
  END IF;

  v_idempotency_key := COALESCE(
    p_idempotency_key,
    'listing-cycle:' || p_user_listing_id::text || ':' || v_submission_cycle::text || ':reserve'
  );

  UPDATE public.commerce_entitlements e
  SET quantity_remaining = e.quantity_remaining - p_quantity,
      updated_at = clock_timestamp()
  WHERE e.id = v_entitlement.id
  RETURNING * INTO v_entitlement;

  INSERT INTO public.commerce_quota_reservations(
    entitlement_id, owner_user_id, user_listing_id, quantity, status,
    idempotency_key, expires_at, submission_cycle
  ) VALUES (
    v_entitlement.id, p_owner_user_id, p_user_listing_id, p_quantity, 'reserved',
    v_idempotency_key, v_expires_at, v_submission_cycle
  ) RETURNING * INTO v_reservation;

  INSERT INTO public.commerce_quota_ledger(
    entitlement_id, owner_user_id, user_listing_id, operation, delta,
    balance_after, idempotency_key, metadata
  ) VALUES (
    v_entitlement.id, p_owner_user_id, p_user_listing_id, 'reserve', -p_quantity,
    v_entitlement.quantity_remaining, v_idempotency_key,
    jsonb_build_object('reservation_id', v_reservation.id, 'submission_cycle', v_submission_cycle)
  );

  UPDATE public.commerce_entitlements e
  SET user_listing_id = p_user_listing_id,
      updated_at = clock_timestamp()
  WHERE e.owner_user_id = p_owner_user_id
    AND e.order_item_id = v_entitlement.order_item_id
    AND e.benefit_kind IN ('listing_duration','sponsored_placement')
    AND e.status = 'awaiting_listing_approval'
    AND e.user_listing_id IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.commerce_entitlements bound
      WHERE bound.owner_user_id = p_owner_user_id
        AND bound.user_listing_id = p_user_listing_id
        AND bound.benefit_kind = e.benefit_kind
        AND bound.status IN ('awaiting_listing_approval','active','suspended')
    );

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    p_owner_user_id, v_actor,
    CASE
      WHEN v_actor = p_owner_user_id THEN 'owner'
      WHEN v_actor IS NULL THEN 'system'
      WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_actor AND p.role = 'staff') THEN 'staff'
      ELSE 'admin'
    END,
    'quota_reservation', v_reservation.id,
    'listing_quota_reserved', v_idempotency_key,
    jsonb_build_object(
      'listing_id', p_user_listing_id,
      'submission_cycle', v_submission_cycle,
      'quantity', p_quantity,
      'balance_after', v_entitlement.quantity_remaining
    )
  );

  RETURN v_reservation.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_reserve_listing_quota_cycle(
  p_user_listing_id uuid,
  p_owner_user_id uuid
)
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.commerce_reserve_listing_quota_cycle_internal(
    p_user_listing_id, p_owner_user_id, NULL, 1, NULL, NULL
  )
$$;

CREATE OR REPLACE FUNCTION public.commerce_consume_listing_quota_cycle(
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
  v_entitlement public.commerce_entitlements%ROWTYPE;
  v_reservation public.commerce_quota_reservations%ROWTYPE;
  v_idempotency_key text;
  v_now timestamptz := clock_timestamp();
  v_actor uuid := auth.uid();
BEGIN
  SELECT * INTO v_listing
  FROM public.user_listings l
  WHERE l.id = p_user_listing_id
    AND l.user_id = p_owner_user_id
    AND l.status = 'approved'
  FOR UPDATE;

  IF NOT FOUND OR v_listing.property_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.properties p
    WHERE p.id = v_listing.property_id AND p.is_active = true
    FOR KEY SHARE
  ) THEN
    RAISE EXCEPTION 'Approved listing with active property not found.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_reservation
  FROM public.commerce_quota_reservations r
  WHERE r.user_listing_id = p_user_listing_id
    AND r.owner_user_id = p_owner_user_id
    AND r.status = 'reserved'
  ORDER BY r.submission_cycle DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approved commerce listing has no reserved quota.' USING ERRCODE = 'P0001';
  END IF;
  IF v_reservation.expires_at <= v_now THEN
    RAISE EXCEPTION 'Listing quota reservation expired before approval.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_entitlement
  FROM public.commerce_entitlements e
  WHERE e.id = v_reservation.entitlement_id
    AND e.owner_user_id = p_owner_user_id
    AND e.benefit_kind = 'listing_quota'
  FOR UPDATE;

  IF NOT FOUND OR v_entitlement.status <> 'active' THEN
    RAISE EXCEPTION 'Active quota entitlement not found.' USING ERRCODE = 'P0001';
  END IF;

  v_idempotency_key := 'listing-cycle:' || p_user_listing_id::text || ':'
    || v_reservation.submission_cycle::text || ':consume';

  UPDATE public.commerce_quota_reservations r
  SET status = 'consumed', consumed_at = v_now, updated_at = v_now
  WHERE r.id = v_reservation.id;

  INSERT INTO public.commerce_quota_ledger(
    entitlement_id, owner_user_id, user_listing_id, operation, delta,
    balance_after, idempotency_key, metadata
  ) VALUES (
    v_entitlement.id, p_owner_user_id, p_user_listing_id, 'consume', 0,
    v_entitlement.quantity_remaining, v_idempotency_key,
    jsonb_build_object('reservation_id', v_reservation.id, 'submission_cycle', v_reservation.submission_cycle)
  ) ON CONFLICT (entitlement_id, idempotency_key) DO NOTHING;

  UPDATE public.commerce_entitlements e
  SET status = 'expired',
      property_id = v_listing.property_id,
      expired_at = COALESCE(e.expired_at, v_now),
      updated_at = v_now
  WHERE e.owner_user_id = p_owner_user_id
    AND e.user_listing_id = p_user_listing_id
    AND e.benefit_kind IN ('listing_duration','sponsored_placement')
    AND e.status IN ('awaiting_listing_approval','suspended')
    AND e.ends_at IS NOT NULL
    AND e.ends_at <= v_now;

  UPDATE public.commerce_entitlements e
  SET status = 'active',
      property_id = v_listing.property_id,
      starts_at = COALESCE(e.starts_at, v_now),
      ends_at = CASE
        WHEN e.ends_at IS NOT NULL THEN e.ends_at
        WHEN e.duration_days IS NOT NULL THEN v_now + make_interval(days => e.duration_days)
        ELSE NULL
      END,
      activated_at = COALESCE(e.activated_at, v_now),
      suspended_at = NULL,
      updated_at = v_now
  WHERE e.owner_user_id = p_owner_user_id
    AND e.user_listing_id = p_user_listing_id
    AND e.benefit_kind IN ('listing_duration','sponsored_placement')
    AND e.status IN ('awaiting_listing_approval','suspended')
    AND (e.ends_at IS NULL OR e.ends_at > v_now);

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    p_owner_user_id, v_actor,
    CASE
      WHEN v_actor IS NULL THEN 'system'
      WHEN v_actor = p_owner_user_id THEN 'owner'
      WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_actor AND p.role = 'staff') THEN 'staff'
      ELSE 'admin'
    END,
    'quota_reservation', v_reservation.id,
    'listing_quota_consumed', v_idempotency_key,
    jsonb_build_object(
      'listing_id', p_user_listing_id,
      'property_id', v_listing.property_id,
      'submission_cycle', v_reservation.submission_cycle,
      'balance_after', v_entitlement.quantity_remaining
    )
  );

  RETURN v_reservation.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_close_listing_quota_cycle(
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
  v_entitlement public.commerce_entitlements%ROWTYPE;
  v_reservation public.commerce_quota_reservations%ROWTYPE;
  v_next_status text;
  v_operation text;
  v_idempotency_key text;
  v_now timestamptz := clock_timestamp();
  v_actor uuid := auth.uid();
BEGIN
  IF p_reason NOT IN ('rejected','expired','deleted','resubmitted') THEN
    RAISE EXCEPTION 'Invalid listing quota close reason.' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_reservation
  FROM public.commerce_quota_reservations r
  WHERE r.user_listing_id = p_user_listing_id
    AND r.owner_user_id = p_owner_user_id
    AND r.status IN ('reserved','consumed')
  ORDER BY r.submission_cycle DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_entitlement
  FROM public.commerce_entitlements e
  WHERE e.id = v_reservation.entitlement_id
    AND e.owner_user_id = p_owner_user_id
    AND e.benefit_kind = 'listing_quota'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quota entitlement not found while closing listing cycle.' USING ERRCODE = '23503';
  END IF;
  IF v_entitlement.quantity_remaining + v_reservation.quantity > v_entitlement.quantity_total THEN
    RAISE EXCEPTION 'Quota balance would exceed entitlement total.' USING ERRCODE = '23514';
  END IF;

  v_next_status := CASE WHEN p_reason = 'expired' THEN 'expired' ELSE 'released' END;
  v_operation := CASE WHEN p_reason = 'expired' THEN 'expire' ELSE 'release' END;
  v_idempotency_key := 'listing-cycle:' || p_user_listing_id::text || ':'
    || v_reservation.submission_cycle::text || ':' || v_operation || ':' || p_reason;

  UPDATE public.commerce_entitlements e
  SET quantity_remaining = e.quantity_remaining + v_reservation.quantity,
      updated_at = v_now
  WHERE e.id = v_entitlement.id
  RETURNING * INTO v_entitlement;

  UPDATE public.commerce_quota_reservations r
  SET status = v_next_status,
      released_at = CASE WHEN v_next_status = 'released' THEN v_now ELSE r.released_at END,
      updated_at = v_now
  WHERE r.id = v_reservation.id;

  INSERT INTO public.commerce_quota_ledger(
    entitlement_id, owner_user_id, user_listing_id, operation, delta,
    balance_after, idempotency_key, metadata
  ) VALUES (
    v_entitlement.id, p_owner_user_id, p_user_listing_id, v_operation,
    v_reservation.quantity, v_entitlement.quantity_remaining, v_idempotency_key,
    jsonb_build_object(
      'reservation_id', v_reservation.id,
      'submission_cycle', v_reservation.submission_cycle,
      'reason', p_reason
    )
  ) ON CONFLICT (entitlement_id, idempotency_key) DO NOTHING;

  INSERT INTO public.commerce_audit_events(
    owner_user_id, actor_id, actor_role, entity_type, entity_id,
    event_type, correlation_id, after_state
  ) VALUES (
    p_owner_user_id, v_actor,
    CASE
      WHEN v_actor = p_owner_user_id THEN 'owner'
      WHEN v_actor IS NULL THEN 'system'
      WHEN EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_actor AND p.role = 'staff') THEN 'staff'
      ELSE 'admin'
    END,
    'quota_reservation', v_reservation.id,
    'listing_quota_' || v_operation, v_idempotency_key,
    jsonb_build_object(
      'listing_id', p_user_listing_id,
      'submission_cycle', v_reservation.submission_cycle,
      'reason', p_reason,
      'balance_after', v_entitlement.quantity_remaining
    )
  );

  RETURN v_reservation.id;
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
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required.' USING ERRCODE = '42501';
  END IF;

  RETURN public.commerce_reserve_listing_quota_cycle_internal(
    p_user_listing_id,
    v_actor,
    p_entitlement_id,
    p_quantity,
    p_idempotency_key,
    p_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_commerce_listing_entitlement_lifecycle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END;
  v_owner_user_id uuid := CASE WHEN TG_OP = 'DELETE' THEN OLD.user_id ELSE NEW.user_id END;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF NOT public.commerce_owner_has_quota_history(v_owner_user_id) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    PERFORM public.commerce_close_listing_quota_cycle(v_listing_id, v_owner_user_id, 'deleted');

    UPDATE public.commerce_entitlements e
    SET user_listing_id = NULL,
        property_id = NULL,
        updated_at = v_now
    WHERE e.owner_user_id = v_owner_user_id
      AND e.user_listing_id = v_listing_id
      AND e.benefit_kind IN ('listing_duration','sponsored_placement')
      AND e.status = 'awaiting_listing_approval'
      AND e.activated_at IS NULL;

    UPDATE public.commerce_entitlements e
    SET status = 'revoked',
        revoked_at = COALESCE(e.revoked_at, v_now),
        updated_at = v_now
    WHERE e.owner_user_id = v_owner_user_id
      AND e.user_listing_id = v_listing_id
      AND e.benefit_kind IN ('listing_duration','sponsored_placement')
      AND e.status IN ('active','suspended')
      AND e.activated_at IS NOT NULL;

    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' AND NEW.status <> 'pending' THEN
    RAISE EXCEPTION 'Commerce-enrolled listings must be submitted as pending.' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.status = 'pending' THEN
    IF TG_OP = 'UPDATE' AND OLD.status = 'approved' THEN
      PERFORM public.commerce_close_listing_quota_cycle(v_listing_id, v_owner_user_id, 'resubmitted');
      UPDATE public.commerce_entitlements e
      SET status = 'suspended',
          suspended_at = COALESCE(e.suspended_at, v_now),
          updated_at = v_now
      WHERE e.owner_user_id = v_owner_user_id
        AND e.user_listing_id = v_listing_id
        AND e.benefit_kind IN ('listing_duration','sponsored_placement')
        AND e.status = 'active';
    END IF;

    PERFORM public.commerce_reserve_listing_quota_cycle(v_listing_id, v_owner_user_id);
    RETURN NEW;
  END IF;

  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status) THEN
    PERFORM public.commerce_consume_listing_quota_cycle(v_listing_id, v_owner_user_id);
    RETURN NEW;
  END IF;

  IF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.commerce_close_listing_quota_cycle(v_listing_id, v_owner_user_id, 'rejected');

    UPDATE public.commerce_entitlements e
    SET user_listing_id = NULL,
        property_id = NULL,
        updated_at = v_now
    WHERE e.owner_user_id = v_owner_user_id
      AND e.user_listing_id = v_listing_id
      AND e.benefit_kind IN ('listing_duration','sponsored_placement')
      AND e.status = 'awaiting_listing_approval'
      AND e.activated_at IS NULL;

    UPDATE public.commerce_entitlements e
    SET status = 'revoked',
        revoked_at = COALESCE(e.revoked_at, v_now),
        updated_at = v_now
    WHERE e.owner_user_id = v_owner_user_id
      AND e.user_listing_id = v_listing_id
      AND e.benefit_kind IN ('listing_duration','sponsored_placement')
      AND e.status IN ('active','suspended')
      AND e.activated_at IS NOT NULL;

    RETURN NEW;
  END IF;

  IF NEW.status = 'expired' AND OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.commerce_close_listing_quota_cycle(v_listing_id, v_owner_user_id, 'expired');

    UPDATE public.commerce_entitlements e
    SET user_listing_id = NULL,
        property_id = NULL,
        updated_at = v_now
    WHERE e.owner_user_id = v_owner_user_id
      AND e.user_listing_id = v_listing_id
      AND e.benefit_kind IN ('listing_duration','sponsored_placement')
      AND e.status = 'awaiting_listing_approval'
      AND e.activated_at IS NULL;

    UPDATE public.commerce_entitlements e
    SET status = 'expired',
        expired_at = COALESCE(e.expired_at, v_now),
        updated_at = v_now
    WHERE e.owner_user_id = v_owner_user_id
      AND e.user_listing_id = v_listing_id
      AND e.benefit_kind IN ('listing_duration','sponsored_placement')
      AND e.status IN ('active','suspended')
      AND e.activated_at IS NOT NULL;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_commerce_listing_entitlement_lifecycle ON public.user_listings;
CREATE TRIGGER trg_commerce_listing_entitlement_lifecycle
  AFTER INSERT OR UPDATE ON public.user_listings
  FOR EACH ROW EXECUTE FUNCTION public.sync_commerce_listing_entitlement_lifecycle();

DROP TRIGGER IF EXISTS trg_commerce_listing_entitlement_delete ON public.user_listings;
CREATE TRIGGER trg_commerce_listing_entitlement_delete
  BEFORE DELETE ON public.user_listings
  FOR EACH ROW EXECUTE FUNCTION public.sync_commerce_listing_entitlement_lifecycle();

CREATE OR REPLACE VIEW public.commerce_effective_entitlements
WITH (security_invoker = true)
AS
SELECT e.*
FROM public.commerce_entitlements e
WHERE e.status = 'active'
  AND (e.starts_at IS NULL OR e.starts_at <= clock_timestamp())
  AND (e.ends_at IS NULL OR e.ends_at > clock_timestamp());

REVOKE ALL ON FUNCTION public.commerce_owner_has_quota_history(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_reserve_listing_quota_cycle_internal(uuid, uuid, uuid, integer, text, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_reserve_listing_quota_cycle(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_consume_listing_quota_cycle(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commerce_close_listing_quota_cycle(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sync_commerce_listing_entitlement_lifecycle() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.commerce_reserve_listing_quota(uuid, uuid, integer, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commerce_reserve_listing_quota(uuid, uuid, integer, text, timestamptz) TO authenticated;

REVOKE ALL ON public.commerce_effective_entitlements FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.commerce_effective_entitlements TO authenticated;

NOTIFY pgrst, 'reload schema';
