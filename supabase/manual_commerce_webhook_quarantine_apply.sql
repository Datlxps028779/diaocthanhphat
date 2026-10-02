-- User-run mutation: quarantine exactly the approved stale PayOS sample webhook.
-- The migration must already be applied and the dry-run must return preflight_pass=true.

BEGIN;

-- Supabase SQL Editor has no request JWT; scope the trusted admin session as service_role.
SELECT set_config('request.jwt.claim.role', 'service_role', true);

DO $$
DECLARE
  v_result record;
BEGIN
  SELECT *
  INTO v_result
  FROM public.commerce_quarantine_orphan_test_webhook(
    '2a4eab5c-21e4-44e3-8f15-e4e1fdfbf7c9'::uuid
  );

  IF NOT FOUND OR v_result.status <> 'quarantined' THEN
    RAISE EXCEPTION 'Quarantine did not return the expected terminal status.';
  END IF;

  RAISE NOTICE 'Quarantined webhook %, audit event %.',
    v_result.webhook_inbox_id,
    v_result.audit_event_id;
END;
$$;

COMMIT;
