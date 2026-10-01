\set ON_ERROR_STOP on

INSERT INTO auth.users(id, email) VALUES
  ('66666666-6666-4666-8666-666666666666', 'approval-hardening-owner@example.test'),
  ('77777777-7777-4777-8777-777777777777', 'approval-hardening-staff@example.test'),
  ('88888888-8888-4888-8888-888888888888', 'approval-hardening-free-owner@example.test');
INSERT INTO public.profiles(id, role) VALUES
  ('66666666-6666-4666-8666-666666666666', 'user'),
  ('77777777-7777-4777-8777-777777777777', 'staff'),
  ('88888888-8888-4888-8888-888888888888', 'user');

INSERT INTO public.commerce_wallet_accounts(owner_user_id, currency, available_minor, reserved_minor)
VALUES
  ('88888888-8888-4888-8888-888888888888', 'VND', 100000, 0),
  ('66666666-6666-4666-8666-666666666666', 'VND', 0, 0);

INSERT INTO public.commerce_fee_products(
  id, code, version, name, product_kind, amount_minor, currency,
  duration_days, terms_version, is_active, is_default
) VALUES (
  'c8000000-0000-4000-8000-000000000001', 'listing-basic-inactive', 1,
  'Inactive listing product', 'listing_basic', 25000, 'VND', 30,
  'listing-basic-inactive-v1', false, false
);
INSERT INTO public.commerce_fee_product_rules(
  id, fee_product_id, listing_type, property_type_id, priority, is_active
) VALUES (
  'c9000000-0000-4000-8000-000000000001',
  'c8000000-0000-4000-8000-000000000001',
  'mua_ban', '70000000-0000-4000-8000-000000000001', 200, true
);

SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);

INSERT INTO public.user_listings(
  id, user_id, status, title, description, listing_type, property_type_id
) VALUES (
  'c6000000-0000-4000-8000-000000000001',
  '88888888-8888-4888-8888-888888888888', 'pending',
  'Hardening free release', 'Free release test', 'mua_ban',
  '70000000-0000-4000-8000-000000000001'
);
SELECT public.commerce_reserve_listing_fee(
  'c6000000-0000-4000-8000-000000000001',
  'listing-basic-25k',
  'approval-hardening-release-001'
);

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.jwt.claim.is_admin', 'true', false);
SELECT * FROM public.approve_user_listing_with_fee_decision(
  'c6000000-0000-4000-8000-000000000001',
  'free',
  'approval-hardening-free-001',
  NULL,
  'Hỗ trợ hồ sơ hardening'
);

DO $$
BEGIN
  IF (SELECT status FROM public.user_listings WHERE id = 'c6000000-0000-4000-8000-000000000001') <> 'approved' THEN
    RAISE EXCEPTION 'free release approval did not approve listing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_fee_reservations
    WHERE user_listing_id = 'c6000000-0000-4000-8000-000000000001'
      AND status = 'released'
  ) THEN
    RAISE EXCEPTION 'free approval did not release old reservation';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commerce_wallet_fee_reservations
    WHERE user_listing_id = 'c6000000-0000-4000-8000-000000000001'
      AND status = 'reserved'
  ) THEN
    RAISE EXCEPTION 'free approval left a reservation';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_accounts
    WHERE owner_user_id = '88888888-8888-4888-8888-888888888888'
      AND available_minor = 100000 AND reserved_minor = 0
  ) THEN
    RAISE EXCEPTION 'free approval changed wallet balance';
  END IF;
END
$$;

INSERT INTO public.user_listings(
  id, user_id, status, title, description, listing_type, property_type_id
) VALUES (
  'c6000000-0000-4000-8000-000000000002',
  '88888888-8888-4888-8888-888888888888', 'pending',
  'Hardening validation', 'Validation test', 'mua_ban',
  '70000000-0000-4000-8000-000000000001'
);

DO $$
BEGIN
  BEGIN
    PERFORM public.approve_user_listing_with_fee_decision(
      'c6000000-0000-4000-8000-000000000002', 'free',
      'approval-hardening-missing-reason', NULL, NULL
    );
    RAISE EXCEPTION 'free approval without reason unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
  BEGIN
    PERFORM public.approve_user_listing_with_fee_decision(
      'c6000000-0000-4000-8000-000000000002', 'paid',
      'approval-hardening-missing-product', NULL, NULL
    );
    RAISE EXCEPTION 'paid approval without product unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
  BEGIN
    PERFORM public.approve_user_listing_with_fee_decision(
      'c6000000-0000-4000-8000-000000000002', 'paid',
      'approval-hardening-inactive-product', 'listing-basic-inactive', NULL
    );
    RAISE EXCEPTION 'inactive product unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0002' THEN
    NULL;
  END;
  IF (SELECT status FROM public.user_listings WHERE id = 'c6000000-0000-4000-8000-000000000002') <> 'pending' THEN
    RAISE EXCEPTION 'validation failure mutated listing';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commerce_listing_approval_fee_decisions
    WHERE user_listing_id = 'c6000000-0000-4000-8000-000000000002'
  ) THEN
    RAISE EXCEPTION 'validation failure created decision';
  END IF;
