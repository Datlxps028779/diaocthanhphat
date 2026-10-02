-- User-run SELECT-only verification after applying the quarantine RPC.

WITH target AS (
  SELECT i.*, e.id AS payment_event_id, e.provider_payment_id,
         e.payment_attempt_id, e.order_id AS event_order_id,
         e.payload, e.occurred_at
  FROM public.commerce_webhook_inbox i
  LEFT JOIN public.commerce_payment_events e
    ON e.provider = i.provider
   AND e.provider_event_id = i.provider_event_id
  WHERE i.id = '2a4eab5c-21e4-44e3-8f15-e4e1fdfbf7c9'::uuid
),
function_security AS (
  SELECT
    count(*) = 1 AS function_present,
    COALESCE(bool_and(p.prosecdef), false) AS security_definer,
    COALESCE(bool_and(p.proconfig @> ARRAY['search_path=public, pg_temp']::text[]), false) AS fixed_search_path,
    COALESCE(bool_and(has_function_privilege('service_role', p.oid, 'EXECUTE')), false) AS service_role_execute,
    COALESCE(bool_and(NOT has_function_privilege('anon', p.oid, 'EXECUTE')), false) AS anon_denied,
    COALESCE(bool_and(NOT has_function_privilege('authenticated', p.oid, 'EXECUTE')), false) AS authenticated_denied
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'commerce_quarantine_orphan_test_webhook'
    AND p.pronargs = 1
    AND p.proargtypes[0] = 'uuid'::regtype
),
status_constraint AS (
  SELECT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class r ON r.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = r.relnamespace
    WHERE n.nspname = 'public'
      AND r.relname = 'commerce_webhook_inbox'
      AND c.contype = 'c'
      AND pg_get_constraintdef(c.oid) LIKE '%quarantined%'
  ) AS quarantined_status_allowed
),
queue_state AS (
  SELECT
    count(*) FILTER (WHERE status = 'dead_letter') AS dead_letter_count,
    count(*) FILTER (WHERE status IN ('pending', 'retry', 'processing')) AS claimable_count
  FROM public.commerce_webhook_inbox
),
audits AS (
  SELECT
    count(*) AS total_audit_count,
    count(*) FILTER (WHERE event_type = 'payment_webhook_quarantined') AS quarantine_audit_count,
    count(*) FILTER (
      WHERE event_type = 'payment_webhook_quarantined'
        AND metadata->>'reason' = 'orphan_test_webhook'
        AND metadata->>'no_financial_mutation' = 'true'
    ) AS matching_audit_count
  FROM public.commerce_audit_events
  WHERE entity_type = 'webhook_inbox'
    AND entity_id = '2a4eab5c-21e4-44e3-8f15-e4e1fdfbf7c9'::uuid
),
financial_links AS (
  SELECT
    (SELECT count(*) FROM public.commerce_payment_attempts a
     WHERE a.provider = 'payos'
       AND a.provider_payment_id = t.provider_payment_id) AS payment_attempt_count,
    (SELECT count(*) FROM public.commerce_orders o
     WHERE o.id = t.event_order_id) AS order_count,
    (SELECT count(*) FROM public.commerce_wallet_topup_checkouts c
     WHERE c.provider = 'payos'
       AND (c.provider_payment_id = t.provider_payment_id OR c.provider_order_code = 123)) AS wallet_checkout_count
  FROM target t
)
SELECT jsonb_build_object(
  'target_present', EXISTS (SELECT 1 FROM target),
  'target_status', (SELECT status FROM target),
  'target_processed_at', (SELECT processed_at FROM target),
  'target_last_error_code', (SELECT last_error_code FROM target),
  'quarantined_status_allowed', (SELECT quarantined_status_allowed FROM status_constraint),
  'function_security', (SELECT to_jsonb(function_security) FROM function_security),
  'dead_letter_count', (SELECT dead_letter_count FROM queue_state),
  'target_claimable_count', (SELECT count(*) FROM target
    WHERE status IN ('pending', 'retry', 'processing')),
  'quarantine_audit_count', (SELECT quarantine_audit_count FROM audits),
  'total_audit_count_for_target', (SELECT total_audit_count FROM audits),
  'matching_audit_count', (SELECT matching_audit_count FROM audits),
  'financial_links', (SELECT to_jsonb(financial_links) FROM financial_links),
  'verify_pass',
    (SELECT status = 'quarantined' AND processed_at IS NULL AND last_error_code = 'P0002' FROM target)
    AND (SELECT quarantined_status_allowed FROM status_constraint)
    AND (SELECT function_present AND security_definer AND fixed_search_path
                AND service_role_execute AND anon_denied AND authenticated_denied FROM function_security)
    AND (SELECT dead_letter_count = 0 FROM queue_state)
    AND (SELECT quarantine_audit_count = 1 AND matching_audit_count = 1 FROM audits)
    AND (SELECT payment_attempt_count = 0 AND order_count = 0 AND wallet_checkout_count = 0 FROM financial_links)
) AS commerce_webhook_quarantine_verify;
