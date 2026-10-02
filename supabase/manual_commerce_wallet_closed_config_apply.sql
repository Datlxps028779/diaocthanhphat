-- Commerce Wallet closed-config initialization.
-- USER-RUN ONLY. This is the only script in this pair that changes data.
-- It does not create top-up options, fee products, payment attempts or provider checkouts.
-- It never enables top-up or custom amounts.

BEGIN;

DO $block$
DECLARE
  v_before jsonb;
  v_after jsonb;
BEGIN
  IF to_regclass('public.commerce_wallet_topup_config') IS NULL
     OR to_regclass('public.commerce_audit_events') IS NULL THEN
    RAISE EXCEPTION 'Commerce Wallet configuration prerequisites are missing.'
      USING ERRCODE = '3F000';
  END IF;

  SELECT to_jsonb(c)
  INTO v_before
  FROM public.commerce_wallet_topup_config c
  WHERE c.id = true
  FOR UPDATE;

  IF v_before IS NOT NULL THEN
    IF (v_before->>'is_active')::boolean IS DISTINCT FROM false
       OR (v_before->>'custom_amount_enabled')::boolean IS DISTINCT FROM false
       OR v_before->>'custom_min_minor' IS NOT NULL
       OR v_before->>'custom_max_minor' IS NOT NULL
       OR v_before->>'custom_step_minor' IS NOT NULL THEN
      RAISE EXCEPTION 'Existing Wallet configuration is not closed; no changes were made.'
        USING ERRCODE = '22023';
    END IF;

    RAISE NOTICE 'Closed Wallet configuration already exists; no changes were made.';
    RETURN;
  END IF;

  INSERT INTO public.commerce_wallet_topup_config(
    id,
    is_active,
    custom_amount_enabled,
    custom_min_minor,
    custom_max_minor,
    custom_step_minor,
    updated_by,
    updated_at
  ) VALUES (
    true,
    false,
    false,
    NULL,
    NULL,
    NULL,
    NULL,
    clock_timestamp()
  )
  RETURNING jsonb_build_object(
    'id', id,
    'is_active', is_active,
    'custom_amount_enabled', custom_amount_enabled,
    'custom_min_minor', custom_min_minor,
    'custom_max_minor', custom_max_minor,
    'custom_step_minor', custom_step_minor,
    'updated_by', updated_by,
    'updated_at', updated_at
  )
  INTO v_after;

  INSERT INTO public.commerce_audit_events(
    actor_id,
    actor_role,
    entity_type,
    event_type,
    correlation_id,
    before_state,
    after_state,
    metadata
  ) VALUES (
    NULL,
    'system',
    'wallet_topup_config',
    'commerce_wallet_topup_config_initialized_closed',
    'wallet_topup_config',
    NULL,
    v_after,
    jsonb_build_object('source', 'manual_closed_config_initialization')
  );
END
$block$;

COMMIT;

SELECT jsonb_build_object(
  'is_active', c.is_active,
  'custom_amount_enabled', c.custom_amount_enabled,
  'custom_min_minor', c.custom_min_minor,
  'custom_max_minor', c.custom_max_minor,
  'custom_step_minor', c.custom_step_minor,
  'topup_activation_closed', (
    c.is_active = false
    AND c.custom_amount_enabled = false
    AND c.custom_min_minor IS NULL
    AND c.custom_max_minor IS NULL
    AND c.custom_step_minor IS NULL
  )
)
FROM public.commerce_wallet_topup_config c
WHERE c.id = true;
