-- Read-only dry-run for 20260924000000_public_agent_profile_activity.sql.
-- Run before the production migration. This file performs no writes.

SELECT
  to_regclass('public.profiles') AS profiles_table,
  to_regclass('public.agent_profiles') AS agent_profiles_table,
  EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'last_seen_at'
  ) AS last_seen_at_exists;

SELECT
  COUNT(*) FILTER (WHERE p.role = 'user') AS registered_users,
  COUNT(*) FILTER (WHERE p.role = 'user' AND ap.id IS NOT NULL) AS registered_users_with_profile,
  COUNT(*) FILTER (WHERE p.role = 'user' AND ap.id IS NULL) AS registered_users_missing_profile,
  COUNT(*) FILTER (WHERE p.role = 'user' AND (to_jsonb(p)->>'last_seen_at') IS NOT NULL) AS users_with_presence,
  COUNT(*) FILTER (
    WHERE p.role = 'user'
      AND (to_jsonb(p)->>'last_seen_at')::timestamptz > now() - interval '5 minutes'
  ) AS users_currently_online
FROM public.profiles p
LEFT JOIN public.agent_profiles ap ON ap.user_id = p.id;

SELECT
  COUNT(*) AS public_profiles_with_login,
  COUNT(*) FILTER (WHERE au.last_sign_in_at IS NULL) AS public_profiles_without_login,
  MIN(au.last_sign_in_at) AS earliest_public_login,
  MAX(au.last_sign_in_at) AS latest_public_login
FROM public.agent_profiles ap
JOIN public.profiles p ON p.id = ap.user_id
LEFT JOIN auth.users au ON au.id = ap.user_id
WHERE ap.status = 'published';

SELECT
  pr.listing_type,
  COALESCE(pt.name, 'Chưa phân loại') AS property_type_name,
  COUNT(*) AS listing_count
FROM public.agent_profiles ap
JOIN public.user_listings ul
  ON ul.user_id = ap.user_id
 AND ul.status = 'approved'
JOIN public.properties pr
  ON pr.id = ul.property_id
 AND pr.is_active = true
LEFT JOIN public.property_types pt ON pt.id = pr.property_type_id
WHERE ap.status = 'published'
GROUP BY pr.listing_type, COALESCE(pt.name, 'Chưa phân loại')
ORDER BY listing_count DESC, property_type_name ASC;

SELECT
  to_regprocedure('public.touch_my_presence()') IS NOT NULL AS touch_presence_exists,
  CASE
    WHEN to_regprocedure('public.touch_my_presence()') IS NULL THEN false
    ELSE has_function_privilege('anon', to_regprocedure('public.touch_my_presence()'), 'EXECUTE')
  END AS anon_can_touch_presence,
  CASE
    WHEN to_regprocedure('public.touch_my_presence()') IS NULL THEN false
    ELSE has_function_privilege('authenticated', to_regprocedure('public.touch_my_presence()'), 'EXECUTE')
  END AS authenticated_can_touch_presence,
  CASE
    WHEN to_regprocedure('public.public_get_agent_profile(text)') IS NULL THEN false
    ELSE has_function_privilege('anon', to_regprocedure('public.public_get_agent_profile(text)'), 'EXECUTE')
  END AS anon_can_read_profile,
  CASE
    WHEN to_regprocedure('public.public_get_agent_profile_listings(text)') IS NULL THEN false
    ELSE has_function_privilege('anon', to_regprocedure('public.public_get_agent_profile_listings(text)'), 'EXECUTE')
  END AS anon_can_read_listings;
