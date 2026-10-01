-- Harden the listing approval RPC ACL after the original migration has been applied.
-- Production execution is user-run; this migration does not mutate listing or wallet data.

REVOKE ALL ON FUNCTION public.approve_user_listing_with_fee_decision(
  uuid, text, text, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.approve_user_listing_with_fee_decision(
  uuid, text, text, text, text
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
