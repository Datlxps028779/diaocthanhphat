-- =============================================================================
-- Commerce Wallet finance boundaries and support lookup
-- Internal chargeback review and wallet adjustments only.
-- No withdrawal, bank refund, tax invoice or provider refund capability.
-- =============================================================================

INSERT INTO public.staff_permission_catalog(module, action, label)
VALUES
  ('commerce-finance', 'view', 'Finance Wallet'),
  ('commerce-finance', 'edit', 'Finance Wallet')
ON CONFLICT (module, action) DO UPDATE SET label = EXCLUDED.label;

CREATE TABLE IF NOT EXISTS public.commerce_wallet_finance_cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  case_kind text NOT NULL CHECK (case_kind IN ('chargeback', 'adjustment')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'applied', 'rejected', 'blocked')),
  owner_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  topup_intent_id uuid REFERENCES public.commerce_wallet_topup_intents(id) ON DELETE RESTRICT,
  operation text NOT NULL CHECK (operation IN ('admin_credit', 'admin_debit', 'chargeback_debit')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0 AND amount_minor <= 9007199254740991),
  currency text NOT NULL DEFAULT 'VND' CHECK (currency = 'VND'),
  reason_code text NOT NULL CHECK (reason_code ~ '^[a-z0-9][a-z0-9_-]{2,63}$'),
  reason_note text CHECK (reason_note IS NULL OR char_length(btrim(reason_note)) BETWEEN 1 AND 1000),
  idempotency_key text NOT NULL UNIQUE CHECK (char_length(idempotency_key) BETWEEN 16 AND 160),
  requested_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (case_kind = 'chargeback' AND topup_intent_id IS NOT NULL AND operation = 'chargeback_debit')
    OR (case_kind = 'adjustment' AND topup_intent_id IS NULL AND operation IN ('admin_credit', 'admin_debit'))
  ),
  CHECK ((status IN ('applied', 'rejected', 'blocked') AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL) OR status = 'open')
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_commerce_wallet_chargeback_case
  ON public.commerce_wallet_finance_cases(topup_intent_id)
  WHERE case_kind = 'chargeback';
