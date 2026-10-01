\set ON_ERROR_STOP on

INSERT INTO auth.users(id, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'owner1@example.test'),
  ('22222222-2222-4222-8222-222222222222', 'owner2@example.test'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'admin@example.test');
INSERT INTO public.profiles(id) SELECT id FROM auth.users;

INSERT INTO public.properties(id, is_active) VALUES
  ('50000000-0000-4000-8000-000000000001', true),
  ('50000000-0000-4000-8000-000000000002', true),
  ('50000000-0000-4000-8000-000000000003', true),
  ('50000000-0000-4000-8000-000000000004', true);
INSERT INTO public.user_listings(id, user_id, property_id, status, title, description, price, price_unit, listing_type, city, district, property_type_id)
VALUES
  ('60000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', NULL, 'pending', 'Listing free test', 'Free approval test', 100, 'triệu', 'mua_ban', 'Bình Dương', 'Dĩ An', '70000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', NULL, 'pending', 'Listing paid test', 'Paid approval test', 200, 'triệu', 'mua_ban', 'Bình Dương', 'Dĩ An', '70000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', NULL, 'pending', 'Listing mismatch test', 'Mismatch approval test', 300, 'triệu', 'cho_thue', 'Bình Dương', 'Dĩ An', '70000000-0000-4000-8000-000000000001'),
  ('60000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', NULL, 'pending', 'Listing retry test', 'Retry approval test', 400, 'triệu', 'mua_ban', 'Bình Dương', 'Dĩ An', '70000000-0000-4000-8000-000000000001');

INSERT INTO public.property_types(id, name, slug)
VALUES ('70000000-0000-4000-8000-000000000001', 'Nhà phố', 'nha-pho');

INSERT INTO public.commerce_fee_products(
  id, code, version, name, product_kind, amount_minor, currency,
  duration_days, terms_version, is_active, is_default
) VALUES (
  '80000000-0000-4000-8000-000000000001', 'listing-basic-25k', 1, 'Listing Basic 25K',
  'listing_basic', 25000, 'VND', 30, 'listing-basic-v1', true, false
);

INSERT INTO public.commerce_fee_product_rules(
  id, fee_product_id, listing_type, property_type_id, priority, is_active
) VALUES (
  '90000000-0000-4000-8000-000000000001',
  '80000000-0000-4000-8000-000000000001',
  'mua_ban',
  '70000000-0000-4000-8000-000000000001',
  100,
  true
);

INSERT INTO public.commerce_wallet_accounts(owner_user_id, currency, available_minor, reserved_minor)
VALUES ('11111111-1111-4111-8111-111111111111', 'VND', 100000, 0);

INSERT INTO public.commerce_packages(id, code, name, is_active)
VALUES ('30000000-0000-4000-8000-000000000001', 'pilot_base', 'Pilot Base', true);
INSERT INTO public.commerce_package_versions(
  id, package_id, version, status, currency, billing_mode, unit_amount_minor,
  tax_rate_basis_points, terms_version, benefits, valid_from
) VALUES (
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  1, 'active', 'VND', 'one_time', 100000, 0, 'pilot-v1',
  '[{"kind":"listing_quota","quantity":2},{"kind":"listing_duration","quantity":1,"durationDays":30}]'::jsonb,
  now() - interval '1 minute'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.commerce_package_versions(
      package_id, version, status, unit_amount_minor, terms_version, benefits
    ) VALUES (
      '30000000-0000-4000-8000-000000000001', 2, 'draft', 1, 'invalid-quantity',
      '[{"kind":"listing_quota","quantity":"bad"}]'::jsonb
    );
    RAISE EXCEPTION 'invalid benefit quantity unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.commerce_package_versions(
      package_id, version, status, unit_amount_minor, terms_version, benefits
    ) VALUES (
      '30000000-0000-4000-8000-000000000001', 3, 'draft', 1, 'missing-duration',
      '[{"kind":"listing_duration","quantity":1}]'::jsonb
    );
    RAISE EXCEPTION 'listing duration without durationDays unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  BEGIN
    INSERT INTO public.commerce_package_versions(
      package_id, version, status, unit_amount_minor, terms_version, benefits
    ) VALUES (
      '30000000-0000-4000-8000-000000000001', 4, 'draft', 1, 'duplicate-benefit',
      '[{"kind":"listing_quota","quantity":1},{"kind":"listing_quota","quantity":1}]'::jsonb
    );
    RAISE EXCEPTION 'duplicate benefit kinds unexpectedly succeeded';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
