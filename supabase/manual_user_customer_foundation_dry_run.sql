-- =============================================================================
-- User/customer foundation preflight — READ ONLY
--
-- Chạy trong Supabase SQL Editor production để đo dữ liệu thật trước khi tạo
-- customer records/assignments. Script không INSERT/UPDATE/DELETE, không tạo
-- schema và chỉ trả về aggregate/metadata, không xuất PII từng người.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- 1) Các bảng nguồn và số dòng hiện tại.
SELECT table_name,
       to_regclass(format('public.%I', table_name)) IS NOT NULL AS exists_in_public
FROM (VALUES
  ('profiles'),
  ('user_listings'),
  ('user_media'),
  ('user_favorites'),
  ('user_saved_searches'),
  ('user_taste_signals'),
  ('leads'),
  ('lead_assignments'),
  ('lead_activities'),
  ('chat_sessions'),
  ('chat_assignments'),
  ('chat_staff_capacity'),
  ('agent_profiles')
) AS source_tables(table_name)
ORDER BY table_name;

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
) AS source_row_counts;

-- 2) Role distribution and account footprint. Chỉ trả về count, không trả tên/SĐT.
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
ORDER BY p.role;

-- 3) User listing distribution, gồm user có nhiều trạng thái.
SELECT
  status,
  count(*) AS listing_count,
  count(DISTINCT user_id) AS distinct_users
FROM public.user_listings
GROUP BY status
ORDER BY status;

SELECT
  count(*) AS registered_users,
  count(*) FILTER (WHERE listing_count > 0) AS users_with_any_listing,
  count(*) FILTER (WHERE listing_count = 0) AS users_without_listing,
  count(*) FILTER (WHERE approved_count > 0) AS users_with_approved_listing,
  count(*) FILTER (WHERE pending_count > 0) AS users_with_pending_listing,
  count(*) FILTER (WHERE rejected_count > 0) AS users_with_rejected_listing
FROM (
  SELECT
    p.id,
    count(ul.id) AS listing_count,
    count(ul.id) FILTER (WHERE ul.status = 'approved') AS approved_count,
    count(ul.id) FILTER (WHERE ul.status = 'pending') AS pending_count,
    count(ul.id) FILTER (WHERE ul.status = 'rejected') AS rejected_count
  FROM public.profiles p
  LEFT JOIN public.user_listings ul ON ul.user_id = p.id
  WHERE p.role = 'user'
  GROUP BY p.id
) footprint;

-- 4) Staff roster and current operational load. Không suy ra routing policy từ số ít dữ liệu.
SELECT
  p.role,
  count(*) AS staff_profile_count,
  count(*) FILTER (WHERE c.user_id IS NOT NULL) AS with_chat_capacity_row,
  count(*) FILTER (WHERE c.is_available) AS marked_chat_available,
  count(*) FILTER (WHERE c.is_available IS FALSE) AS marked_chat_unavailable
FROM public.profiles p
LEFT JOIN public.chat_staff_capacity c ON c.user_id = p.id
WHERE p.role IN ('admin', 'staff')
GROUP BY p.role
ORDER BY p.role;

SELECT
  p.id IS NOT NULL AS roster_profile_exists,
  p.role,
  COALESCE(NULLIF(btrim(p.display_name), ''), '(no display name)') AS roster_label,
  count(DISTINCT la.lead_id) AS assigned_leads,
  count(DISTINCT ca.session_id) AS assigned_chat_sessions,
  COALESCE(c.is_available, true) AS chat_available,
  COALESCE(c.max_active_sessions, 3) AS chat_capacity
FROM public.profiles p
LEFT JOIN public.lead_assignments la ON la.user_id = p.id
LEFT JOIN public.chat_assignments ca ON ca.user_id = p.id
LEFT JOIN public.chat_staff_capacity c ON c.user_id = p.id
WHERE p.role IN ('admin', 'staff')
GROUP BY p.id, p.role, p.display_name, c.is_available, c.max_active_sessions
ORDER BY assigned_leads DESC, assigned_chat_sessions DESC, p.created_at;

-- 5) Assignment gaps and cardinality. Đây là input để quyết định manual trước
-- hay automation; không tự động gán trong script.
SELECT jsonb_build_object(
  'leads_without_assignment', (SELECT count(*) FROM public.leads l WHERE NOT EXISTS (SELECT 1 FROM public.lead_assignments a WHERE a.lead_id = l.id)),
  'leads_with_multiple_assignees', (SELECT count(*) FROM (SELECT lead_id FROM public.lead_assignments GROUP BY lead_id HAVING count(*) > 1) x),
  'open_leads_without_assignment', (SELECT count(*) FROM public.leads l WHERE l.status NOT IN ('won', 'lost') AND NOT EXISTS (SELECT 1 FROM public.lead_assignments a WHERE a.lead_id = l.id)),
  'chat_sessions_without_assignment', (SELECT count(*) FROM public.chat_sessions s WHERE s.status <> 'closed' AND NOT EXISTS (SELECT 1 FROM public.chat_assignments a WHERE a.session_id = s.id)),
  'active_chats_without_assignment', (SELECT count(*) FROM public.chat_sessions s WHERE s.status = 'active' AND NOT EXISTS (SELECT 1 FROM public.chat_assignments a WHERE a.session_id = s.id))
) AS assignment_gaps;

-- 6) Candidate identity links by exact normalized phone, count-only. Đây KHÔNG phải
-- backfill recommendation: số phone có thể dùng chung/đổi chủ và cần admin explicit link.
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
) AS phone_link_candidates;

-- 7) Các nguồn hiện chưa có cột user_id để liên kết account; ghi nhận bằng metadata
-- thay vì select cột có thể chưa tồn tại. Nếu đã có cột mới ở production, migration
-- customer phải kiểm tra lại trước khi dùng.
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('leads', 'chat_sessions')
  AND column_name IN ('user_id', 'account_user_id', 'customer_user_id')
ORDER BY table_name, column_name;

-- 8) RLS/policy inventory cho các nguồn nhạy cảm.
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'profiles', 'user_listings', 'user_media', 'user_favorites',
    'user_saved_searches', 'leads', 'lead_assignments', 'lead_activities',
    'chat_sessions', 'chat_messages', 'chat_assignments', 'chat_staff_capacity',
    'agent_profiles'
  )
ORDER BY tablename, policyname;

-- 9) Public/authenticated execution inventory cho các routine liên quan.
SELECT
  n.nspname AS schema_name,
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
ORDER BY p.proname, arguments;

ROLLBACK;
