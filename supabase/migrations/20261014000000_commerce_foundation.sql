-- =============================================================================
-- Commerce foundation: versioned packages, orders, payments and entitlements
-- Additive only. No package/pricing seed. Production execution is user-run.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.commerce_package_benefits_valid(p_benefits jsonb)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog, pg_temp
AS $$
DECLARE
  v_benefit jsonb;
  v_kind text;
  v_seen_kinds text[] := ARRAY[]::text[];
BEGIN
  IF jsonb_typeof(p_benefits) <> 'array' OR jsonb_array_length(p_benefits) = 0 THEN
    RETURN false;
  END IF;

  FOR v_benefit IN SELECT value FROM jsonb_array_elements(p_benefits)
  LOOP
    IF jsonb_typeof(v_benefit) <> 'object' THEN
      RETURN false;
    END IF;

    v_kind := v_benefit->>'kind';
    IF v_kind IS NULL
       OR v_kind NOT IN ('listing_quota', 'listing_duration', 'sponsored_placement', 'seller_analytics')
       OR v_kind = ANY(v_seen_kinds) THEN
      RETURN false;
    END IF;
    v_seen_kinds := array_append(v_seen_kinds, v_kind);

    IF jsonb_typeof(v_benefit->'quantity') <> 'number'
       OR (v_benefit->>'quantity') !~ '^[1-9][0-9]*$'
       OR (v_benefit->>'quantity')::bigint > 2147483647 THEN
      RETURN false;
    END IF;

    IF v_kind IN ('listing_duration', 'sponsored_placement')
       AND (v_benefit->>'quantity')::bigint <> 1 THEN
      RETURN false;
    END IF;

    IF v_benefit ? 'durationDays' AND (
      jsonb_typeof(v_benefit->'durationDays') <> 'number'
      OR (v_benefit->>'durationDays') !~ '^[1-9][0-9]*$'
      OR (v_benefit->>'durationDays')::bigint > 2147483647
    ) THEN
      RETURN false;
    END IF;

    IF v_kind = 'listing_duration' AND NOT (v_benefit ? 'durationDays') THEN
      RETURN false;
    END IF;

    IF v_kind = 'sponsored_placement' AND (
      NOT (v_benefit ? 'durationDays')
      OR jsonb_typeof(v_benefit->'placementCode') <> 'string'
      OR NULLIF(btrim(v_benefit->>'placementCode'), '') IS NULL
      OR jsonb_typeof(v_benefit->'sponsoredLabel') <> 'string'
      OR NULLIF(btrim(v_benefit->>'sponsoredLabel'), '') IS NULL
    ) THEN
      RETURN false;
    END IF;
  END LOOP;

  RETURN true;
EXCEPTION
  WHEN invalid_text_representation OR numeric_value_out_of_range THEN
    RETURN false;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_package_benefits_valid(jsonb) FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS public.commerce_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  description text,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commerce_package_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.commerce_packages(id) ON DELETE RESTRICT,
  version integer NOT NULL CHECK (version > 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','active','retired')),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  billing_mode text NOT NULL DEFAULT 'one_time' CHECK (billing_mode IN ('one_time','subscription')),
  billing_period_days integer CHECK (billing_period_days IS NULL OR billing_period_days > 0),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor >= 0),
  tax_rate_basis_points integer NOT NULL DEFAULT 0 CHECK (tax_rate_basis_points BETWEEN 0 AND 10000),
  terms_version text NOT NULL CHECK (char_length(btrim(terms_version)) BETWEEN 1 AND 80),
  benefits jsonb NOT NULL CHECK (public.commerce_package_benefits_valid(benefits)),
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (package_id, version),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
  CHECK ((billing_mode = 'subscription') = (billing_period_days IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.commerce_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','awaiting_payment','paid','payment_failed','cancelled',
    'partially_refunded','refunded','chargeback'
  )),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  subtotal_minor bigint NOT NULL CHECK (subtotal_minor >= 0),
  tax_minor bigint NOT NULL DEFAULT 0 CHECK (tax_minor >= 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0 AND total_minor = subtotal_minor + tax_minor),
  terms_version text NOT NULL CHECK (char_length(btrim(terms_version)) BETWEEN 1 AND 80),
  package_snapshot jsonb NOT NULL CHECK (jsonb_typeof(package_snapshot) = 'object'),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  paid_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, idempotency_key),
  CHECK ((status IN ('paid','partially_refunded','refunded','chargeback')) = (paid_at IS NOT NULL) OR status = 'chargeback')
);

