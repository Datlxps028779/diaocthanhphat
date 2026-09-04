-- Remove the one-time title backfill RPC after successful execution and postcheck.
BEGIN;

DROP FUNCTION public.admin_backfill_listing_titles();

NOTIFY pgrst, 'reload schema';

COMMIT;
