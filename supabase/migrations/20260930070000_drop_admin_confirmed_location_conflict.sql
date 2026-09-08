-- One-time cleanup after the confirmed canonical location correction and
-- read-only post-verification. The correction RPC is no longer needed.
-- Run this manually in Supabase SQL Editor after deployment of the cleanup commit.

BEGIN;

DROP FUNCTION IF EXISTS public.admin_correct_confirmed_location_conflict();

NOTIFY pgrst, 'reload schema';

COMMIT;