CREATE INDEX IF NOT EXISTS idx_commerce_wallet_finance_owner
  ON public.commerce_wallet_finance_cases(owner_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commerce_wallet_finance_status
  ON public.commerce_wallet_finance_cases(status, created_at DESC);

ALTER TABLE public.commerce_wallet_finance_cases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.commerce_wallet_finance_cases FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.commerce_finance_adjust_wallet(
  p_owner_user_id uuid,
  p_operation text,
  p_amount_minor bigint,
  p_reason_code text,
  p_reason_note text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case public.commerce_wallet_finance_cases%ROWTYPE;
  v_wallet public.commerce_wallet_accounts%ROWTYPE;
  v_note text := NULLIF(btrim(COALESCE(p_reason_note, '')), '');
  v_reason text := lower(btrim(COALESCE(p_reason_code, '')));
BEGIN
  IF v_actor IS NULL OR NOT public.has_staff_permission('commerce-finance', 'edit') THEN
    RAISE EXCEPTION 'Commerce finance edit permission required.' USING ERRCODE = '42501';
  END IF;
  IF p_owner_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = p_owner_user_id) THEN
    RAISE EXCEPTION 'Wallet owner is invalid.' USING ERRCODE = '22023';
  END IF;
  IF p_operation NOT IN ('admin_credit', 'admin_debit') THEN
    RAISE EXCEPTION 'Only internal wallet credit or debit adjustments are allowed.' USING ERRCODE = '22023';
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 OR p_amount_minor > 9007199254740991 THEN
    RAISE EXCEPTION 'Wallet adjustment amount is invalid.' USING ERRCODE = '22023';
  END IF;
  IF v_reason !~ '^[a-z0-9][a-z0-9_-]{2,63}$' OR char_length(COALESCE(p_idempotency_key, '')) NOT BETWEEN 16 AND 160 THEN
    RAISE EXCEPTION 'Wallet adjustment identity is invalid.' USING ERRCODE = '22023';
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 1000 THEN
    RAISE EXCEPTION 'Wallet adjustment note is too long.' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.commerce_wallet_finance_cases(
    case_kind, status, owner_user_id, operation, amount_minor, reason_code, reason_note,
    idempotency_key, requested_by
  ) VALUES (
    'adjustment', 'open', p_owner_user_id, p_operation, p_amount_minor, v_reason, v_note,
    p_idempotency_key, v_actor
  ) ON CONFLICT (idempotency_key) DO NOTHING;

  SELECT * INTO v_case
  FROM public.commerce_wallet_finance_cases
  WHERE idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF v_case.owner_user_id IS DISTINCT FROM p_owner_user_id
     OR v_case.operation IS DISTINCT FROM p_operation
     OR v_case.amount_minor IS DISTINCT FROM p_amount_minor
     OR v_case.reason_code IS DISTINCT FROM v_reason THEN
    RAISE EXCEPTION 'Wallet adjustment idempotency collision.' USING ERRCODE = '22023';
  END IF;
  IF v_case.status = 'applied' THEN
    SELECT * INTO v_wallet FROM public.commerce_wallet_accounts WHERE owner_user_id = p_owner_user_id;
    RETURN jsonb_build_object('caseId', v_case.id, 'status', v_case.status, 'duplicate', true, 'availableMinor', v_wallet.available_minor, 'reservedMinor', v_wallet.reserved_minor);
  END IF;
  IF v_case.status <> 'open' THEN
    RAISE EXCEPTION 'Wallet adjustment is no longer open.' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.commerce_wallet_accounts(owner_user_id)
  VALUES (p_owner_user_id)
  ON CONFLICT (owner_user_id) DO NOTHING;
  SELECT * INTO v_wallet
  FROM public.commerce_wallet_accounts
  WHERE owner_user_id = p_owner_user_id
  FOR UPDATE;

  IF p_operation = 'admin_debit' AND v_wallet.available_minor < p_amount_minor THEN
    UPDATE public.commerce_wallet_finance_cases
    SET status = 'blocked', resolved_by = v_actor, resolved_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = v_case.id;
    INSERT INTO public.commerce_audit_events(owner_user_id, actor_id, actor_role, entity_type, entity_id, event_type, correlation_id, after_state)
    VALUES (p_owner_user_id, v_actor, 'finance', 'wallet_finance_case', v_case.id, 'commerce_wallet_adjustment_blocked_insufficient_balance', p_idempotency_key, jsonb_build_object('amount_minor', p_amount_minor));
    RETURN jsonb_build_object('caseId', v_case.id, 'status', 'blocked', 'duplicate', false, 'availableMinor', v_wallet.available_minor, 'reservedMinor', v_wallet.reserved_minor);
  END IF;

  UPDATE public.commerce_wallet_accounts
  SET available_minor = CASE WHEN p_operation = 'admin_credit' THEN available_minor + p_amount_minor ELSE available_minor - p_amount_minor END,
      updated_at = clock_timestamp()
  WHERE owner_user_id = p_owner_user_id
  RETURNING * INTO v_wallet;

  INSERT INTO public.commerce_wallet_ledger(
    owner_user_id, operation, amount_minor, available_after, reserved_after,
    idempotency_key, metadata
  ) VALUES (
    p_owner_user_id, p_operation, p_amount_minor, v_wallet.available_minor, v_wallet.reserved_minor,
    'finance_case:' || v_case.id::text,
    jsonb_build_object('finance_case_id', v_case.id, 'reason_code', v_reason, 'reason_note', v_note)
  );

  UPDATE public.commerce_wallet_finance_cases
  SET status = 'applied', resolved_by = v_actor, resolved_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE id = v_case.id;
  INSERT INTO public.commerce_audit_events(owner_user_id, actor_id, actor_role, entity_type, entity_id, event_type, correlation_id, after_state)
  VALUES (p_owner_user_id, v_actor, 'finance', 'wallet_finance_case', v_case.id, 'commerce_wallet_adjustment_applied', p_idempotency_key, jsonb_build_object('operation', p_operation, 'amount_minor', p_amount_minor));

  RETURN jsonb_build_object('caseId', v_case.id, 'status', 'applied', 'duplicate', false, 'availableMinor', v_wallet.available_minor, 'reservedMinor', v_wallet.reserved_minor);
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_finance_open_wallet_chargeback(
  p_topup_intent_id uuid,
  p_reason_code text,
  p_reason_note text,
  p_idempotency_key text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_intent public.commerce_wallet_topup_intents%ROWTYPE;
  v_case public.commerce_wallet_finance_cases%ROWTYPE;
  v_reason text := lower(btrim(COALESCE(p_reason_code, '')));
  v_note text := NULLIF(btrim(COALESCE(p_reason_note, '')), '');
BEGIN
  IF v_actor IS NULL OR NOT public.has_staff_permission('commerce-finance', 'edit') THEN
    RAISE EXCEPTION 'Commerce finance edit permission required.' USING ERRCODE = '42501';
  END IF;
  IF p_topup_intent_id IS NULL OR v_reason !~ '^[a-z0-9][a-z0-9_-]{2,63}$' OR char_length(COALESCE(p_idempotency_key, '')) NOT BETWEEN 16 AND 160 THEN
    RAISE EXCEPTION 'Chargeback case identity is invalid.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_intent FROM public.commerce_wallet_topup_intents WHERE id = p_topup_intent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet top-up intent not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_intent.status <> 'credited' THEN
    RAISE EXCEPTION 'Only a credited wallet top-up can enter chargeback review.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.commerce_wallet_finance_cases(
    case_kind, status, owner_user_id, topup_intent_id, operation, amount_minor, reason_code, reason_note,
    idempotency_key, requested_by
  ) VALUES (
    'chargeback', 'open', v_intent.owner_user_id, v_intent.id, 'chargeback_debit', v_intent.requested_amount_minor,
    v_reason, v_note, p_idempotency_key, v_actor
  ) ON CONFLICT (idempotency_key) DO NOTHING;
  SELECT * INTO v_case FROM public.commerce_wallet_finance_cases WHERE idempotency_key = p_idempotency_key FOR UPDATE;
  IF v_case.topup_intent_id IS DISTINCT FROM v_intent.id OR v_case.amount_minor IS DISTINCT FROM v_intent.requested_amount_minor THEN
    RAISE EXCEPTION 'Chargeback idempotency collision.' USING ERRCODE = '22023';
  END IF;
  IF v_case.status = 'open' OR v_case.status = 'applied' OR v_case.status = 'blocked' OR v_case.status = 'rejected' THEN
    IF v_intent.status = 'credited' THEN
      UPDATE public.commerce_wallet_topup_intents SET status = 'chargeback_review', updated_at = clock_timestamp() WHERE id = v_intent.id;
    END IF;
    INSERT INTO public.commerce_audit_events(owner_user_id, actor_id, actor_role, entity_type, entity_id, event_type, correlation_id, after_state)
    VALUES (v_intent.owner_user_id, v_actor, 'finance', 'wallet_topup_intent', v_intent.id, 'commerce_wallet_chargeback_review_opened', p_idempotency_key, jsonb_build_object('finance_case_id', v_case.id));
  END IF;
  RETURN jsonb_build_object('caseId', v_case.id, 'status', v_case.status, 'duplicate', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_finance_resolve_wallet_chargeback(
  p_case_id uuid,
  p_decision text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_case public.commerce_wallet_finance_cases%ROWTYPE;
  v_intent public.commerce_wallet_topup_intents%ROWTYPE;
  v_wallet public.commerce_wallet_accounts%ROWTYPE;
BEGIN
  IF v_actor IS NULL OR NOT public.has_staff_permission('commerce-finance', 'edit') THEN
    RAISE EXCEPTION 'Commerce finance edit permission required.' USING ERRCODE = '42501';
  END IF;
  IF p_case_id IS NULL OR p_decision NOT IN ('apply', 'reject') THEN
    RAISE EXCEPTION 'Chargeback decision is invalid.' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_case FROM public.commerce_wallet_finance_cases WHERE id = p_case_id FOR UPDATE;
  IF NOT FOUND OR v_case.case_kind <> 'chargeback' THEN
    RAISE EXCEPTION 'Chargeback case not found.' USING ERRCODE = 'P0002';
  END IF;
  IF v_case.status <> 'open' THEN
    RETURN jsonb_build_object('caseId', v_case.id, 'status', v_case.status, 'duplicate', true);
  END IF;
  SELECT * INTO v_intent FROM public.commerce_wallet_topup_intents WHERE id = v_case.topup_intent_id FOR UPDATE;
  IF p_decision = 'reject' THEN
    UPDATE public.commerce_wallet_finance_cases
    SET status = 'rejected', resolved_by = v_actor, resolved_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = v_case.id;
    UPDATE public.commerce_wallet_topup_intents SET status = 'credited', updated_at = clock_timestamp() WHERE id = v_intent.id;
    INSERT INTO public.commerce_audit_events(owner_user_id, actor_id, actor_role, entity_type, entity_id, event_type, correlation_id, after_state)
    VALUES (v_case.owner_user_id, v_actor, 'finance', 'wallet_finance_case', v_case.id, 'commerce_wallet_chargeback_rejected', v_case.idempotency_key, jsonb_build_object('topup_intent_id', v_intent.id));
    RETURN jsonb_build_object('caseId', v_case.id, 'status', 'rejected', 'duplicate', false);
  END IF;

  INSERT INTO public.commerce_wallet_accounts(owner_user_id) VALUES (v_case.owner_user_id) ON CONFLICT (owner_user_id) DO NOTHING;
  SELECT * INTO v_wallet FROM public.commerce_wallet_accounts WHERE owner_user_id = v_case.owner_user_id FOR UPDATE;
  IF v_wallet.available_minor < v_case.amount_minor THEN
    UPDATE public.commerce_wallet_finance_cases
    SET status = 'blocked', resolved_by = v_actor, resolved_at = clock_timestamp(), updated_at = clock_timestamp()
    WHERE id = v_case.id;
    INSERT INTO public.commerce_audit_events(owner_user_id, actor_id, actor_role, entity_type, entity_id, event_type, correlation_id, after_state)
    VALUES (v_case.owner_user_id, v_actor, 'finance', 'wallet_finance_case', v_case.id, 'commerce_wallet_chargeback_blocked_insufficient_balance', v_case.idempotency_key, jsonb_build_object('amount_minor', v_case.amount_minor));
    RETURN jsonb_build_object('caseId', v_case.id, 'status', 'blocked', 'duplicate', false);
  END IF;

  UPDATE public.commerce_wallet_accounts
  SET available_minor = available_minor - v_case.amount_minor, updated_at = clock_timestamp()
  WHERE owner_user_id = v_case.owner_user_id
  RETURNING * INTO v_wallet;
  INSERT INTO public.commerce_wallet_ledger(owner_user_id, operation, amount_minor, available_after, reserved_after, idempotency_key, metadata)
  VALUES (v_case.owner_user_id, 'chargeback_debit', v_case.amount_minor, v_wallet.available_minor, v_wallet.reserved_minor, 'finance_case:' || v_case.id::text, jsonb_build_object('finance_case_id', v_case.id, 'topup_intent_id', v_intent.id));
  UPDATE public.commerce_wallet_finance_cases
  SET status = 'applied', resolved_by = v_actor, resolved_at = clock_timestamp(), updated_at = clock_timestamp()
  WHERE id = v_case.id;
  INSERT INTO public.commerce_audit_events(owner_user_id, actor_id, actor_role, entity_type, entity_id, event_type, correlation_id, after_state)
  VALUES (v_case.owner_user_id, v_actor, 'finance', 'wallet_finance_case', v_case.id, 'commerce_wallet_chargeback_applied', v_case.idempotency_key, jsonb_build_object('amount_minor', v_case.amount_minor));
  RETURN jsonb_build_object('caseId', v_case.id, 'status', 'applied', 'duplicate', false, 'availableMinor', v_wallet.available_minor);
END;
$$;

CREATE OR REPLACE FUNCTION public.commerce_get_wallet_support_detail(p_lookup text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lookup text := NULLIF(btrim(COALESCE(p_lookup, '')), '');
  v_intent public.commerce_wallet_topup_intents%ROWTYPE;
  v_checkout public.commerce_wallet_topup_checkouts%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR (
    NOT public.has_staff_permission('commerce-operations', 'view')
    AND NOT public.has_staff_permission('commerce-finance', 'view')
  ) THEN
    RAISE EXCEPTION 'Commerce wallet support view permission required.' USING ERRCODE = '42501';
  END IF;
  IF v_lookup IS NULL OR char_length(v_lookup) > 160 THEN
    RAISE EXCEPTION 'Wallet support lookup is invalid.' USING ERRCODE = '22023';
  END IF;

  SELECT i.* INTO v_intent
  FROM public.commerce_wallet_topup_intents i
  LEFT JOIN public.commerce_wallet_topup_checkouts c ON c.topup_intent_id = i.id
  WHERE i.id::text = v_lookup OR i.provider_payment_id = v_lookup OR c.id::text = v_lookup OR c.provider_order_code::text = v_lookup
  ORDER BY i.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet top-up not found.' USING ERRCODE = 'P0002';
  END IF;
  SELECT * INTO v_checkout FROM public.commerce_wallet_topup_checkouts WHERE topup_intent_id = v_intent.id;

  RETURN jsonb_build_object(
    'topupIntent', jsonb_build_object(
      'id', v_intent.id, 'owner_user_id', v_intent.owner_user_id, 'source_kind', v_intent.source_kind,
      'option_code', v_intent.option_code, 'requested_amount_minor', v_intent.requested_amount_minor,
      'currency', v_intent.currency, 'status', v_intent.status, 'provider', v_intent.provider,
      'provider_payment_id', v_intent.provider_payment_id, 'payment_attempt_id', v_intent.payment_attempt_id,
      'credited_at', v_intent.credited_at, 'failed_at', v_intent.failed_at, 'cancelled_at', v_intent.cancelled_at,
      'created_at', v_intent.created_at, 'updated_at', v_intent.updated_at
    ),
    'checkout', CASE WHEN v_checkout.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', v_checkout.id, 'provider', v_checkout.provider, 'provider_order_code', v_checkout.provider_order_code,
      'amount_minor', v_checkout.amount_minor, 'currency', v_checkout.currency, 'status', v_checkout.status,
      'provider_payment_id', v_checkout.provider_payment_id, 'expires_at', v_checkout.expires_at,
      'recovery_error_code', v_checkout.recovery_error_code, 'created_at', v_checkout.created_at, 'updated_at', v_checkout.updated_at
    ) END,
    'ledger', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', l.id, 'operation', l.operation, 'amount_minor', l.amount_minor, 'currency', l.currency,
      'available_after', l.available_after, 'reserved_after', l.reserved_after, 'occurred_at', l.occurred_at
    ) ORDER BY l.occurred_at), '[]'::jsonb) FROM public.commerce_wallet_ledger l WHERE l.owner_user_id = v_intent.owner_user_id AND (l.topup_intent_id = v_intent.id OR l.operation IN ('admin_credit','admin_debit','chargeback_debit'))),
    'receipts', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', r.id, 'receipt_number', r.receipt_number, 'receipt_kind', r.receipt_kind,
      'document_type', r.document_type, 'status', r.status, 'amount_minor', r.amount_minor,
      'currency', r.currency, 'issued_at', r.issued_at, 'voided_at', r.voided_at
    ) ORDER BY r.issued_at), '[]'::jsonb) FROM public.commerce_wallet_receipts r WHERE r.owner_user_id = v_intent.owner_user_id AND (r.topup_intent_id = v_intent.id OR r.receipt_kind = 'listing_fee')),
    'financeCases', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', f.id, 'case_kind', f.case_kind, 'status', f.status, 'operation', f.operation,
      'amount_minor', f.amount_minor, 'currency', f.currency, 'reason_code', f.reason_code,
      'reason_note', f.reason_note, 'requested_by', f.requested_by, 'resolved_by', f.resolved_by,
      'created_at', f.created_at, 'resolved_at', f.resolved_at
    ) ORDER BY f.created_at), '[]'::jsonb) FROM public.commerce_wallet_finance_cases f WHERE f.owner_user_id = v_intent.owner_user_id AND (f.topup_intent_id = v_intent.id OR f.topup_intent_id IS NULL)),
    'reconciliation', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', j.id, 'status', j.status, 'attempts', j.attempts, 'last_observed_status', j.last_observed_status,
      'last_error_code', j.last_error_code, 'created_at', j.created_at, 'updated_at', j.updated_at, 'processed_at', j.processed_at
    ) ORDER BY j.created_at), '[]'::jsonb) FROM public.commerce_wallet_topup_reconciliation_jobs j WHERE j.topup_checkout_id = v_checkout.id),
    'auditTimeline', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'actor_role', a.actor_role, 'entity_type', a.entity_type, 'entity_id', a.entity_id,
      'event_type', a.event_type, 'correlation_id', a.correlation_id, 'occurred_at', a.occurred_at
    ) ORDER BY a.occurred_at), '[]'::jsonb) FROM public.commerce_audit_events a WHERE a.entity_id IN (v_intent.id, v_checkout.id) OR a.correlation_id IN (v_intent.id::text, v_checkout.id::text)),
    'generatedAt', now()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.commerce_finance_adjust_wallet(uuid, text, bigint, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_finance_open_wallet_chargeback(uuid, text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_finance_resolve_wallet_chargeback(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.commerce_get_wallet_support_detail(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.commerce_finance_adjust_wallet(uuid, text, bigint, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_finance_open_wallet_chargeback(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_finance_resolve_wallet_chargeback(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.commerce_get_wallet_support_detail(text) TO authenticated;

NOTIFY pgrst, 'reload schema';