END
$$;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

SELECT order_id AS owner1_order_id
FROM public.commerce_create_order(
  '40000000-0000-4000-8000-000000000001', 1, 'order-owner1-00000001'
) \gset

SELECT * FROM public.commerce_create_order(
  '40000000-0000-4000-8000-000000000001', 1, 'order-owner1-00000001'
);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.commerce_orders) <> 1 THEN
    RAISE EXCEPTION 'owner1 RLS visibility failed';
  END IF;
  IF (SELECT count(*) FROM public.commerce_orders WHERE idempotency_key = 'order-owner1-00000001') <> 1 THEN
    RAISE EXCEPTION 'order idempotency failed';
  END IF;
  BEGIN
    PERFORM * FROM public.commerce_create_order(
      '40000000-0000-4000-8000-000000000001', 2, 'order-owner1-00000001'
    );
    RAISE EXCEPTION 'conflicting order idempotency unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
  BEGIN
    INSERT INTO public.commerce_orders(
      owner_user_id, subtotal_minor, total_minor, terms_version, package_snapshot, idempotency_key
    ) VALUES (
      '11111111-1111-4111-8111-111111111111', 1, 1, 'x', '{}'::jsonb, 'direct-write-denied-0001'
    );
    RAISE EXCEPTION 'direct order insert unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;

SELECT payment_attempt_id AS payment_attempt_id, attempt_expires_at AS attempt_expires_at
FROM public.commerce_start_payment_attempt(
  :'owner1_order_id'::uuid, 'payos', 'payment-owner1-000001'
) \gset

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
SELECT order_id AS owner2_order_id
FROM public.commerce_create_order(
  '40000000-0000-4000-8000-000000000001', 1, 'order-owner2-00000001'
) \gset

DO $$
BEGIN
  IF (SELECT count(*) FROM public.commerce_orders) <> 1 THEN
    RAISE EXCEPTION 'owner2 RLS visibility failed';
  END IF;
  BEGIN
    PERFORM * FROM public.commerce_start_payment_attempt(
      (SELECT id FROM public.commerce_orders WHERE idempotency_key = 'order-owner1-00000001'),
      'payos', 'payment-cross-account-01'
    );
    RAISE EXCEPTION 'cross-account payment attempt unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    NULL;
  END;
END
$$;

RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT set_config('request.jwt.claim.sub', '', false);

SELECT public.commerce_claim_payment_checkout(
  :'payment_attempt_id'::uuid, 'checkout-claim-token-0001'
) AS checkout_claimed;
SELECT public.commerce_attach_payment_checkout(
  :'payment_attempt_id'::uuid,
  'payos-link-owner1-0001',
  'https://pay.payos.vn/web/test-owner1',
  :'attempt_expires_at'::timestamptz
);

SELECT webhook_inbox_id AS webhook_inbox_id
FROM public.commerce_enqueue_verified_payment_webhook(
  'payos', 'payos-event-owner1-0001', 'payos-link-owner1-0001',
  'payment.succeeded', 100000, 'VND', repeat('a', 64), repeat('b', 64),
  '{"code":"00","reference":"payos-event-owner1-0001"}'::jsonb,
  clock_timestamp()
) \gset

