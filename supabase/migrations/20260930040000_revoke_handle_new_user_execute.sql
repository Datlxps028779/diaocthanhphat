-- Remove direct RPC execution of the auth trigger function.
-- Signup still invokes this function through auth.users trigger execution.

REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
