\set ON_ERROR_STOP on

SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);

DO $$
DECLARE
  v_snapshot jsonb := public.commerce_get_my_account_snapshot();
BEGIN
  IF jsonb_array_length(v_snapshot->'orders') <> 1 THEN
    RAISE EXCEPTION 'owner order snapshot is not isolated';
  END IF;
  IF jsonb_array_length(v_snapshot->'payments') <> 1 THEN
    RAISE EXCEPTION 'owner payment snapshot is incomplete';
  END IF;
  IF jsonb_array_length(v_snapshot->'entitlements') <> 2 THEN
    RAISE EXCEPTION 'owner entitlement snapshot is incomplete';
  END IF;
  IF jsonb_array_length(v_snapshot->'notifications') <> 1 OR (v_snapshot->>'unreadNotifications')::integer <> 1 THEN
    RAISE EXCEPTION 'owner notification snapshot is incomplete';
  END IF;
  IF v_snapshot::text LIKE '%provider_metadata%' OR v_snapshot::text LIKE '%payload_hash%' THEN
    RAISE EXCEPTION 'owner snapshot leaked internal payment data';
  END IF;
END
$$;

SELECT public.commerce_mark_notification_read(
  (SELECT id FROM public.commerce_notifications WHERE owner_user_id = '11111111-1111-4111-8111-111111111111' LIMIT 1)
);

DO $$
BEGIN
  IF (public.commerce_get_my_account_snapshot()->>'unreadNotifications')::integer <> 0 THEN
    RAISE EXCEPTION 'notification was not marked read';
  END IF;
END
$$;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
DO $$
DECLARE
  v_notification_id uuid := (
    SELECT id FROM public.commerce_notifications
    WHERE owner_user_id = '11111111-1111-4111-8111-111111111111'
    LIMIT 1
  );
BEGIN
  BEGIN
    PERFORM public.commerce_mark_notification_read(v_notification_id);
    RAISE EXCEPTION 'cross-owner notification update unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    NULL;
  END;
  IF jsonb_array_length(public.commerce_get_my_account_snapshot()->'orders') <> 1 THEN
    RAISE EXCEPTION 'second owner snapshot is not isolated';
  END IF;
END
$$;

INSERT INTO auth.users(id, email)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'commerce-support@example.test');
INSERT INTO public.profiles(id, role)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'staff');

INSERT INTO public.commerce_outbox(
  id, topic, aggregate_type, aggregate_id, payload, status, sent_at
) VALUES (
  '74000000-0000-4000-8000-000000000001',
  'commerce.payment.duplicate_settlement',
  'payment_attempt',
  (SELECT id FROM public.commerce_payment_attempts WHERE idempotency_key = 'payment-owner1-000001'),
  '{"orderId":"owner-order","reason":"duplicate_settlement"}'::jsonb,
  'sent',
  clock_timestamp()
);
INSERT INTO public.commerce_operations_alerts(
  id, outbox_id, payment_attempt_id, severity, code, status, payload
) VALUES (
  '74000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000001',
  (SELECT id FROM public.commerce_payment_attempts WHERE idempotency_key = 'payment-owner1-000001'),
  'critical', 'duplicate_settlement', 'open',
  '{"orderId":"owner-order","reason":"duplicate_settlement"}'::jsonb
);

SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);
DO $$
BEGIN
  BEGIN
    PERFORM * FROM public.commerce_get_operations_alerts(NULL, 50);
    RAISE EXCEPTION 'staff without permission unexpectedly read operations alerts';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

INSERT INTO public.staff_permission_assignments(
  staff_user_id, module, action, scope_kind, scope_id, granted_by
) VALUES
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'commerce-operations', 'view', 'global', NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'commerce-operations', 'edit', 'global', NULL, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

DO $$
BEGIN
  IF (SELECT count(*) FROM public.commerce_get_operations_alerts('open', 50)) <> 1 THEN
    RAISE EXCEPTION 'authorized support cannot read open alert';
  END IF;
END
$$;

DO $$
DECLARE
  v_detail jsonb := public.commerce_get_operations_alert_detail('74000000-0000-4000-8000-000000000002');
BEGIN
  IF public.commerce_get_operations_alert_count() <> 1 THEN
    RAISE EXCEPTION 'unresolved operations badge count is wrong';
  END IF;
  IF v_detail->'alert'->>'id' <> '74000000-0000-4000-8000-000000000002' THEN
    RAISE EXCEPTION 'support detail alert identity is wrong';
  END IF;
  IF v_detail->'paymentAttempt'->>'id' IS NULL OR v_detail->'order'->>'id' IS NULL THEN
    RAISE EXCEPTION 'support payment/order chain is incomplete';
  END IF;
  IF jsonb_array_length(v_detail->'paymentEvents') <> 1
     OR jsonb_array_length(v_detail->'entitlements') <> 2
     OR jsonb_array_length(v_detail->'quotaReservations') <> 2
     OR jsonb_array_length(v_detail->'listings') <> 2
     OR jsonb_array_length(v_detail->'properties') <> 2
     OR jsonb_array_length(v_detail->'notifications') <> 1 THEN
    RAISE EXCEPTION 'support lookup chain is incomplete';
  END IF;
  IF v_detail::text LIKE '%provider_metadata%'
     OR v_detail::text LIKE '%payload_hash%'
     OR v_detail::text LIKE '%signed_data_hash%'
     OR v_detail::text LIKE '%provider_lookup_hash%' THEN
    RAISE EXCEPTION 'support detail leaked internal provider data';
  END IF;
END
$$;

SELECT public.commerce_update_operations_alert_status(
  '74000000-0000-4000-8000-000000000002',
  'acknowledged'
);
SELECT public.commerce_update_operations_alert_status(
  '74000000-0000-4000-8000-000000000002',
  'resolved'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_operations_alerts
    WHERE id = '74000000-0000-4000-8000-000000000002'
      AND status = 'resolved'
      AND acknowledged_at IS NOT NULL
      AND resolved_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'support alert status transition failed';
  END IF;
  IF (SELECT count(*) FROM public.commerce_audit_events WHERE entity_id = '74000000-0000-4000-8000-000000000002' AND event_type = 'commerce_operations_alert_status_changed') <> 2 THEN
    RAISE EXCEPTION 'support alert audit is incomplete';
  END IF;
  IF public.commerce_get_operations_alert_count() <> 0 THEN
    RAISE EXCEPTION 'resolved alert remained in badge count';
  END IF;
END
$$;

SELECT jsonb_build_object(
  'owner_snapshot', true,
  'notification_read', true,
  'support_permission', true,
  'operations_audit', true,
  'account_read_model_pass', true
) AS commerce_account_read_model_result;
