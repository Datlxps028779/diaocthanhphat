-- =============================================================================
-- Commerce listing approval fee decisions
-- Append-only decision history for Admin free/paid approval cycles.
-- No pricing seed and no wallet mutation.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.commerce_listing_approval_fee_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_listing_id uuid NOT NULL,
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approval_cycle integer NOT NULL CHECK (approval_cycle > 0),
  fee_mode text NOT NULL CHECK (fee_mode IN ('free', 'paid')),
  fee_product_id uuid REFERENCES public.commerce_fee_products(id) ON DELETE SET NULL,
  fee_product_code text,
  fee_product_version integer,
  amount_minor bigint,
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  duration_days integer,
  terms_version text,
  manual_reason text,
  idempotency_key text NOT NULL CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_listing_id, approval_cycle),
  UNIQUE (owner_user_id, idempotency_key),
  CHECK (
    (fee_mode = 'free'
      AND fee_product_id IS NULL
      AND fee_product_code IS NULL
      AND fee_product_version IS NULL
      AND amount_minor IS NULL
      AND duration_days IS NULL
      AND terms_version IS NULL
      AND char_length(btrim(COALESCE(manual_reason, ''))) BETWEEN 1 AND 1000)
    OR
    (fee_mode = 'paid'
      AND fee_product_id IS NOT NULL
      AND char_length(btrim(COALESCE(fee_product_code, ''))) BETWEEN 3 AND 64
      AND fee_product_version IS NOT NULL
      AND fee_product_version > 0
      AND amount_minor IS NOT NULL
      AND amount_minor > 0
      AND duration_days IS NOT NULL
      AND duration_days > 0
      AND char_length(btrim(COALESCE(terms_version, ''))) BETWEEN 1 AND 80
      AND manual_reason IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_commerce_listing_approval_fee_decisions_listing
  ON public.commerce_listing_approval_fee_decisions(user_listing_id, approval_cycle DESC);

CREATE INDEX IF NOT EXISTS idx_commerce_listing_approval_fee_decisions_owner
  ON public.commerce_listing_approval_fee_decisions(owner_user_id, decided_at DESC);

CREATE OR REPLACE FUNCTION public.guard_commerce_listing_approval_fee_decision_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'Listing approval fee decisions are append-only.' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.guard_commerce_listing_approval_fee_decision_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_commerce_listing_approval_fee_decision_append_only
  ON public.commerce_listing_approval_fee_decisions;
CREATE TRIGGER trg_commerce_listing_approval_fee_decision_append_only
  BEFORE UPDATE OR DELETE ON public.commerce_listing_approval_fee_decisions
  FOR EACH ROW EXECUTE FUNCTION public.guard_commerce_listing_approval_fee_decision_append_only();

ALTER TABLE public.commerce_listing_approval_fee_decisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commerce_listing_approval_fee_decisions FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