END
$$;

INSERT INTO public.user_listings(
  id, user_id, status, title, description, listing_type, property_type_id
) VALUES (
  'c6000000-0000-4000-8000-000000000003',
  '66666666-6666-4666-8666-666666666666', 'pending',
  'Hardening insufficient balance', 'Balance test', 'mua_ban',
  '70000000-0000-4000-8000-000000000001'
);

DO $$
BEGIN
  BEGIN
    PERFORM public.approve_user_listing_with_fee_decision(
      'c6000000-0000-4000-8000-000000000003', 'paid',
      'approval-hardening-insufficient', 'listing-basic-25k', NULL
    );
    RAISE EXCEPTION 'insufficient balance approval unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE 'P0001' THEN
    NULL;
  END;
  IF (SELECT status FROM public.user_listings WHERE id = 'c6000000-0000-4000-8000-000000000003') <> 'pending' THEN
    RAISE EXCEPTION 'insufficient balance mutated listing status';
  END IF;
  IF (SELECT property_id FROM public.user_listings WHERE id = 'c6000000-0000-4000-8000-000000000003') IS NOT NULL THEN
    RAISE EXCEPTION 'insufficient balance created property';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.commerce_wallet_fee_reservations
    WHERE user_listing_id = 'c6000000-0000-4000-8000-000000000003'
  ) THEN
    RAISE EXCEPTION 'insufficient balance created reservation';
  END IF;
END
$$;

INSERT INTO public.user_listings(
  id, user_id, status, title, description, listing_type, property_type_id
) VALUES (
  'c6000000-0000-4000-8000-000000000004',
  '88888888-8888-4888-8888-888888888888', 'pending',
  'Hardening idempotency', 'Idempotency test', 'mua_ban',
  '70000000-0000-4000-8000-000000000001'
);
SELECT * FROM public.approve_user_listing_with_fee_decision(
  'c6000000-0000-4000-8000-000000000004',
  'free', 'approval-hardening-same-key', NULL, 'Idempotency free decision'
);
DO $$
BEGIN
  BEGIN
    PERFORM public.approve_user_listing_with_fee_decision(
      'c6000000-0000-4000-8000-000000000004', 'paid',
      'approval-hardening-same-key', 'listing-basic-25k', NULL
    );
    RAISE EXCEPTION 'idempotency key input change unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '22023' THEN
    NULL;
  END;
  IF (SELECT count(*) FROM public.commerce_listing_approval_fee_decisions
      WHERE user_listing_id = 'c6000000-0000-4000-8000-000000000004') <> 1 THEN
    RAISE EXCEPTION 'idempotency input change created another decision';
  END IF;
END
$$;

INSERT INTO public.user_listings(
  id, user_id, status, title, description, listing_type, property_type_id
) VALUES (
  'c6000000-0000-4000-8000-000000000005',
  '88888888-8888-4888-8888-888888888888', 'pending',
  'Hardening staff scope', 'Staff scope test', 'mua_ban',
  '70000000-0000-4000-8000-000000000001'
);
SELECT set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.approve_user_listing_with_fee_decision(
      'c6000000-0000-4000-8000-000000000005', 'free',
      'approval-hardening-staff-scope', NULL, 'Staff scope test'
    );
    RAISE EXCEPTION 'out-of-scope staff approval unexpectedly succeeded';
  EXCEPTION WHEN SQLSTATE '42501' THEN
    NULL;
  END;
END
$$;

SET ROLE anon;
SELECT set_config('request.jwt.claim.role', 'anon', false);
DO $$
BEGIN
  BEGIN
    PERFORM public.approve_user_listing_with_fee_decision(
      'c6000000-0000-4000-8000-000000000005', 'free',
      'approval-hardening-anon', NULL, 'Anon test'
    );
    RAISE EXCEPTION 'anon approval unexpectedly succeeded';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$$;
RESET ROLE;

SELECT jsonb_build_object(
  'free_release', true,
  'validation_fail_closed', true,
  'inactive_product_rejected', true,
  'insufficient_balance_fail_closed', true,
  'idempotency_input_conflict_rejected', true,
  'staff_scope_denied', true,
  'anon_denied', true,
  'listing_approval_hardening_pass', true
) AS commerce_listing_approval_hardening_result;
