-- User-run SELECT-only preflight for the approved orphan PayOS sample webhook.
-- Do not run the quarantine RPC from this script.

WITH candidates AS (
  SELECT
    i.id AS webhook_inbox_id,
    i.provider,
    i.provider_event_id,
    i.status,
    i.attempts,
    i.last_error_code,
    i.verification_method AS inbox_verification_method,
    i.processed_at,
    i.next_attempt_at,
    e.provider_payment_id,
    e.event_type,
    e.signature_valid,
    e.verification_method AS event_verification_method,
    e.amount_minor,
    e.currency,
    e.occurred_at,
    e.payment_attempt_id,
    e.order_id,
    COALESCE(e.payload->>'orderCode', e.payload->'data'->>'orderCode') AS provider_order_code,
    (
      i.provider = 'payos'
      AND i.provider_event_id = 'TF230204212323'
      AND i.status = 'dead_letter'
      AND i.attempts = 8
      AND i.last_error_code = 'P0002'
      AND i.processing_token IS NULL
      AND i.next_attempt_at IS NULL
      AND i.processed_at IS NULL
      AND i.verification_method = 'webhook_signature'
      AND e.provider = 'payos'
      AND e.provider_event_id = 'TF230204212323'
      AND e.event_type = 'payment.succeeded'
      AND e.signature_valid
      AND e.verification_method = 'webhook_signature'
      AND e.amount_minor = 3000
      AND e.currency = 'VND'
      AND e.occurred_at >= TIMESTAMPTZ '2023-02-04 00:00:00+00'
      AND e.occurred_at < TIMESTAMPTZ '2023-02-05 00:00:00+00'
      AND COALESCE(e.payload->>'orderCode', e.payload->'data'->>'orderCode') = '123'
      AND e.payment_attempt_id IS NULL
      AND e.order_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.commerce_payment_attempts a
        WHERE a.provider = e.provider
          AND a.provider_payment_id = e.provider_payment_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.commerce_wallet_topup_checkouts c
        WHERE c.provider = e.provider
          AND (c.provider_payment_id = e.provider_payment_id OR c.provider_order_code = 123)
      )
    ) AS all_guards
  FROM public.commerce_webhook_inbox i
  JOIN public.commerce_payment_events e
    ON e.provider = i.provider
   AND e.provider_event_id = i.provider_event_id
  WHERE i.id = '2a4eab5c-21e4-44e3-8f15-e4e1fdfbf7c9'::uuid
)
SELECT jsonb_build_object(
  'candidate_count', count(*),
  'preflight_pass', count(*) = 1 AND COALESCE(bool_and(all_guards), false),
  'candidates', COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'webhook_inbox_id', webhook_inbox_id,
        'provider', provider,
        'provider_event_id', provider_event_id,
        'status', status,
        'attempts', attempts,
        'last_error_code', last_error_code,
        'inbox_verification_method', inbox_verification_method,
        'processed_at', processed_at,
        'next_attempt_at', next_attempt_at,
        'provider_payment_id', provider_payment_id,
        'event_type', event_type,
        'signature_valid', signature_valid,
        'event_verification_method', event_verification_method,
        'amount_minor', amount_minor,
        'currency', currency,
        'occurred_at', occurred_at,
        'provider_order_code', provider_order_code,
        'payment_attempt_id', payment_attempt_id,
        'order_id', order_id,
        'all_guards', all_guards
      )
    ),
    '[]'::jsonb
  )
) AS commerce_webhook_quarantine_dry_run
FROM candidates;
