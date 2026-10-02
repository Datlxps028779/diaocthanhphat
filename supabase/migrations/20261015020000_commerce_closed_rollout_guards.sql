-- Commerce closed-rollout guards. Production execution is user-run.
-- No pricing, denomination, tax, invoice or payment data is seeded here.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.commerce_wallet_topup_options WHERE is_active = true
  ) THEN
    RAISE EXCEPTION 'Closed rollout requires all wallet top-up options to be inactive.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commerce_fee_products WHERE is_active = true OR is_default = true
  ) THEN
    RAISE EXCEPTION 'Closed rollout requires all fee products to be inactive and non-default.' USING ERRCODE = 'P0001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commerce_fee_product_rules WHERE is_active = true
  ) THEN
    RAISE EXCEPTION 'Closed rollout requires all fee product rules to be inactive.' USING ERRCODE = 'P0001';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commerce_wallet_topup_options'::regclass
      AND conname = 'commerce_wallet_topup_options_closed_rollout_inactive_check'
  ) THEN
    ALTER TABLE public.commerce_wallet_topup_options
      ADD CONSTRAINT commerce_wallet_topup_options_closed_rollout_inactive_check
      CHECK (is_active = false);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commerce_fee_products'::regclass
      AND conname = 'commerce_fee_products_closed_rollout_inactive_check'
  ) THEN
    ALTER TABLE public.commerce_fee_products
      ADD CONSTRAINT commerce_fee_products_closed_rollout_inactive_check
      CHECK (is_active = false);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commerce_fee_products'::regclass
      AND conname = 'commerce_fee_products_closed_rollout_default_check'
  ) THEN
    ALTER TABLE public.commerce_fee_products
      ADD CONSTRAINT commerce_fee_products_closed_rollout_default_check
      CHECK (is_default = false);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.commerce_fee_product_rules'::regclass
      AND conname = 'commerce_fee_product_rules_closed_rollout_inactive_check'
  ) THEN
    ALTER TABLE public.commerce_fee_product_rules
      ADD CONSTRAINT commerce_fee_product_rules_closed_rollout_inactive_check
      CHECK (is_active = false);
  END IF;
END;
$$;

-- Keep the admin RPC signatures stable; table constraints are the final guard
-- for RPC calls and any other privileged write path.
CREATE OR REPLACE FUNCTION public.commerce_reject_paid_listing_approval_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.fee_mode = 'paid' THEN
    RAISE EXCEPTION 'Paid listing approval is not available in this rollout.' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_reject_paid_listing_approval_insert() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS commerce_closed_rollout_reject_paid_approval ON public.commerce_listing_approval_fee_decisions;
CREATE TRIGGER commerce_closed_rollout_reject_paid_approval
  BEFORE INSERT ON public.commerce_listing_approval_fee_decisions
  FOR EACH ROW
  EXECUTE FUNCTION public.commerce_reject_paid_listing_approval_insert();

-- The resolver is the first paid-path operation after listing validation and
-- therefore fails before any wallet reservation or property mutation.
CREATE OR REPLACE FUNCTION public.commerce_resolve_listing_fee_product(
  p_user_listing_id uuid,
  p_fee_product_code text
)
RETURNS TABLE (
  rule_id uuid,
  fee_product_id uuid,
  code text,
  version integer,
  name text,
  description text,
  product_kind text,
  amount_minor bigint,
  currency text,
  duration_days integer,
  terms_version text,
  listing_type text,
  property_type_id uuid,
  priority integer,
  rule_specificity text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_user_listing_id IS NULL OR NULLIF(btrim(COALESCE(p_fee_product_code, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Listing and fee product code are required.' USING ERRCODE = '22023';
  END IF;
  RAISE EXCEPTION 'Paid listing approval is not available in this rollout.' USING ERRCODE = '22023';
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_resolve_listing_fee_product(uuid, text) FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
