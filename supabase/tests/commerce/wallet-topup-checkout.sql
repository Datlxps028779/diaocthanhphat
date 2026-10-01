\set ON_ERROR_STOP on

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

SELECT id AS recovery_intent_id
FROM public.commerce_wallet_topup_intents
WHERE idempotency_key = 'wallet-topup-custom-001'
\gset

SELECT *
FROM public.commerce_start_wallet_topup_checkout(
  :'recovery_intent_id'::uuid,
  'payos',
  'wallet-checkout-recovery-001'
) \gset recovery_

SELECT *
FROM public.commerce_start_wallet_topup_checkout(
  :'recovery_intent_id'::uuid,
  'payos',
  'wallet-checkout-replay-different-key'
) \gset replay_

SELECT topup_intent_id AS attach_intent_id
FROM public.commerce_create_wallet_topup_intent(
  NULL,
  300000,
  'wallet-topup-checkout-attach-001'
) \gset

SELECT *
FROM public.commerce_start_wallet_topup_checkout(
  :'attach_intent_id'::uuid,
  'payos',
  'wallet-checkout-attach-001'
) \gset attach_

DO $$
BEGIN
  BEGIN
    INSERT INTO public.commerce_wallet_topup_checkouts(
      topup_intent_id, owner_user_id, provider, provider_order_code,
      amount_minor, currency, idempotency_key, expires_at
    ) VALUES (
      gen_random_uuid(), auth.uid(), 'payos', 9007199254740000,
      1, 'VND', 'wallet-checkout-direct-write', clock_timestamp() + interval '15 minutes'
    );
    RAISE EXCEPTION 'authenticated direct wallet checkout write unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
CREATE TEMP TABLE wallet_checkout_claim_results(name text PRIMARY KEY, claimed boolean);

INSERT INTO wallet_checkout_claim_results
SELECT 'recovery_a', public.commerce_claim_wallet_topup_checkout(
  :'recovery_topup_checkout_id'::uuid,
  'wallet-recovery-claim-token-a'
);
INSERT INTO wallet_checkout_claim_results
SELECT 'recovery_b', public.commerce_claim_wallet_topup_checkout(
  :'recovery_topup_checkout_id'::uuid,
  'wallet-recovery-claim-token-b'
);

SELECT public.commerce_recover_wallet_topup_checkout(
  :'recovery_topup_checkout_id'::uuid,
  'wallet-recovery-claim-token-a',
  'wallet-provider-recovery-001',
  'payos_checkout_recovery_required'
);

INSERT INTO wallet_checkout_claim_results
SELECT 'attach', public.commerce_claim_wallet_topup_checkout(
  :'attach_topup_checkout_id'::uuid,
  'wallet-attach-claim-token-001'
);
SELECT public.commerce_attach_wallet_topup_checkout(
  :'attach_topup_checkout_id'::uuid,
  'wallet-attach-claim-token-001',
  'wallet-provider-attach-001',
  'https://pay.payos.vn/web/wallet-provider-attach-001',
  :'attach_checkout_expires_at'::timestamptz
);

DO $$
BEGIN
  IF (
    SELECT count(*) FROM public.commerce_wallet_topup_checkouts c
    JOIN public.commerce_wallet_topup_intents i ON i.id = c.topup_intent_id
    WHERE i.idempotency_key = 'wallet-topup-custom-001'
  ) <> 1 THEN
    RAISE EXCEPTION 'wallet checkout replay created another checkout';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_topup_checkouts c
    JOIN public.commerce_wallet_topup_intents i ON i.id = c.topup_intent_id
    WHERE i.idempotency_key = 'wallet-topup-custom-001'
      AND c.amount_minor = 250000
      AND c.currency = 'VND'
  ) THEN
    RAISE EXCEPTION 'wallet checkout did not preserve server-priced amount';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM wallet_checkout_claim_results WHERE name = 'recovery_a' AND claimed)
     OR NOT EXISTS (SELECT 1 FROM wallet_checkout_claim_results WHERE name = 'recovery_b' AND NOT claimed)
     OR NOT EXISTS (SELECT 1 FROM wallet_checkout_claim_results WHERE name = 'attach' AND claimed) THEN
    RAISE EXCEPTION 'wallet checkout claim did not isolate one owner';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_topup_checkouts c
    JOIN public.commerce_wallet_topup_intents i ON i.id = c.topup_intent_id
    WHERE i.idempotency_key = 'wallet-topup-custom-001'
      AND c.status = 'recovery_required'
      AND c.provider_payment_id = 'wallet-provider-recovery-001'
      AND c.claim_token IS NULL
  ) THEN
    RAISE EXCEPTION 'wallet checkout recovery state is wrong';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_topup_checkouts c
    JOIN public.commerce_wallet_topup_intents i ON i.id = c.topup_intent_id
    WHERE i.idempotency_key = 'wallet-topup-checkout-attach-001'
      AND c.status = 'pending'
      AND c.provider_payment_id = 'wallet-provider-attach-001'
      AND c.checkout_url = 'https://pay.payos.vn/web/wallet-provider-attach-001'
  ) THEN
    RAISE EXCEPTION 'wallet checkout attachment state is wrong';
  END IF;
  IF EXISTS (
    SELECT provider_order_code
    FROM (
      SELECT provider_order_code FROM public.commerce_payment_attempts
      UNION ALL
      SELECT provider_order_code FROM public.commerce_wallet_topup_checkouts
    ) codes
    GROUP BY provider_order_code
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'provider order code collided across checkout domains';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commerce_wallet_topup_intents
    WHERE idempotency_key IN ('wallet-topup-custom-001', 'wallet-topup-checkout-attach-001')
      AND (status <> 'awaiting_payment' OR provider_payment_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'wallet top-up intent did not attach provider identity';
  END IF;
END
$$;

SELECT jsonb_build_object(
  'server_priced', true,
  'shared_provider_order_code', true,
  'claim_isolated', true,
  'recovery_durable', true,
  'attach_durable', true,
  'client_write_denied', true,
  'wallet_topup_checkout_pass', true
) AS commerce_wallet_topup_checkout_result;
