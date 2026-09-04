-- One-time cleanup after the canonical location correction and read-only post-verification.
-- This removes only the fixed-scope admin RPC; it does not change any row.

DROP FUNCTION public.admin_correct_canonical_location_conflict();

NOTIFY pgrst, 'reload schema';
