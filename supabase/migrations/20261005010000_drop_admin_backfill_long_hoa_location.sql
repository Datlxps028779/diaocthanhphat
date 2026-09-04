-- Remove the one-time Long Hòa correction RPC after successful execution and postcheck.
BEGIN;

DROP FUNCTION public.admin_backfill_long_hoa_location();

NOTIFY pgrst, 'reload schema';

COMMIT;
