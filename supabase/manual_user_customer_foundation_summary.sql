-- =============================================================================
-- User/customer foundation preflight summary — READ ONLY, one result set
--
-- Dùng khi SQL Editor chỉ hiển thị result set cuối. Không ghi dữ liệu, không
-- thay đổi schema, không trả tên/email/SĐT từng bản ghi.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

WITH
source_counts AS (
  SELECT jsonb_build_object(
    'profiles', (SELECT count(*) FROM public.profiles),
    'user_listings', (SELECT count(*) FROM public.user_listings),
    'user_media', (SELECT count(*) FROM public.user_media),
    'user_favorites', (SELECT count(*) FROM public.user_favorites),
    'user_saved_searches', (SELECT count(*) FROM public.user_saved_searches),
    'user_taste_signals', (SELECT count(*) FROM public.user_taste_signals),
    'leads', (SELECT count(*) FROM public.leads),
    'lead_assignments', (SELECT count(*) FROM public.lead_assignments),
    'lead_activities', (SELECT count(*) FROM public.lead_activities),
    'chat_sessions', (SELECT count(*) FROM public.chat_sessions),
    'chat_assignments', (SELECT count(*) FROM public.chat_assignments),
    'chat_staff_capacity', (SELECT count(*) FROM public.chat_staff_capacity),
    'agent_profiles', (SELECT count(*) FROM public.agent_profiles)
  ) AS value
),
role_counts AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY role), '[]'::jsonb) AS value
  FROM (
    SELECT
      p.role,
      count(*) AS profile_count,
      count(*) FILTER (WHERE ul.user_id IS NOT NULL) AS users_with_listings,
      count(*) FILTER (WHERE um.user_id IS NOT NULL) AS users_with_media,
      count(*) FILTER (WHERE uf.user_id IS NOT NULL) AS users_with_favorites,
      count(*) FILTER (WHERE uss.user_id IS NOT NULL) AS users_with_saved_searches,
      count(*) FILTER (WHERE ap.user_id IS NOT NULL) AS users_with_agent_profile
    FROM public.profiles p
    LEFT JOIN (SELECT DISTINCT user_id FROM public.user_listings) ul ON ul.user_id = p.id
    LEFT JOIN (SELECT DISTINCT user_id FROM public.user_media) um ON um.user_id = p.id
    LEFT JOIN (SELECT DISTINCT user_id FROM public.user_favorites) uf ON uf.user_id = p.id
    LEFT JOIN (SELECT DISTINCT user_id FROM public.user_saved_searches) uss ON uss.user_id = p.id
    LEFT JOIN (SELECT DISTINCT user_id FROM public.agent_profiles) ap ON ap.user_id = p.id
    GROUP BY p.role
  ) x
),
listing_counts AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY status), '[]'::jsonb) AS value
  FROM (
    SELECT status, count(*) AS listing_count, count(DISTINCT user_id) AS distinct_users
    FROM public.user_listings
    GROUP BY status
  ) x
),
staff_load AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY assigned_leads DESC, assigned_chat_sessions DESC), '[]'::jsonb) AS value
  FROM (
    SELECT
      p.role,
      count(DISTINCT la.lead_id) AS assigned_leads,
      count(DISTINCT ca.session_id) AS assigned_chat_sessions,
      count(*) FILTER (WHERE c.user_id IS NOT NULL) > 0 AS has_chat_capacity_row,
      bool_and(coalesce(c.is_available, true)) AS all_chat_available
    FROM public.profiles p
    LEFT JOIN public.lead_assignments la ON la.user_id = p.id
    LEFT JOIN public.chat_assignments ca ON ca.user_id = p.id
    LEFT JOIN public.chat_staff_capacity c ON c.user_id = p.id
    WHERE p.role IN ('admin', 'staff')
    GROUP BY p.id, p.role
  ) x
),
assignment_gaps AS (
  SELECT jsonb_build_object(
    'leads_without_assignment', (SELECT count(*) FROM public.leads l WHERE NOT EXISTS (SELECT 1 FROM public.lead_assignments a WHERE a.lead_id = l.id)),
    'leads_with_multiple_assignees', (SELECT count(*) FROM (SELECT lead_id FROM public.lead_assignments GROUP BY lead_id HAVING count(*) > 1) x),
    'open_leads_without_assignment', (SELECT count(*) FROM public.leads l WHERE l.status NOT IN ('won', 'lost') AND NOT EXISTS (SELECT 1 FROM public.lead_assignments a WHERE a.lead_id = l.id)),
    'chat_sessions_without_assignment', (SELECT count(*) FROM public.chat_sessions s WHERE s.status <> 'closed' AND NOT EXISTS (SELECT 1 FROM public.chat_assignments a WHERE a.session_id = s.id)),
    'active_chats_without_assignment', (SELECT count(*) FROM public.chat_sessions s WHERE s.status = 'active' AND NOT EXISTS (SELECT 1 FROM public.chat_assignments a WHERE a.session_id = s.id))
  ) AS value
),
phone_candidates AS (
  SELECT jsonb_build_object(
    'leads_with_phone', (SELECT count(*) FROM public.leads WHERE NULLIF(regexp_replace(phone, '[^0-9]+', '', 'g'), '') IS NOT NULL),
    'profiles_with_phone', (SELECT count(*) FROM public.profiles WHERE NULLIF(regexp_replace(phone, '[^0-9]+', '', 'g'), '') IS NOT NULL),
    'exact_phone_candidate_pairs', (
      SELECT count(*)
      FROM public.leads l
      JOIN public.profiles p
        ON NULLIF(regexp_replace(l.phone, '[^0-9]+', '', 'g'), '')
         = NULLIF(regexp_replace(p.phone, '[^0-9]+', '', 'g'), '')
    ),
    'phones_matching_multiple_profiles', (
      SELECT count(*)
      FROM (
        SELECT regexp_replace(phone, '[^0-9]+', '', 'g') AS normalized_phone
        FROM public.profiles
        WHERE NULLIF(regexp_replace(phone, '[^0-9]+', '', 'g'), '') IS NOT NULL
        GROUP BY regexp_replace(phone, '[^0-9]+', '', 'g')
        HAVING count(*) > 1
      ) duplicates
    )
  ) AS value
),
identity_columns AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY table_name, column_name), '[]'::jsonb) AS value
  FROM (
    SELECT table_name, column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('leads', 'chat_sessions')
      AND column_name IN ('user_id', 'account_user_id', 'customer_user_id')
  ) x
),
rpc_grants AS (
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY proname, arguments), '[]'::jsonb) AS value
  FROM (
    SELECT
      p.proname,
      pg_get_function_identity_arguments(p.oid) AS arguments,
      p.prosecdef AS security_definer,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN (
        'is_lead_member', 'is_chat_member', 'route_chat_session',
        'public_get_property_agent', 'save_my_profile_and_agent_profile'
      )
  ) x
)
SELECT jsonb_build_object(
  'source_counts', (SELECT value FROM source_counts),
  'role_counts', (SELECT value FROM role_counts),
  'listing_counts', (SELECT value FROM listing_counts),
  'staff_load', (SELECT value FROM staff_load),
  'assignment_gaps', (SELECT value FROM assignment_gaps),
  'phone_link_candidates_count_only', (SELECT value FROM phone_candidates),
  'identity_columns', (SELECT value FROM identity_columns),
  'rpc_grants', (SELECT value FROM rpc_grants)
) AS user_customer_preflight_summary;

ROLLBACK;