DO $$
DECLARE v_duplicate boolean;
BEGIN
  SELECT duplicate INTO v_duplicate
  FROM public.commerce_enqueue_verified_payment_webhook(
    'payos', 'payos-event-owner1-0001', 'payos-link-owner1-0001',
    'payment.succeeded', 100000, 'VND', repeat('c', 64), repeat('b', 64),
    '{"code":"00","reference":"same-signed-data"}'::jsonb,
    clock_timestamp()
  );
  IF NOT v_duplicate THEN
    RAISE EXCEPTION 'signed webhook replay was not idempotent';
  END IF;
END
$$;

SELECT webhook_inbox_id AS claimed_inbox_id, processing_token AS webhook_processing_token
FROM public.commerce_claim_payment_webhooks(10)
WHERE webhook_inbox_id = :'webhook_inbox_id'::uuid \gset

SELECT * FROM public.commerce_process_payment_webhook(
  :'claimed_inbox_id'::uuid, :'webhook_processing_token'::uuid
);

RESET ROLE;
DO $$
DECLARE
  v_order_id uuid := (SELECT id FROM public.commerce_orders WHERE idempotency_key = 'order-owner1-00000001');
  v_attempt_id uuid := (SELECT id FROM public.commerce_payment_attempts WHERE idempotency_key = 'payment-owner1-000001');
BEGIN
  IF (SELECT status FROM public.commerce_orders WHERE id = v_order_id) <> 'paid' THEN
    RAISE EXCEPTION 'order was not paid';
  END IF;
  IF (SELECT status FROM public.commerce_payment_attempts WHERE id = v_attempt_id) <> 'succeeded' THEN
    RAISE EXCEPTION 'payment attempt was not settled';
  END IF;
  IF (SELECT count(*) FROM public.commerce_entitlements WHERE order_item_id IN (
    SELECT id FROM public.commerce_order_items WHERE order_id = v_order_id
  )) <> 2 THEN
    RAISE EXCEPTION 'entitlements were not granted exactly once';
  END IF;
  IF (SELECT count(*) FROM public.commerce_quota_ledger WHERE order_id = v_order_id AND operation = 'grant') <> 1 THEN
    RAISE EXCEPTION 'quota grant ledger missing';
  END IF;
END
$$;

SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT outbox_id AS outbox_id, processing_token AS outbox_processing_token
FROM public.commerce_claim_outbox(10)
WHERE topic = 'commerce.order.paid' AND aggregate_id = :'owner1_order_id'::uuid \gset

SELECT * FROM public.commerce_deliver_outbox(:'outbox_id'::uuid, :'outbox_processing_token'::uuid);

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);

DO $$
BEGIN
  IF (SELECT count(*) FROM public.commerce_notifications) <> 1 THEN
    RAISE EXCEPTION 'owner notification missing';
  END IF;
END
$$;

SELECT id AS quota_entitlement_id
FROM public.commerce_entitlements
WHERE owner_user_id = '11111111-1111-4111-8111-111111111111'
  AND benefit_kind = 'listing_quota' \gset

SELECT public.commerce_reserve_listing_quota(
  :'quota_entitlement_id'::uuid,
  '60000000-0000-4000-8000-000000000001',
  1,
  'reserve-listing-one-0001',
  now() + interval '1 hour'
) AS reservation_one_id \gset

SELECT public.commerce_reserve_listing_quota(
  :'quota_entitlement_id'::uuid,
  '60000000-0000-4000-8000-000000000002',
  1,
  'reserve-listing-two-0001',
  now() + interval '1 hour'
) AS reservation_two_id \gset

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.jwt.claim.is_admin', 'true', false);

SELECT * FROM public.approve_user_listing_with_fee_decision(
  '60000000-0000-4000-8000-000000000001',
  'free',
  'approval-free-owner1-0001',
  NULL,
  'Miễn phí hỗ trợ hồ sơ thử nghiệm'
);

SELECT * FROM public.approve_user_listing_with_fee_decision(
  '60000000-0000-4000-8000-000000000002',
  'paid',
  'approval-paid-owner1-0001',
  'listing-basic-25k',
  NULL
);

RESET ROLE;
SET ROLE service_role;
SELECT set_config('request.jwt.claim.role', 'service_role', false);
SELECT set_config('request.jwt.claim.sub', '', false);

