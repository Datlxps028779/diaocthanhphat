-- Remove the unconfirmed duplicate only if production still matches the measured state.
-- Run after manual_duplicate_phone_cleanup_dry_run.sql returns safe_to_delete_losing_account=true.

BEGIN;

LOCK TABLE auth.users IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.profiles IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE public.agent_profiles IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  losing_user_id constant uuid := '638c8de1-c0f1-414e-95c9-5b1545ceee2e';
  retained_user_id constant uuid := '6149cd97-47d4-43a2-9e67-1fcc23ea168e';
  expected_phone constant text := '0967433879';
  blockers jsonb;
  losing_agent_profile_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE u.id = losing_user_id
      AND lower(u.email) = 'monyen1444@gmail.com'
      AND u.email_confirmed_at IS NULL
      AND u.last_sign_in_at IS NULL
      AND p.role = 'user'
      AND public.normalize_vn_phone(p.phone) = expected_phone
  ) THEN
    RAISE EXCEPTION 'Cleanup aborted: losing account no longer matches the measured state';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM auth.users u
    JOIN public.profiles p ON p.id = u.id
    WHERE u.id = retained_user_id
      AND lower(u.email) = 'phamyen0099@gmail.com'
      AND u.email_confirmed_at IS NOT NULL
      AND u.last_sign_in_at IS NOT NULL
      AND p.role = 'user'
      AND public.normalize_vn_phone(p.phone) = expected_phone
  ) THEN
    RAISE EXCEPTION 'Cleanup aborted: retained account no longer matches the measured state';
  END IF;

  IF (
    SELECT count(*)
    FROM public.profiles
    WHERE public.normalize_vn_phone(phone) = expected_phone
  ) <> 2 THEN
    RAISE EXCEPTION 'Cleanup aborted: duplicate phone group changed since dry-run';
  END IF;

  SELECT jsonb_object_agg(source, row_count ORDER BY source)
    INTO blockers
  FROM (
    SELECT source, row_count
    FROM (
      SELECT 'customer_activities' AS source, count(*) AS row_count FROM public.user_customer_activities WHERE user_id = losing_user_id OR author_id = losing_user_id
      UNION ALL SELECT 'customer_assignments', count(*) FROM public.user_customer_assignments WHERE user_id = losing_user_id OR staff_user_id = losing_user_id OR assigned_by = losing_user_id
      UNION ALL SELECT 'user_listings', count(*) FROM public.user_listings WHERE user_id = losing_user_id
      UNION ALL SELECT 'user_media', count(*) FROM public.user_media WHERE user_id = losing_user_id
      UNION ALL SELECT 'listing_panoramas', count(*) FROM public.user_listing_panoramas WHERE owner_user_id = losing_user_id
      UNION ALL SELECT 'property_favorites', count(*) FROM public.property_favorites WHERE user_id = losing_user_id
      UNION ALL SELECT 'user_favorites', count(*) FROM public.user_favorites WHERE user_id = losing_user_id
      UNION ALL SELECT 'saved_searches', count(*) FROM public.user_saved_searches WHERE user_id = losing_user_id
      UNION ALL SELECT 'taste_signals', count(*) FROM public.user_taste_signals WHERE user_id = losing_user_id
      UNION ALL SELECT 'leads', count(*) FROM public.leads WHERE user_id = losing_user_id
      UNION ALL SELECT 'lead_assignments', count(*) FROM public.lead_assignments WHERE user_id = losing_user_id OR added_by = losing_user_id
      UNION ALL SELECT 'chat_sessions', count(*) FROM public.chat_sessions WHERE user_id = losing_user_id
      UNION ALL SELECT 'chat_messages', count(*) FROM public.chat_messages WHERE author_id = losing_user_id
      UNION ALL SELECT 'chat_assignments', count(*) FROM public.chat_assignments WHERE user_id = losing_user_id OR assigned_by = losing_user_id
      UNION ALL SELECT 'staff_permissions', count(*) FROM public.staff_permission_assignments WHERE staff_user_id = losing_user_id OR granted_by = losing_user_id
      UNION ALL SELECT 'staff_permission_audit', count(*) FROM public.staff_permission_audit WHERE staff_user_id = losing_user_id OR actor_id = losing_user_id
      UNION ALL SELECT 'staff_customer_settings', count(*) FROM public.staff_customer_settings WHERE user_id = losing_user_id
      UNION ALL SELECT 'chat_staff_capacity', count(*) FROM public.chat_staff_capacity WHERE user_id = losing_user_id
      UNION ALL SELECT 'owner_access', count(*) FROM public.owner_access_config WHERE owner_user_id = losing_user_id
      UNION ALL SELECT 'storage_objects', count(*) FROM storage.objects WHERE owner = losing_user_id
      UNION ALL SELECT 'listing_lifecycle_events', count(*) FROM public.user_listing_lifecycle_events WHERE listing_owner_id = losing_user_id OR actor_id = losing_user_id
      UNION ALL SELECT 'verification_cases', count(*) FROM public.property_verification_cases WHERE submitted_by = losing_user_id OR reviewed_by = losing_user_id
      UNION ALL SELECT 'verification_evidence', count(*) FROM public.property_verification_evidence WHERE submitted_by = losing_user_id
      UNION ALL SELECT 'verification_events', count(*) FROM public.property_verification_events WHERE actor_id = losing_user_id
      UNION ALL SELECT 'property_audit_events', count(*) FROM public.property_change_audit_events WHERE actor_id = losing_user_id
      UNION ALL SELECT 'news_publication_events', count(*) FROM public.news_publication_events WHERE actor_id = losing_user_id
      UNION ALL SELECT 'search_visibility_runs', count(*) FROM public.search_visibility_runs WHERE actor_id = losing_user_id
      UNION ALL SELECT 'seo_route_overrides', count(*) FROM public.seo_route_overrides WHERE updated_by = losing_user_id
    ) measured
    WHERE row_count <> 0
  ) nonzero;

  IF blockers IS NOT NULL THEN
    RAISE EXCEPTION 'Cleanup aborted: losing account gained business dependencies: %', blockers;
  END IF;

  IF (SELECT count(*) FROM public.user_customer_records WHERE user_id = losing_user_id) <> 1 THEN
    RAISE EXCEPTION 'Cleanup aborted: expected exactly one auto-created customer record';
  END IF;

  SELECT id INTO losing_agent_profile_id
  FROM public.agent_profiles
  WHERE user_id = losing_user_id;

  IF losing_agent_profile_id IS NULL THEN
    RAISE EXCEPTION 'Cleanup aborted: expected one auto-created agent profile';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.agent_profile_slug_aliases
    WHERE agent_profile_id = losing_agent_profile_id
  ) THEN
    RAISE EXCEPTION 'Cleanup aborted: losing agent profile has slug aliases';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.agent_profile_audit_events
    WHERE agent_profile_id = losing_agent_profile_id
      AND NOT (action = 'created' AND actor_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Cleanup aborted: losing agent profile has nonautomatic audit history';
  END IF;

  ALTER TABLE public.agent_profiles DISABLE TRIGGER trg_agent_profile_audit;
  DELETE FROM auth.users WHERE id = losing_user_id;
  ALTER TABLE public.agent_profiles ENABLE TRIGGER trg_agent_profile_audit;

  IF EXISTS (SELECT 1 FROM auth.users WHERE id = losing_user_id)
     OR EXISTS (SELECT 1 FROM public.profiles WHERE id = losing_user_id)
  THEN
    RAISE EXCEPTION 'Cleanup failed: losing account still exists';
  END IF;

  IF (
    SELECT array_agg(id ORDER BY id)
    FROM public.profiles
    WHERE public.normalize_vn_phone(phone) = expected_phone
  ) IS DISTINCT FROM ARRAY[retained_user_id] THEN
    RAISE EXCEPTION 'Cleanup failed: retained phone ownership is not singular';
  END IF;

  RAISE NOTICE 'duplicate_phone_cleanup=%', jsonb_build_object(
    'deleted_user_id', losing_user_id,
    'retained_user_id', retained_user_id,
    'normalized_phone', expected_phone,
    'completed_at', now()
  );
END
$$;

COMMIT;
