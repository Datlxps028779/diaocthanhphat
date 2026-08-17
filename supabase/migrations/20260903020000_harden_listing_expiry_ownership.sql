-- =============================================================================
-- P3C: database/cron owns listing expiry and linked-property unpublishing
-- =============================================================================
-- Keep the existing runtime behavior, but remove direct browser execution from
-- the two internal SECURITY DEFINER functions and fix their search paths.
-- This migration does not reschedule pg_cron and does not mutate existing rows.

CREATE OR REPLACE FUNCTION public.expire_due_listings()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_expired_count integer;
BEGIN
  WITH due AS (
    UPDATE public.user_listings
       SET status = 'expired'
     WHERE status = 'approved'
       AND expires_at IS NOT NULL
       AND expires_at <= now()
    RETURNING 1
  )
  SELECT count(*) INTO v_expired_count FROM due;

  RETURN v_expired_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_due_listings()
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.hide_property_when_listing_unpublished()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.property_id IS NOT NULL THEN
      UPDATE public.properties
         SET is_active = false
       WHERE id = OLD.property_id;
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.property_id IS NOT NULL
     AND OLD.status = 'approved'
     AND NEW.status <> 'approved' THEN
    UPDATE public.properties
       SET is_active = false
     WHERE id = OLD.property_id;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.hide_property_when_listing_unpublished()
  FROM PUBLIC, anon, authenticated;

NOTIFY pgrst, 'reload schema';
