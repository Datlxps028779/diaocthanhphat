\set ON_ERROR_STOP on

DO $$
BEGIN
  IF (SELECT count(*) FROM public.commerce_email_deliveries WHERE status = 'pending') <> 1 THEN
    RAISE EXCEPTION 'owner notification did not enqueue email';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_email_deliveries
    WHERE recipient_email = 'owner1@example.test'
      AND template_kind = 'payment_succeeded'
      AND status = 'pending'
  ) THEN
    RAISE EXCEPTION 'queued email fields are wrong';
  END IF;
END
$$;

SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT email_delivery_id AS retry_delivery_id, processing_token AS retry_token
FROM public.commerce_claim_email_deliveries(10)
WHERE recipient_email = 'owner1@example.test' \gset
SELECT public.commerce_fail_email_delivery(
  :'retry_delivery_id'::uuid,
  :'retry_token'::uuid,
  'ETIMEDOUT',
  true,
  NULL
) AS retry_outcome \gset

RESET ROLE;
UPDATE public.commerce_email_deliveries
SET next_attempt_at = clock_timestamp()
WHERE id = :'retry_delivery_id'::uuid;

SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT email_delivery_id AS sent_delivery_id, processing_token AS sent_token
FROM public.commerce_claim_email_deliveries(10)
WHERE email_delivery_id = :'retry_delivery_id'::uuid \gset
SELECT public.commerce_complete_email_delivery(
  :'sent_delivery_id'::uuid,
  :'sent_token'::uuid,
  'smtp-message-success-1'
) AS sent_outcome \gset

RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_email_deliveries
    WHERE recipient_email = 'owner1@example.test'
      AND template_kind = 'payment_succeeded'
      AND status = 'sent'
      AND attempts = 2
      AND provider_message_id = 'smtp-message-success-1'
      AND sent_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'email retry/sent ledger is incomplete';
  END IF;
END
$$;

INSERT INTO public.commerce_outbox(
  id, topic, aggregate_type, aggregate_id, payload, status, sent_at
) VALUES (
  '75000000-0000-4000-8000-000000000001',
  'commerce.payment.failed',
  'payment_attempt',
  (SELECT id FROM public.commerce_payment_attempts WHERE idempotency_key = 'payment-owner1-000001'),
  '{"reason":"email-uncertain-fixture"}'::jsonb,
  'sent',
  clock_timestamp()
);
INSERT INTO public.commerce_notifications(
  id, owner_user_id, outbox_id, kind, title, body, action_path
) VALUES (
  '75000000-0000-4000-8000-000000000002',
  '11111111-1111-4111-8111-111111111111',
  '75000000-0000-4000-8000-000000000001',
  'payment_failed',
  'Thanh toán chưa thành công',
  'Giao dịch chưa hoàn tất. Vui lòng kiểm tra trong tài khoản.',
  '/tai-khoan?tab=commerce'
);

SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT email_delivery_id AS uncertain_delivery_id, processing_token AS uncertain_token
FROM public.commerce_claim_email_deliveries(10) \gset
SELECT public.commerce_fail_email_delivery(
  :'uncertain_delivery_id'::uuid,
  :'uncertain_token'::uuid,
  'email_sent_completion_failed',
  true,
  'smtp-message-uncertain-1'
) AS uncertain_outcome \gset

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);

DO $$
DECLARE
  v_alert_id uuid := (
    SELECT id FROM public.commerce_operations_alerts
    WHERE outbox_id = '75000000-0000-4000-8000-000000000001'
  );
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_email_deliveries
    WHERE notification_id = '75000000-0000-4000-8000-000000000002'
      AND status = 'dead_letter'
      AND provider_message_id = 'smtp-message-uncertain-1'
  ) THEN
    RAISE EXCEPTION 'uncertain SMTP provider message was not preserved';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_operations_alerts
    WHERE id = v_alert_id
      AND code = 'email_delivery_dead_letter'
      AND status = 'open'
  ) THEN
    RAISE EXCEPTION 'email dead-letter operations alert missing';
  END IF;
  IF (SELECT count(*) FROM public.commerce_get_operations_alert_email_deliveries(v_alert_id)) <> 1 THEN
    RAISE EXCEPTION 'support cannot inspect email delivery state';
  END IF;
END
$$;

SELECT jsonb_build_object(
  'retry_then_sent', true,
  'uncertain_dead_letter', true,
  'provider_message_preserved', true,
  'support_email_lookup', true,
  'email_delivery_pass', true
) AS commerce_email_delivery_result;
