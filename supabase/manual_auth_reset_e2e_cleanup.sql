BEGIN;

LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.agent_profiles IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  test_user_id constant uuid := 'bd32035f-5df0-482f-9e06-257a95b3d6d9';
  test_agent_profile_id constant uuid := 'ac07bb09-6a4e-4b1c-ad8b-b8dadc44923a';
  test_email constant text := 'auth-reset-e2e-1790349849913-065ae6@example.com';
  test_phone constant text := '0909849913';
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    JOIN public.agent_profiles ap ON ap.user_id = u.id
    WHERE u.id = test_user_id
      AND lower(u.email) = test_email
      AND p.role = 'user'
      AND public.normalize_vn_phone(p.phone) = test_phone
      AND ap.id = test_agent_profile_id
  ) THEN
    RAISE EXCEPTION 'Cleanup aborted: auth reset E2E account does not match';
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
    RAISE EXCEPTION 'Cleanup aborted: auth reset E2E account gained business data';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_profile_slug_aliases
    WHERE agent_profile_id = test_agent_profile_id
  ) THEN
    RAISE EXCEPTION 'Cleanup aborted: auth reset E2E agent profile has aliases';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agent_profile_audit_events
    WHERE agent_profile_id = test_agent_profile_id
      AND NOT (action = 'created' AND actor_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Cleanup aborted: auth reset E2E agent profile has nonautomatic audit history';
  END IF;

  ALTER TABLE public.agent_profiles DISABLE TRIGGER trg_agent_profile_audit;
  DELETE FROM auth.users WHERE id = test_user_id;
  ALTER TABLE public.agent_profiles ENABLE TRIGGER trg_agent_profile_audit;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.user_customer_records WHERE user_id = test_user_id)
     OR EXISTS (SELECT 1 FROM public.agent_profiles WHERE user_id = test_user_id)
  THEN
    RAISE EXCEPTION 'Cleanup failed: auth reset E2E dependencies remain';
  END IF;
END
$$;

COMMIT;
