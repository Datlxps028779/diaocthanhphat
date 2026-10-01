\set ON_ERROR_STOP on

INSERT INTO auth.users(id, email)
VALUES ('33333333-3333-4333-8333-333333333333', 'lifecycle-owner@example.test');
INSERT INTO public.profiles(id)
VALUES ('33333333-3333-4333-8333-333333333333');

INSERT INTO public.commerce_orders(
  id, owner_user_id, status, currency, subtotal_minor, tax_minor, total_minor,
  terms_version, package_snapshot, idempotency_key, paid_at
) VALUES (
  '73000000-0000-4000-8000-000000000001',
  '33333333-3333-4333-8333-333333333333',
  'paid', 'VND', 100000, 0, 100000,
  'pilot-v1', '{}'::jsonb, 'lifecycle-fixture-order-001', clock_timestamp()
);
INSERT INTO public.commerce_order_items(
  id, order_id, package_version_id, quantity, unit_amount_minor,
  total_amount_minor, benefit_snapshot
) VALUES (
  '73000000-0000-4000-8000-000000000002',
  '73000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  1, 100000, 100000,
  '[{"kind":"listing_quota","quantity":1},{"kind":"listing_duration","quantity":1,"durationDays":30}]'::jsonb
);
INSERT INTO public.commerce_entitlements(
  id, owner_user_id, order_item_id, package_version_id, benefit_kind,
  status, quantity_total, quantity_remaining, starts_at, activated_at
) VALUES (
  '73000000-0000-4000-8000-000000000003',
  '33333333-3333-4333-8333-333333333333',
  '73000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',
  'listing_quota', 'active', 1, 1, clock_timestamp(), clock_timestamp()
);
INSERT INTO public.commerce_entitlements(
  id, owner_user_id, order_item_id, package_version_id, benefit_kind,
  status, quantity_total, quantity_remaining, duration_days
) VALUES (
  '73000000-0000-4000-8000-000000000004',
  '33333333-3333-4333-8333-333333333333',
  '73000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000001',
  'listing_duration', 'awaiting_listing_approval', 1, 1, 30
);
INSERT INTO public.commerce_quota_ledger(
  entitlement_id, owner_user_id, order_id, operation, delta,
  balance_after, idempotency_key
) VALUES (
  '73000000-0000-4000-8000-000000000003',
  '33333333-3333-4333-8333-333333333333',
  '73000000-0000-4000-8000-000000000001',
  'grant', 1, 1, 'lifecycle-fixture-grant-001'
);

INSERT INTO public.properties(id, is_active) VALUES
  ('50000000-0000-4000-8000-000000000005', true),
  ('50000000-0000-4000-8000-000000000006', true),
  ('50000000-0000-4000-8000-000000000007', true);

SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);

INSERT INTO public.user_listings(id, user_id, property_id, status)
VALUES (
  '60000000-0000-4000-8000-000000000005',
  '33333333-3333-4333-8333-333333333333',
  NULL,
  'pending'
);

DO $$
BEGIN
  BEGIN
    INSERT INTO public.user_listings(id, user_id, property_id, status)
    VALUES (
      '60000000-0000-4000-8000-000000000006',
      '33333333-3333-4333-8333-333333333333',
      '50000000-0000-4000-8000-000000000006',
      'pending'
    );
    RAISE EXCEPTION 'enrolled owner submitted without quota';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    NULL;
  END;
  IF EXISTS (SELECT 1 FROM public.user_listings WHERE id = '60000000-0000-4000-8000-000000000006') THEN
    RAISE EXCEPTION 'failed enrolled submission was not rolled back';
  END IF;
END
$$;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
INSERT INTO public.user_listings(id, user_id, property_id, status)
VALUES (
  '60000000-0000-4000-8000-000000000007',
  '22222222-2222-4222-8222-222222222222',
  '50000000-0000-4000-8000-000000000007',
  'pending'
);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.user_listings WHERE id = '60000000-0000-4000-8000-000000000007') THEN
    RAISE EXCEPTION 'free owner submission was blocked';
  END IF;
  IF EXISTS (SELECT 1 FROM public.commerce_quota_reservations WHERE user_listing_id = '60000000-0000-4000-8000-000000000007') THEN
    RAISE EXCEPTION 'free owner unexpectedly received a quota reservation';
  END IF;
END
$$;
DELETE FROM public.user_listings WHERE id = '60000000-0000-4000-8000-000000000007';
SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);

