-- =============================================================================
-- Commerce prepaid wallet foundation
-- Additive only. No wallet balance, top-up option, fee product or pricing seed.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.commerce_wallet_accounts (
  owner_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT,
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  available_minor bigint NOT NULL DEFAULT 0 CHECK (available_minor >= 0),
  reserved_minor bigint NOT NULL DEFAULT 0 CHECK (reserved_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commerce_wallet_topup_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  is_active boolean NOT NULL DEFAULT false,
  custom_amount_enabled boolean NOT NULL DEFAULT false,
  custom_min_minor bigint,
  custom_max_minor bigint,
  custom_step_minor bigint,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (NOT custom_amount_enabled AND custom_min_minor IS NULL AND custom_max_minor IS NULL AND custom_step_minor IS NULL)
    OR (
      custom_amount_enabled
      AND custom_min_minor > 0
      AND custom_max_minor >= custom_min_minor
      AND custom_step_minor > 0
      AND custom_step_minor <= custom_max_minor
    )
  )
);

CREATE TABLE IF NOT EXISTS public.commerce_wallet_topup_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 2 AND 120),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  is_active boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.commerce_fee_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL CHECK (code ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  version integer NOT NULL CHECK (version > 0),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  description text,
  product_kind text NOT NULL CHECK (product_kind IN ('listing_basic','sponsored_addon')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  duration_days integer CHECK (duration_days IS NULL OR duration_days > 0),
  placement_code text,
  sponsored_label text,
  terms_version text NOT NULL CHECK (char_length(btrim(terms_version)) BETWEEN 1 AND 80),
  is_active boolean NOT NULL DEFAULT false,
  is_default boolean NOT NULL DEFAULT false,
  valid_from timestamptz,
  valid_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (code, version),
  CHECK (valid_until IS NULL OR valid_from IS NULL OR valid_until > valid_from),
  CHECK (
    (product_kind = 'listing_basic' AND duration_days IS NOT NULL AND placement_code IS NULL AND sponsored_label IS NULL)
    OR (
      product_kind = 'sponsored_addon'
      AND duration_days IS NOT NULL
      AND NULLIF(btrim(placement_code), '') IS NOT NULL
      AND NULLIF(btrim(sponsored_label), '') IS NOT NULL
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_fee_default_basic
  ON public.commerce_fee_products(product_kind)
  WHERE product_kind = 'listing_basic' AND is_default = true AND is_active = true;

CREATE TABLE IF NOT EXISTS public.commerce_wallet_topup_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  source_kind text NOT NULL CHECK (source_kind IN ('fixed_option','custom_amount')),
  option_code text REFERENCES public.commerce_wallet_topup_options(code) ON DELETE RESTRICT,
  requested_amount_minor bigint NOT NULL CHECK (requested_amount_minor > 0),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','awaiting_payment','credited','failed','cancelled','chargeback_review')),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  provider text,
  provider_payment_id text,
  payment_attempt_id uuid REFERENCES public.commerce_payment_attempts(id) ON DELETE SET NULL,
  credited_at timestamptz,
  failed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, idempotency_key),
  UNIQUE (provider, provider_payment_id),
  CHECK (
    (source_kind = 'fixed_option' AND option_code IS NOT NULL)
    OR (source_kind = 'custom_amount' AND option_code IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_commerce_wallet_topup_owner
  ON public.commerce_wallet_topup_intents(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_wallet_topup_status
  ON public.commerce_wallet_topup_intents(status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_wallet_fee_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  user_listing_id uuid REFERENCES public.user_listings(id) ON DELETE SET NULL,
  submission_cycle integer NOT NULL CHECK (submission_cycle > 0),
  basic_product_id uuid NOT NULL REFERENCES public.commerce_fee_products(id) ON DELETE RESTRICT,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  total_minor bigint NOT NULL CHECK (total_minor > 0),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  status text NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved','captured','released','expired')),
  pricing_snapshot jsonb NOT NULL CHECK (jsonb_typeof(pricing_snapshot) = 'array' AND jsonb_array_length(pricing_snapshot) > 0),
  benefit_windows jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(benefit_windows) = 'array'),
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  starts_at timestamptz,
  ends_at timestamptz,
  captured_at timestamptz,
  released_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, idempotency_key),
  UNIQUE (user_listing_id, submission_cycle)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_wallet_fee_listing_reserved
  ON public.commerce_wallet_fee_reservations(user_listing_id)
  WHERE status = 'reserved';
CREATE INDEX IF NOT EXISTS idx_commerce_wallet_fee_owner
  ON public.commerce_wallet_fee_reservations(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_wallet_fee_status
  ON public.commerce_wallet_fee_reservations(status, expires_at);

CREATE TABLE IF NOT EXISTS public.commerce_wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (operation IN (
    'topup_credit','fee_reserve','fee_capture','fee_release',
    'admin_credit','admin_debit','chargeback_debit'
  )),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  available_after bigint NOT NULL CHECK (available_after >= 0),
  reserved_after bigint NOT NULL CHECK (reserved_after >= 0),
  topup_intent_id uuid REFERENCES public.commerce_wallet_topup_intents(id) ON DELETE RESTRICT,
  fee_reservation_id uuid REFERENCES public.commerce_wallet_fee_reservations(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_user_id, idempotency_key),
  CHECK (
    (operation = 'topup_credit' AND topup_intent_id IS NOT NULL AND fee_reservation_id IS NULL)
    OR (operation IN ('fee_reserve','fee_capture','fee_release') AND fee_reservation_id IS NOT NULL AND topup_intent_id IS NULL)
    OR (operation IN ('admin_credit','admin_debit','chargeback_debit') AND topup_intent_id IS NULL AND fee_reservation_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_commerce_wallet_ledger_owner
  ON public.commerce_wallet_ledger(owner_user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.commerce_wallet_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  receipt_number text NOT NULL UNIQUE CHECK (char_length(btrim(receipt_number)) BETWEEN 8 AND 80),
  receipt_kind text NOT NULL CHECK (receipt_kind IN ('wallet_topup','listing_fee')),
  document_type text NOT NULL DEFAULT 'internal_receipt',
  status text NOT NULL DEFAULT 'issued' CHECK (status IN ('issued','void')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  topup_intent_id uuid REFERENCES public.commerce_wallet_topup_intents(id) ON DELETE RESTRICT,
  fee_reservation_id uuid REFERENCES public.commerce_wallet_fee_reservations(id) ON DELETE RESTRICT,
  snapshot jsonb NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  issued_at timestamptz NOT NULL DEFAULT now(),
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (document_type = 'internal_receipt'),
  CHECK (
    (receipt_kind = 'wallet_topup' AND topup_intent_id IS NOT NULL AND fee_reservation_id IS NULL)
    OR (receipt_kind = 'listing_fee' AND fee_reservation_id IS NOT NULL AND topup_intent_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_commerce_wallet_receipts_owner
  ON public.commerce_wallet_receipts(owner_user_id, issued_at DESC);

CREATE OR REPLACE FUNCTION public.guard_commerce_wallet_account_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
     OR OLD.currency IS DISTINCT FROM NEW.currency THEN
    RAISE EXCEPTION 'Wallet owner and currency are immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_commerce_wallet_ledger_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Commerce wallet ledger is append-only.' USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_commerce_wallet_topup_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
     OR OLD.source_kind IS DISTINCT FROM NEW.source_kind
     OR OLD.option_code IS DISTINCT FROM NEW.option_code
     OR OLD.requested_amount_minor IS DISTINCT FROM NEW.requested_amount_minor
     OR OLD.currency IS DISTINCT FROM NEW.currency
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key THEN
    RAISE EXCEPTION 'Wallet top-up identity and amount are immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_commerce_wallet_fee_identity()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.owner_user_id IS DISTINCT FROM NEW.owner_user_id
     OR (OLD.user_listing_id IS DISTINCT FROM NEW.user_listing_id AND NEW.user_listing_id IS NOT NULL)
     OR OLD.submission_cycle IS DISTINCT FROM NEW.submission_cycle
     OR OLD.basic_product_id IS DISTINCT FROM NEW.basic_product_id
     OR OLD.total_minor IS DISTINCT FROM NEW.total_minor
     OR OLD.currency IS DISTINCT FROM NEW.currency
     OR OLD.pricing_snapshot IS DISTINCT FROM NEW.pricing_snapshot
     OR OLD.idempotency_key IS DISTINCT FROM NEW.idempotency_key THEN
    RAISE EXCEPTION 'Wallet fee reservation identity and price snapshot are immutable.' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.guard_commerce_wallet_account_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_commerce_wallet_ledger_append_only() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_commerce_wallet_topup_identity() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.guard_commerce_wallet_fee_identity() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_commerce_wallet_account_identity
  BEFORE UPDATE ON public.commerce_wallet_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_wallet_account_identity();
CREATE TRIGGER trg_commerce_wallet_ledger_append_only
  BEFORE UPDATE OR DELETE ON public.commerce_wallet_ledger
  FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_wallet_ledger_append_only();
CREATE TRIGGER trg_commerce_wallet_topup_identity
  BEFORE UPDATE ON public.commerce_wallet_topup_intents
  FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_wallet_topup_identity();
CREATE TRIGGER trg_commerce_wallet_fee_identity
  BEFORE UPDATE ON public.commerce_wallet_fee_reservations
  FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_wallet_fee_identity();

ALTER TABLE public.commerce_wallet_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_wallet_topup_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_wallet_topup_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_fee_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_wallet_topup_intents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_wallet_fee_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_wallet_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commerce_wallet_receipts ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.commerce_wallet_accounts,
  public.commerce_wallet_topup_config,
  public.commerce_wallet_topup_options,
  public.commerce_fee_products,
  public.commerce_wallet_topup_intents,
  public.commerce_wallet_fee_reservations,
  public.commerce_wallet_ledger,
  public.commerce_wallet_receipts
FROM PUBLIC, anon, authenticated;

CREATE POLICY commerce_wallet_account_owner_read ON public.commerce_wallet_accounts
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY commerce_wallet_topup_option_public_read ON public.commerce_wallet_topup_options
  FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY commerce_fee_product_public_read ON public.commerce_fee_products
  FOR SELECT TO anon, authenticated USING (
    is_active = true
    AND (valid_from IS NULL OR valid_from <= now())
    AND (valid_until IS NULL OR valid_until > now())
  );
CREATE POLICY commerce_wallet_topup_owner_read ON public.commerce_wallet_topup_intents
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY commerce_wallet_fee_owner_read ON public.commerce_wallet_fee_reservations
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY commerce_wallet_ledger_owner_read ON public.commerce_wallet_ledger
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());
CREATE POLICY commerce_wallet_receipt_owner_read ON public.commerce_wallet_receipts
  FOR SELECT TO authenticated USING (owner_user_id = auth.uid());

GRANT SELECT ON public.commerce_wallet_topup_options, public.commerce_fee_products TO anon, authenticated;
GRANT SELECT ON public.commerce_wallet_accounts, public.commerce_wallet_topup_intents,
  public.commerce_wallet_fee_reservations, public.commerce_wallet_ledger,
  public.commerce_wallet_receipts TO authenticated;

COMMENT ON TABLE public.commerce_wallet_accounts IS 'Prepaid VND wallet; balances never expire and are not withdrawable through product flows.';
COMMENT ON TABLE public.commerce_wallet_ledger IS 'Append-only wallet movements; available/reserved balances are changed only by privileged RPCs.';
COMMENT ON TABLE public.commerce_wallet_receipts IS 'Internal receipts only; not tax invoices.';

NOTIFY pgrst, 'reload schema';