CREATE INDEX IF NOT EXISTS idx_commerce_orders_owner_created ON public.commerce_orders(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_orders_status_created ON public.commerce_orders(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.commerce_orders(id) ON DELETE RESTRICT,
  package_version_id uuid NOT NULL REFERENCES public.commerce_package_versions(id) ON DELETE RESTRICT,
  user_listing_id uuid REFERENCES public.user_listings(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_amount_minor bigint NOT NULL CHECK (unit_amount_minor >= 0),
  total_amount_minor bigint NOT NULL CHECK (total_amount_minor >= 0 AND total_amount_minor = unit_amount_minor * quantity),
  benefit_snapshot jsonb NOT NULL CHECK (jsonb_typeof(benefit_snapshot) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commerce_order_items_order ON public.commerce_order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_commerce_order_items_listing ON public.commerce_order_items(user_listing_id) WHERE user_listing_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.commerce_payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.commerce_orders(id) ON DELETE RESTRICT,
  provider_order_code bigint GENERATED ALWAYS AS IDENTITY UNIQUE
    CHECK (provider_order_code BETWEEN 1 AND 9007199254740991),
  provider text NOT NULL CHECK (provider ~ '^[a-z0-9_-]{2,40}$'),
  provider_payment_id text,
  status text NOT NULL DEFAULT 'created' CHECK (status IN (
    'created','pending','succeeded','failed','cancelled',
    'partially_refunded','refunded','chargeback'
  )),
  amount_minor bigint NOT NULL CHECK (amount_minor >= 0),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  checkout_url text,
  expires_at timestamptz,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(provider_metadata) = 'object'),
  succeeded_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_payment_provider_id
  ON public.commerce_payment_attempts(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_payment_order ON public.commerce_payment_attempts(order_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_payment_status ON public.commerce_payment_attempts(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  provider_payment_id text NOT NULL CHECK (char_length(btrim(provider_payment_id)) BETWEEN 1 AND 160),
  payment_attempt_id uuid REFERENCES public.commerce_payment_attempts(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.commerce_orders(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  signature_valid boolean NOT NULL,
  verification_method text NOT NULL DEFAULT 'webhook_signature'
    CHECK (verification_method IN ('webhook_signature','provider_api_lookup')),
  amount_minor bigint CHECK (amount_minor IS NULL OR amount_minor >= 0),
  currency text CHECK (currency IS NULL OR currency = 'VND'),
  payload_hash text NOT NULL CHECK (char_length(payload_hash) BETWEEN 32 AND 128),
  signed_data_hash text CHECK (signed_data_hash IS NULL OR char_length(signed_data_hash) = 64),
  provider_lookup_hash text CHECK (provider_lookup_hash IS NULL OR char_length(provider_lookup_hash) = 64),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id),
  CONSTRAINT commerce_payment_events_verification_source CHECK (
    (verification_method = 'webhook_signature' AND signature_valid AND signed_data_hash IS NOT NULL AND provider_lookup_hash IS NULL)
    OR (verification_method = 'provider_api_lookup' AND NOT signature_valid AND signed_data_hash IS NULL AND provider_lookup_hash IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_commerce_payment_events_order ON public.commerce_payment_events(order_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_webhook_inbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','processed','retry','dead_letter')),
  headers jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(headers) = 'object'),
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  payload_hash text NOT NULL CHECK (char_length(payload_hash) BETWEEN 32 AND 128),
  verification_method text NOT NULL DEFAULT 'webhook_signature'
    CHECK (verification_method IN ('webhook_signature','provider_api_lookup')),
  signed_data_hash text CHECK (signed_data_hash IS NULL OR char_length(signed_data_hash) = 64),
  provider_lookup_hash text CHECK (provider_lookup_hash IS NULL OR char_length(provider_lookup_hash) = 64),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  last_error_code text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, provider_event_id),
  CONSTRAINT commerce_webhook_inbox_verification_source CHECK (
    (verification_method = 'webhook_signature' AND signed_data_hash IS NOT NULL AND provider_lookup_hash IS NULL)
    OR (verification_method = 'provider_api_lookup' AND signed_data_hash IS NULL AND provider_lookup_hash IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_commerce_webhook_work ON public.commerce_webhook_inbox(status, next_attempt_at, received_at);

CREATE TABLE IF NOT EXISTS public.commerce_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.commerce_orders(id) ON DELETE RESTRICT,
  payment_attempt_id uuid NOT NULL REFERENCES public.commerce_payment_attempts(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','processing','succeeded','failed','cancelled')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  reason_code text NOT NULL,
  reason_note text,
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  provider_refund_id text,
  requested_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_refund_provider_id
  ON public.commerce_refunds(provider_refund_id)
  WHERE provider_refund_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_refunds_order ON public.commerce_refunds(order_id, requested_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.commerce_orders(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  document_type text NOT NULL CHECK (document_type IN ('receipt','tax_invoice')),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','void','failed')),
  invoice_number text,
  provider_document_id text,
  document_url text,
  issued_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_invoice_number ON public.commerce_invoices(invoice_number) WHERE invoice_number IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_invoices_owner ON public.commerce_invoices(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  package_version_id uuid NOT NULL REFERENCES public.commerce_package_versions(id) ON DELETE RESTRICT,
  provider text NOT NULL,
  provider_subscription_id text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','past_due','paused','cancelled','expired')),
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (current_period_end IS NULL OR current_period_start IS NULL OR current_period_end > current_period_start)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_subscription_provider_id
  ON public.commerce_subscriptions(provider, provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_subscriptions_owner ON public.commerce_subscriptions(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_subscription_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.commerce_subscriptions(id) ON DELETE RESTRICT,
  cycle_number integer NOT NULL CHECK (cycle_number > 0),
  order_id uuid NOT NULL REFERENCES public.commerce_orders(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','active','grace','failed','expired','cancelled')),
  period_start timestamptz,
  period_end timestamptz,
  grace_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, cycle_number),
  UNIQUE (order_id),
  CHECK (period_start IS NULL OR isfinite(period_start)),
  CHECK (period_end IS NULL OR isfinite(period_end)),
  CHECK (grace_until IS NULL OR isfinite(grace_until)),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end > period_start),
  CONSTRAINT commerce_subscription_periods_grace_exact CHECK (
    grace_until IS NULL OR (period_end IS NOT NULL AND grace_until = period_end + interval '3 days')
  ),
  CHECK (status <> 'grace' OR (period_end IS NOT NULL AND grace_until IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_commerce_subscription_period_work
  ON public.commerce_subscription_periods(status, grace_until, period_end);

CREATE TABLE IF NOT EXISTS public.commerce_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES public.commerce_order_items(id) ON DELETE RESTRICT,
  package_version_id uuid NOT NULL REFERENCES public.commerce_package_versions(id) ON DELETE RESTRICT,
  subscription_period_id uuid REFERENCES public.commerce_subscription_periods(id) ON DELETE RESTRICT,
  user_listing_id uuid REFERENCES public.user_listings(id) ON DELETE SET NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  benefit_kind text NOT NULL CHECK (benefit_kind IN ('listing_quota','listing_duration','sponsored_placement','seller_analytics')),
  status text NOT NULL DEFAULT 'awaiting_listing_approval' CHECK (status IN ('awaiting_listing_approval','active','suspended','expired','revoked','refunded')),
  quantity_total integer NOT NULL CHECK (quantity_total > 0),
  quantity_remaining integer NOT NULL CHECK (quantity_remaining BETWEEN 0 AND quantity_total),
  duration_days integer CHECK (duration_days IS NULL OR duration_days > 0),
  placement_code text,
  sponsored_label text,
  starts_at timestamptz,
  ends_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  expired_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (order_item_id, benefit_kind),
  CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at),
  CONSTRAINT commerce_entitlements_sponsored_metadata CHECK (
    benefit_kind <> 'sponsored_placement' OR (
      NULLIF(btrim(placement_code), '') IS NOT NULL
      AND NULLIF(btrim(sponsored_label), '') IS NOT NULL
    )
  ),
  CONSTRAINT commerce_entitlements_active_sponsored_window CHECK (
    status <> 'active' OR benefit_kind <> 'sponsored_placement' OR ends_at IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS idx_commerce_entitlement_owner ON public.commerce_entitlements(owner_user_id, status, ends_at);
CREATE INDEX IF NOT EXISTS idx_commerce_entitlement_listing ON public.commerce_entitlements(user_listing_id, status) WHERE user_listing_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_commerce_entitlement_property ON public.commerce_entitlements(property_id, status) WHERE property_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_commerce_subscription_period_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND (
    OLD.subscription_id IS DISTINCT FROM NEW.subscription_id
    OR OLD.cycle_number IS DISTINCT FROM NEW.cycle_number
    OR OLD.order_id IS DISTINCT FROM NEW.order_id
  ) THEN
    RAISE EXCEPTION 'Commerce subscription period identity is immutable.' USING ERRCODE = '23514';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.commerce_subscriptions s
    JOIN public.commerce_orders o ON o.id = NEW.order_id
    WHERE s.id = NEW.subscription_id
      AND s.owner_user_id = o.owner_user_id
      AND EXISTS (
        SELECT 1
        FROM public.commerce_order_items oi
        WHERE oi.order_id = o.id
          AND oi.package_version_id = s.package_version_id
      )
    FOR KEY SHARE OF s, o
  ) THEN
    RAISE EXCEPTION 'Subscription period order does not match subscription owner and package.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_commerce_entitlement_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_billing_mode text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.commerce_order_items oi
    JOIN public.commerce_orders o ON o.id = oi.order_id
    WHERE oi.id = NEW.order_item_id
      AND oi.package_version_id = NEW.package_version_id
      AND o.owner_user_id = NEW.owner_user_id
    FOR KEY SHARE OF oi, o
  ) THEN
    RAISE EXCEPTION 'Entitlement does not match order item, owner and package.' USING ERRCODE = '23514';
  END IF;

  SELECT billing_mode INTO v_billing_mode
  FROM public.commerce_package_versions
  WHERE id = NEW.package_version_id;

  IF v_billing_mode = 'subscription' THEN
    IF NEW.subscription_period_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.commerce_subscription_periods sp
      JOIN public.commerce_subscriptions s ON s.id = sp.subscription_id
      JOIN public.commerce_order_items oi ON oi.id = NEW.order_item_id
      WHERE sp.id = NEW.subscription_period_id
        AND sp.order_id = oi.order_id
        AND s.owner_user_id = NEW.owner_user_id
        AND s.package_version_id = NEW.package_version_id
        AND oi.package_version_id = NEW.package_version_id
      FOR KEY SHARE OF sp, s, oi
    ) THEN
      RAISE EXCEPTION 'Subscription entitlement does not match period, order, owner and package.' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.subscription_period_id IS NOT NULL THEN
    RAISE EXCEPTION 'One-time entitlement cannot reference a subscription period.' USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_commerce_order_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
     OR OLD.currency IS DISTINCT FROM NEW.currency
     OR OLD.subtotal_minor IS DISTINCT FROM NEW.subtotal_minor
     OR OLD.tax_minor IS DISTINCT FROM NEW.tax_minor
     OR OLD.total_minor IS DISTINCT FROM NEW.total_minor
     OR OLD.terms_version IS DISTINCT FROM NEW.terms_version
     OR OLD.package_snapshot IS DISTINCT FROM NEW.package_snapshot
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key THEN
    RAISE EXCEPTION 'Commerce order identity and monetary snapshot are immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_commerce_order_item_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.order_id IS DISTINCT FROM NEW.order_id
     OR OLD.package_version_id IS DISTINCT FROM NEW.package_version_id
     OR OLD.quantity IS DISTINCT FROM NEW.quantity
     OR OLD.unit_amount_minor IS DISTINCT FROM NEW.unit_amount_minor
     OR OLD.total_amount_minor IS DISTINCT FROM NEW.total_amount_minor
     OR OLD.benefit_snapshot IS DISTINCT FROM NEW.benefit_snapshot THEN
    RAISE EXCEPTION 'Commerce order item identity and benefit snapshot are immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_commerce_subscription_identity_immutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
     OR OLD.package_version_id IS DISTINCT FROM NEW.package_version_id THEN
    RAISE EXCEPTION 'Commerce subscription owner and package are immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_commerce_order_identity_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_commerce_order_item_identity_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_commerce_subscription_identity_immutable() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_commerce_subscription_period_consistency() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_commerce_entitlement_consistency() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_commerce_order_identity_immutable
BEFORE UPDATE ON public.commerce_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_order_identity_immutable();

CREATE TRIGGER trg_commerce_order_item_identity_immutable
BEFORE UPDATE ON public.commerce_order_items
FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_order_item_identity_immutable();

CREATE TRIGGER trg_commerce_subscription_identity_immutable
BEFORE UPDATE ON public.commerce_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_subscription_identity_immutable();

CREATE TRIGGER trg_commerce_subscription_period_consistency
BEFORE INSERT OR UPDATE ON public.commerce_subscription_periods
FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_subscription_period_consistency();

CREATE TRIGGER trg_commerce_entitlement_consistency
BEFORE INSERT OR UPDATE ON public.commerce_entitlements
FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_entitlement_consistency();

CREATE TABLE IF NOT EXISTS public.commerce_quota_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.commerce_entitlements(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  user_listing_id uuid REFERENCES public.user_listings(id) ON DELETE SET NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','consumed','released','expired')),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entitlement_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_commerce_quota_reservation_work
  ON public.commerce_quota_reservations(status, expires_at);
CREATE INDEX IF NOT EXISTS idx_commerce_quota_reservation_owner
  ON public.commerce_quota_reservations(owner_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_quota_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.commerce_entitlements(id) ON DELETE RESTRICT,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  user_listing_id uuid REFERENCES public.user_listings(id) ON DELETE SET NULL,
  order_id uuid REFERENCES public.commerce_orders(id) ON DELETE SET NULL,
  operation text NOT NULL CHECK (operation IN ('grant','reserve','consume','release','adjust','refund','revoke','expire')),
  delta integer NOT NULL CHECK (delta <> 0),
  balance_after integer NOT NULL CHECK (balance_after >= 0),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entitlement_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_commerce_quota_owner_time ON public.commerce_quota_ledger(owner_user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role text NOT NULL CHECK (actor_role IN ('owner','staff','support','finance','admin','system','provider')),
  entity_type text NOT NULL,
  entity_id uuid,
  event_type text NOT NULL,
  correlation_id text,
  before_state jsonb,
  after_state jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CHECK (before_state IS NULL OR jsonb_typeof(before_state) = 'object'),
  CHECK (after_state IS NULL OR jsonb_typeof(after_state) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_commerce_audit_entity ON public.commerce_audit_events(entity_type, entity_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_audit_correlation ON public.commerce_audit_events(correlation_id) WHERE correlation_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.commerce_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic text NOT NULL,
  aggregate_type text NOT NULL,
  aggregate_id uuid NOT NULL,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','retry','dead_letter')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_commerce_outbox_work ON public.commerce_outbox(status, next_attempt_at, created_at);

-- RLS: owner read-only access where appropriate; all writes remain server/RPC only.
ALTER TABLE public.commerce_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_package_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_webhook_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_subscription_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_entitlements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_quota_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_quota_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_outbox ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.commerce_packages, public.commerce_package_versions, public.commerce_orders,
  public.commerce_order_items, public.commerce_payment_attempts, public.commerce_payment_events,
  public.commerce_webhook_inbox, public.commerce_refunds, public.commerce_invoices,
  public.commerce_subscriptions, public.commerce_subscription_periods,
  public.commerce_entitlements, public.commerce_quota_reservations,
  public.commerce_quota_ledger, public.commerce_audit_events, public.commerce_outbox
FROM PUBLIC, anon, authenticated;

CREATE POLICY commerce_packages_public_read ON public.commerce_packages
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY commerce_package_versions_public_read ON public.commerce_package_versions
  FOR SELECT TO anon, authenticated USING (
    status = 'active'
    AND (valid_from IS NULL OR valid_from <= now())
    AND (valid_until IS NULL OR valid_until > now())
  );

CREATE POLICY commerce_orders_owner_read ON public.commerce_orders
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY commerce_order_items_owner_read ON public.commerce_order_items
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.commerce_orders o WHERE o.id = order_id AND o.owner_user_id = auth.uid())
  );
CREATE POLICY commerce_payment_attempts_owner_read ON public.commerce_payment_attempts
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.commerce_orders o WHERE o.id = order_id AND o.owner_user_id = auth.uid())
  );
CREATE POLICY commerce_refunds_owner_read ON public.commerce_refunds
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.commerce_orders o WHERE o.id = order_id AND o.owner_user_id = auth.uid())
  );
CREATE POLICY commerce_invoices_owner_read ON public.commerce_invoices
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY commerce_subscriptions_owner_read ON public.commerce_subscriptions
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY commerce_subscription_periods_owner_read ON public.commerce_subscription_periods
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.commerce_subscriptions s
      WHERE s.id = commerce_subscription_periods.subscription_id AND s.owner_user_id = auth.uid()
    )
  );
CREATE POLICY commerce_entitlements_owner_read ON public.commerce_entitlements
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY commerce_quota_reservation_owner_read ON public.commerce_quota_reservations
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY commerce_quota_owner_read ON public.commerce_quota_ledger
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());

GRANT SELECT ON public.commerce_packages, public.commerce_package_versions TO anon, authenticated;
GRANT SELECT ON public.commerce_orders, public.commerce_order_items, public.commerce_refunds,
  public.commerce_invoices, public.commerce_subscriptions,
  public.commerce_subscription_periods, public.commerce_entitlements,
  public.commerce_quota_reservations, public.commerce_quota_ledger TO authenticated;
GRANT SELECT (id, order_id, provider, provider_payment_id, status, amount_minor, currency,
  checkout_url, expires_at, succeeded_at, failed_at, created_at, updated_at)
  ON public.commerce_payment_attempts TO authenticated;

COMMENT ON TABLE public.commerce_orders IS 'Immutable commercial order header; package and terms are snapshotted per order.';
COMMENT ON TABLE public.commerce_entitlements IS 'Paid rights are separate from editorial promotion flags.';
COMMENT ON TABLE public.commerce_quota_ledger IS 'Append-only quota movements; balance changes must be performed by privileged RPCs.';