DO $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
  PERFORM set_config('request.jwt.claim.is_admin', 'true', false);
  BEGIN
    PERFORM public.approve_user_listing_with_fee_decision(
      '60000000-0000-4000-8000-000000000003',
      'paid',
      'approval-mismatch-owner1',
      'listing-basic-25k',
      NULL
    );
    RAISE EXCEPTION 'listing type mismatch unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    NULL;
  END;

  IF (SELECT status FROM public.user_listings WHERE id = '60000000-0000-4000-8000-000000000001') <> 'approved' THEN
    RAISE EXCEPTION 'free approval did not approve listing';
  END IF;
  IF (SELECT status FROM public.user_listings WHERE id = '60000000-0000-4000-8000-000000000002') <> 'approved' THEN
    RAISE EXCEPTION 'paid approval did not approve listing';
  END IF;
  IF (SELECT count(*) FROM public.commerce_listing_approval_fee_decisions WHERE fee_mode = 'free') <> 1 THEN
    RAISE EXCEPTION 'free approval decision snapshot missing';
  END IF;
  IF (SELECT count(*) FROM public.commerce_listing_approval_fee_decisions WHERE fee_mode = 'paid') <> 1 THEN
    RAISE EXCEPTION 'paid approval decision snapshot missing';
  END IF;
  IF (SELECT available_minor FROM public.commerce_wallet_accounts WHERE owner_user_id = '11111111-1111-4111-8111-111111111111') <> 75000 THEN
    RAISE EXCEPTION 'paid approval wallet balance is wrong';
  END IF;
  IF (SELECT reserved_minor FROM public.commerce_wallet_accounts WHERE owner_user_id = '11111111-1111-4111-8111-111111111111') <> 0 THEN
    RAISE EXCEPTION 'paid approval left wallet funds reserved';
  END IF;
  IF (SELECT count(*) FROM public.commerce_wallet_receipts WHERE receipt_kind = 'listing_fee') <> 1 THEN
    RAISE EXCEPTION 'paid approval receipt missing';
  END IF;
END
$$;

RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.jwt.claim.is_admin', 'true', false);

SELECT * FROM public.approve_user_listing_with_fee_decision(
  '60000000-0000-4000-8000-000000000002',
  'paid',
  'approval-paid-owner1-0001',
  'listing-basic-25k',
  NULL
);

RESET ROLE;
SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.jwt.claim.is_admin', 'true', false);
INSERT INTO public.user_listing_lifecycle_events(listing_id, event_type, to_status)
VALUES
  ('60000000-0000-4000-8000-000000000001', 'approved', 'approved'),
  ('60000000-0000-4000-8000-000000000002', 'approved', 'approved');

DO $$
DECLARE
  v_entitlement_id uuid := (
    SELECT id FROM public.commerce_entitlements
    WHERE owner_user_id = '11111111-1111-4111-8111-111111111111'
      AND benefit_kind = 'listing_quota'
  );
BEGIN
  IF (SELECT quantity_remaining FROM public.commerce_entitlements WHERE id = v_entitlement_id) <> 0 THEN
    RAISE EXCEPTION 'quota balance after two approvals is wrong';
  END IF;
  IF (SELECT count(*) FROM public.commerce_quota_ledger WHERE entitlement_id = v_entitlement_id) <> 5 THEN
    RAISE EXCEPTION 'quota ledger mutation count is wrong';
  END IF;
END
$$;

RESET ROLE;
SELECT jsonb_build_object(
  'orders', (SELECT count(*) FROM public.commerce_orders),
  'attempts', (SELECT count(*) FROM public.commerce_payment_attempts),
  'events', (SELECT count(*) FROM public.commerce_payment_events),
  'entitlements', (SELECT count(*) FROM public.commerce_entitlements),
  'quota_ledger', (SELECT count(*) FROM public.commerce_quota_ledger),
  'notifications', (SELECT count(*) FROM public.commerce_notifications),
  'integration_pass', true
) AS commerce_integration_result;
