-- Remove the disposable account created for the auth email verification.

BEGIN;

LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.agent_profiles IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  test_user_id constant uuid := '37b9eb8e-7c98-48ff-b53e-3e99dc9f825e';
  test_email constant text := 'quantri.cra+auth-20260922@gmail.com';
  test_phone constant text := '0767666636';
  v_agent_profile_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE u.id = test_user_id
      AND lower(u.email) = test_email
      AND p.role = 'user'
      AND public.normalize_vn_phone(p.phone) = test_phone
  ) THEN
    RAISE EXCEPTION 'Cleanup aborted: disposable auth account does not match';
  END IF;

  IF EXISTS (SELECT 1 FROM public.user_listings WHERE user_id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.user_media WHERE user_id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.user_listing_panoramas WHERE owner_user_id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.property_favorites WHERE user_id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.user_favorites WHERE user_id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.user_saved_searches WHERE user_id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.user_taste_signals WHERE user_id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.leads WHERE user_id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.chat_sessions WHERE user_id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.user_customer_activities WHERE user_id = test_user_id OR author_id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.user_customer_assignments WHERE user_id = test_user_id OR staff_user_id = test_user_id OR assigned_by = test_user_id)
     OR EXISTS (SELECT 1 FROM storage.objects WHERE owner = test_user_id)
  THEN
    RAISE EXCEPTION 'Cleanup aborted: disposable account gained business data';
  END IF;

  SELECT id INTO v_agent_profile_id
  FROM public.agent_profiles
  WHERE user_id = test_user_id;

  IF v_agent_profile_id IS NULL THEN
    RAISE EXCEPTION 'Cleanup aborted: disposable agent profile is missing';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_profile_slug_aliases
    WHERE agent_profile_id = v_agent_profile_id
  ) THEN
    RAISE EXCEPTION 'Cleanup aborted: disposable agent profile has aliases';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agent_profile_audit_events
    WHERE agent_profile_id = v_agent_profile_id
      AND NOT (action = 'created' AND actor_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Cleanup aborted: disposable agent profile has nonautomatic audit history';
  END IF;

  ALTER TABLE public.agent_profiles DISABLE TRIGGER trg_agent_profile_audit;
  DELETE FROM auth.users WHERE id = test_user_id;
  ALTER TABLE public.agent_profiles ENABLE TRIGGER trg_agent_profile_audit;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.user_customer_records WHERE user_id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.agent_profiles WHERE user_id = test_user_id)
  THEN
    RAISE EXCEPTION 'Cleanup failed: disposable account dependencies remain';
  END IF;

  RAISE NOTICE 'auth_test_cleanup=%', jsonb_build_object(
    'deleted_user_id', test_user_id,
    'deleted_email', test_email,
    'completed_at', now()
  );
END
$$;

COMMIT;
