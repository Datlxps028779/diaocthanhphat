\set ON_ERROR_STOP on

INSERT INTO public.commerce_wallet_accounts(owner_user_id, currency, available_minor, reserved_minor)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'VND', 100000, 0),
  ('22222222-2222-4222-8222-222222222222', 'VND', 100000, 0)
ON CONFLICT (owner_user_id) DO NOTHING;

UPDATE public.commerce_entitlements
SET quantity_remaining = 1, status = 'active'
WHERE owner_user_id = '11111111-1111-4111-8111-111111111111'
  AND benefit_kind = 'listing_quota';

SELECT set_config('request.jwt.claim.role', 'authenticated', false);
SELECT set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);

INSERT INTO public.user_listings(
  id, user_id, property_id, status, title, description, listing_type, property_type_id
) VALUES (
  'b2000000-0000-4000-8000-000000000008',
  '11111111-1111-4111-8111-111111111111',
  NULL, 'pending', 'Wallet paid lifecycle', 'Paid lifecycle test', 'mua_ban',
  '70000000-0000-4000-8000-000000000001'
);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.commerce_wallet_fee_reservations
    WHERE user_listing_id = 'b2000000-0000-4000-8000-000000000008'
  ) THEN
    RAISE EXCEPTION 'pending listing unexpectedly reserved wallet fee';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_accounts
    WHERE owner_user_id = '11111111-1111-4111-8111-111111111111'
      AND available_minor = 175000 AND reserved_minor = 0
  ) THEN
    RAISE EXCEPTION 'pending listing changed wallet balance';
  END IF;
END
$$;

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.jwt.claim.is_admin', 'true', false);
SELECT * FROM public.approve_user_listing_with_fee_decision(
  'b2000000-0000-4000-8000-000000000008',
  'paid',
  'wallet-fee-paid-lifecycle-001',
  'listing-basic-25k',
  NULL
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_fee_reservations
    WHERE user_listing_id = 'b2000000-0000-4000-8000-000000000008'
      AND status = 'captured'
      AND starts_at IS NOT NULL
      AND ends_at > starts_at
  ) THEN
    RAISE EXCEPTION 'approved listing did not capture wallet fee';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_accounts
    WHERE owner_user_id = '11111111-1111-4111-8111-111111111111'
      AND available_minor = 150000 AND reserved_minor = 0
  ) THEN
    RAISE EXCEPTION 'captured wallet balance is wrong';
  END IF;
END
$$;

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);
INSERT INTO public.user_listings(id, user_id, property_id, status, title, listing_type)
VALUES (
  'b2000000-0000-4000-8000-000000000009',
  '22222222-2222-4222-8222-222222222222',
  NULL, 'pending', 'Wallet reject lifecycle', 'mua_ban'
);
SELECT public.commerce_reserve_listing_fee(
  'b2000000-0000-4000-8000-000000000009',
  'listing-basic-25k',
  'wallet-fee-reject-reserve-001'
);

SELECT set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
SELECT set_config('request.jwt.claim.is_admin', 'true', false);
UPDATE public.user_listings
SET status = 'rejected'
WHERE id = 'b2000000-0000-4000-8000-000000000009';

SELECT set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', false);
SELECT set_config('request.jwt.claim.is_admin', 'false', false);
INSERT INTO public.user_listings(id, user_id, property_id, status, title, listing_type)
VALUES (
  'b2000000-0000-4000-8000-000000000010',
  '22222222-2222-4222-8222-222222222222',
  NULL, 'pending', 'Wallet delete lifecycle', 'mua_ban'
);
SELECT public.commerce_reserve_listing_fee(
  'b2000000-0000-4000-8000-000000000010',
  'listing-basic-25k',
  'wallet-fee-delete-reserve-001'
);
DELETE FROM public.user_listings
WHERE id = 'b2000000-0000-4000-8000-000000000010';

RESET ROLE;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.commerce_wallet_accounts
    WHERE owner_user_id = '22222222-2222-4222-8222-222222222222'
      AND available_minor = 100000 AND reserved_minor = 0
  ) THEN
    RAISE EXCEPTION 'reject/delete releases left wallet balance wrong';
  END IF;
  IF (SELECT count(*) FROM public.commerce_wallet_fee_reservations
      WHERE owner_user_id = '11111111-1111-4111-8111-111111111111'
        AND user_listing_id = 'b2000000-0000-4000-8000-000000000008'
        AND status = 'captured') <> 1 THEN
    RAISE EXCEPTION 'captured fee count is wrong';
  END IF;
  IF (SELECT count(*) FROM public.commerce_wallet_fee_reservations
      WHERE owner_user_id = '22222222-2222-4222-8222-222222222222' AND status = 'released') <> 2 THEN
    RAISE EXCEPTION 'reject/delete releases are incomplete';
  END IF;
  IF (SELECT count(*)
      FROM public.commerce_wallet_receipts r
      JOIN public.commerce_wallet_fee_reservations fr ON fr.id = r.fee_reservation_id
      WHERE r.receipt_kind = 'listing_fee'
        AND fr.user_listing_id = 'b2000000-0000-4000-8000-000000000008') <> 1 THEN
    RAISE EXCEPTION 'listing fee receipt missing';
  END IF;
END
$$;

SELECT jsonb_build_object(
  'pending_without_reserve', true,
  'capture_on_paid_approval', true,
  'release_on_reject', true,
  'release_on_delete', true,
  'captured_fee_not_refunded', true,
  'wallet_fee_lifecycle_pass', true
) AS commerce_wallet_fee_lifecycle_result;
