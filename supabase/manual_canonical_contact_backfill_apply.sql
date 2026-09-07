-- Canonical contact backfill for the measured safe scope.
-- Run only after both migrations have succeeded:
--   20260930020000_canonical_listing_contact.sql
--   20260930030000_canonical_contact_backfill_maintenance.sql
-- This script is user-run production SQL; the assistant never executes it.
-- It is idempotent: already-canonical rows remain unchanged.
-- It aborts unless the approved/active owner scope is still exactly 25 listings
-- and 25 distinct properties.

BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

DO $$
DECLARE
  v_listing_count bigint;
  v_property_count bigint;
  v_listing_rows_changed bigint := 0;
  v_property_rows_changed bigint := 0;
  target record;
  v_old_name text;
  v_old_phone text;
  v_old_zalo text;
BEGIN
  PERFORM set_config('app.canonical_contact_backfill', 'true', true);

  IF to_regprocedure('public.normalize_vn_phone(text)') IS NULL
     OR to_regprocedure('public.is_valid_vn_phone(text)') IS NULL
  THEN
    RAISE EXCEPTION 'Canonical contact migration must be applied before this backfill';
  END IF;

  IF pg_get_functiondef('public.assert_user_listing_mutation_scope()'::regprocedure)
       NOT LIKE '%app.canonical_contact_backfill%'
  THEN
    RAISE EXCEPTION 'Backfill maintenance migration must be applied before this backfill';
  END IF;

  WITH canonical_profiles AS (
    SELECT
      p.id,
      NULLIF(btrim(p.display_name), '') AS canonical_name,
      NULLIF(public.normalize_vn_phone(p.phone), '') AS canonical_phone
    FROM public.profiles p
  )
  SELECT count(*), count(DISTINCT l.property_id)
    INTO v_listing_count, v_property_count
  FROM public.user_listings l
  JOIN canonical_profiles cp
    ON cp.id = l.user_id
  JOIN public.properties p
    ON p.id = l.property_id
  WHERE l.status = 'approved'
    AND p.is_active IS TRUE
    AND cp.canonical_name IS NOT NULL
    AND cp.canonical_phone IS NOT NULL
    AND public.is_valid_vn_phone(cp.canonical_phone);

  IF v_listing_count <> 25 THEN
    RAISE EXCEPTION
      'Backfill aborted: expected 25 approved/active listing scope rows, found %',
      v_listing_count;
  END IF;

  IF v_property_count <> 25 THEN
    RAISE EXCEPTION
      'Backfill aborted: expected 25 distinct property scope rows, found %',
      v_property_count;
  END IF;

  FOR target IN
    WITH canonical_profiles AS (
      SELECT
        p.id,
        NULLIF(btrim(p.display_name), '') AS canonical_name,
        NULLIF(public.normalize_vn_phone(p.phone), '') AS canonical_phone
      FROM public.profiles p
    )
    SELECT
      l.id AS listing_id,
      l.property_id,
      cp.canonical_name,
      cp.canonical_phone
    FROM public.user_listings l
    JOIN canonical_profiles cp
      ON cp.id = l.user_id
    JOIN public.properties p
      ON p.id = l.property_id
    WHERE l.status = 'approved'
      AND p.is_active IS TRUE
      AND cp.canonical_name IS NOT NULL
      AND cp.canonical_phone IS NOT NULL
      AND public.is_valid_vn_phone(cp.canonical_phone)
    ORDER BY l.id
  LOOP
    SELECT l.contact_name, l.contact_phone, l.contact_zalo
      INTO v_old_name, v_old_phone, v_old_zalo
    FROM public.user_listings l
    WHERE l.id = target.listing_id;

    IF v_old_name IS DISTINCT FROM target.canonical_name
       OR v_old_phone IS DISTINCT FROM target.canonical_phone
       OR v_old_zalo IS DISTINCT FROM target.canonical_phone
    THEN
      v_listing_rows_changed := v_listing_rows_changed + 1;
    END IF;

    UPDATE public.user_listings
    SET
      contact_name = target.canonical_name,
      contact_phone = target.canonical_phone,
      contact_zalo = target.canonical_phone
    WHERE id = target.listing_id;

    SELECT p.contact_name, p.contact_phone, p.contact_zalo
      INTO v_old_name, v_old_phone, v_old_zalo
    FROM public.properties p
    WHERE p.id = target.property_id;

    IF v_old_name IS DISTINCT FROM target.canonical_name
       OR v_old_phone IS DISTINCT FROM target.canonical_phone
       OR v_old_zalo IS DISTINCT FROM target.canonical_phone
    THEN
      v_property_rows_changed := v_property_rows_changed + 1;
    END IF;

    UPDATE public.properties
    SET
      contact_name = target.canonical_name,
      contact_phone = target.canonical_phone,
      contact_zalo = target.canonical_phone
    WHERE id = target.property_id;
  END LOOP;

  RAISE NOTICE 'canonical_contact_backfill_result=%', jsonb_build_object(
    'completed_at', now(),
    'listing_scope_rows', v_listing_count,
    'property_scope_rows', v_property_count,
    'listing_rows_changed', v_listing_rows_changed,
    'property_rows_changed', v_property_rows_changed,
    'write_performed', true
  )::text;
END
$$;

COMMIT;