DO $$
BEGIN
  IF (SELECT quantity_remaining FROM public.commerce_entitlements WHERE owner_user_id = '33333333-3333-4333-8333-333333333333' AND benefit_kind = 'listing_quota') <> 0 THEN
    RAISE EXCEPTION 'submit did not reserve quota';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_quota_reservations
    WHERE user_listing_id = '60000000-0000-4000-8000-000000000005'
      AND submission_cycle = 1
      AND status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'first submission cycle reservation missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_entitlements
    WHERE user_listing_id = '60000000-0000-4000-8000-000000000005'
      AND benefit_kind = 'listing_duration'
      AND status = 'awaiting_listing_approval'
  ) THEN
    RAISE EXCEPTION 'listing duration was not bound at submit';
  END IF;
END
$$;

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.jwt.claim.is_admin', 'true', false);
SELECT * FROM public.approve_user_listing_with_fee_decision(
  '60000000-0000-4000-8000-000000000005',
  'free',
  'listing-lifecycle-free-approval-001',
  NULL,
  'Listing lifecycle quota test'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_quota_reservations
    WHERE user_listing_id = '60000000-0000-4000-8000-000000000005'
      AND submission_cycle = 1
      AND status = 'consumed'
  ) THEN
    RAISE EXCEPTION 'approval did not consume quota';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_effective_entitlements
    WHERE user_listing_id = '60000000-0000-4000-8000-000000000005'
      AND property_id = (
        SELECT property_id FROM public.user_listings
        WHERE id = '60000000-0000-4000-8000-000000000005'
      )
      AND benefit_kind = 'listing_duration'
  ) THEN
    RAISE EXCEPTION 'listing duration was not activated at approval';
  END IF;
END
$$;

SELECT set_config('request.jwt.claim.sub', '', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);
UPDATE public.user_listings
SET status = 'expired'
WHERE id = '60000000-0000-4000-8000-000000000005';

DO $$
BEGIN
  IF (SELECT quantity_remaining FROM public.commerce_entitlements WHERE owner_user_id = '33333333-3333-4333-8333-333333333333' AND benefit_kind = 'listing_quota') <> 1 THEN
    RAISE EXCEPTION 'expiry did not return quota';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commerce_effective_entitlements
    WHERE user_listing_id = '60000000-0000-4000-8000-000000000005'
  ) THEN
    RAISE EXCEPTION 'expired listing still has effective entitlement';
  END IF;
END
$$;

SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
UPDATE public.user_listings
SET status = 'pending'
WHERE id = '60000000-0000-4000-8000-000000000005';

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.jwt.claim.is_admin', 'true', false);
UPDATE public.user_listings
SET status = 'rejected'
WHERE id = '60000000-0000-4000-8000-000000000005';

SELECT set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);
UPDATE public.user_listings
SET status = 'pending'
WHERE id = '60000000-0000-4000-8000-000000000005';
DELETE FROM public.user_listings
WHERE id = '60000000-0000-4000-8000-000000000005';

DO $$
BEGIN
  IF (SELECT quantity_remaining FROM public.commerce_entitlements WHERE owner_user_id = '33333333-3333-4333-8333-333333333333' AND benefit_kind = 'listing_quota') <> 1 THEN
    RAISE EXCEPTION 'delete did not return quota';
  END IF;
  IF (SELECT count(*) FROM public.commerce_quota_reservations WHERE idempotency_key LIKE 'listing-cycle:60000000-0000-4000-8000-000000000005:%') <> 3 THEN
    RAISE EXCEPTION 'submission cycle history is incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_quota_reservations
    WHERE idempotency_key LIKE 'listing-cycle:60000000-0000-4000-8000-000000000005:1:%'
      AND status = 'expired'
  ) THEN
    RAISE EXCEPTION 'first cycle was not expired';
  END IF;
  IF (SELECT count(*) FROM public.commerce_quota_reservations WHERE idempotency_key LIKE 'listing-cycle:60000000-0000-4000-8000-000000000005:%' AND status = 'released') <> 2 THEN
    RAISE EXCEPTION 'reject/delete cycles were not released';
  END IF;
END
$$;

SELECT jsonb_build_object(
  'cycles', (SELECT count(*) FROM public.commerce_quota_reservations WHERE idempotency_key LIKE 'listing-cycle:60000000-0000-4000-8000-000000000005:%'),
  'remaining', (SELECT quantity_remaining FROM public.commerce_entitlements WHERE owner_user_id = '33333333-3333-4333-8333-333333333333' AND benefit_kind = 'listing_quota'),
  'listing_lifecycle_pass', true
) AS commerce_listing_lifecycle_result;
