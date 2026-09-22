-- Final read-only guard for removing the unconfirmed duplicate account.

BEGIN TRANSACTION READ ONLY;

WITH params AS (
  SELECT
    '638c8de1-c0f1-414e-95c9-5b1545ceee2e'::uuid AS losing_user_id,
    '6149cd97-47d4-43a2-9e67-1fcc23ea168e'::uuid AS retained_user_id,
    '0967433879'::text AS normalized_phone
), accounts AS (
  SELECT
    u.id,
    lower(u.email) AS email,
    u.email_confirmed_at,
    u.last_sign_in_at,
    p.role,
    public.normalize_vn_phone(p.phone) AS normalized_phone
  FROM auth.users u
  JOIN public.profiles p ON p.id = u.id
  JOIN params x ON u.id IN (x.losing_user_id, x.retained_user_id)
), losing_agent_profile AS (
  SELECT ap.id, ap.slug, ap.status, ap.created_at, ap.updated_at
  FROM public.agent_profiles ap
  JOIN params x ON ap.user_id = x.losing_user_id
), losing_agent_state AS (
  SELECT jsonb_build_object(
    'profiles', (SELECT count(*) FROM losing_agent_profile),
    'profile_rows', COALESCE((SELECT jsonb_agg(to_jsonb(ap) ORDER BY ap.id) FROM losing_agent_profile ap), '[]'::jsonb),
    'slug_aliases', (
      SELECT count(*)
      FROM public.agent_profile_slug_aliases a
      WHERE a.agent_profile_id IN (SELECT id FROM losing_agent_profile)
    ),
    'audit_events', (
      SELECT count(*)
      FROM public.agent_profile_audit_events e
      WHERE e.agent_profile_id IN (SELECT id FROM losing_agent_profile)
    ),
    'nonautomatic_audit_events', (
      SELECT count(*)
      FROM public.agent_profile_audit_events e
      WHERE e.agent_profile_id IN (SELECT id FROM losing_agent_profile)
        AND NOT (e.action = 'created' AND e.actor_id IS NULL)
    )
  ) AS value
), losing_dependency_state AS (
  SELECT jsonb_build_object(
    'customer_records', (SELECT count(*) FROM public.user_customer_records r JOIN params x ON r.user_id = x.losing_user_id),
    'customer_activities', (SELECT count(*) FROM public.user_customer_activities r JOIN params x ON r.user_id = x.losing_user_id OR r.author_id = x.losing_user_id),
    'customer_assignments', (SELECT count(*) FROM public.user_customer_assignments r JOIN params x ON r.user_id = x.losing_user_id OR r.staff_user_id = x.losing_user_id OR r.assigned_by = x.losing_user_id),
    'user_listings', (SELECT count(*) FROM public.user_listings r JOIN params x ON r.user_id = x.losing_user_id),
    'user_media', (SELECT count(*) FROM public.user_media r JOIN params x ON r.user_id = x.losing_user_id),
    'listing_panoramas', (SELECT count(*) FROM public.user_listing_panoramas r JOIN params x ON r.owner_user_id = x.losing_user_id),
    'property_favorites', (SELECT count(*) FROM public.property_favorites r JOIN params x ON r.user_id = x.losing_user_id),
    'user_favorites', (SELECT count(*) FROM public.user_favorites r JOIN params x ON r.user_id = x.losing_user_id),
    'saved_searches', (SELECT count(*) FROM public.user_saved_searches r JOIN params x ON r.user_id = x.losing_user_id),
    'taste_signals', (SELECT count(*) FROM public.user_taste_signals r JOIN params x ON r.user_id = x.losing_user_id),
    'leads', (SELECT count(*) FROM public.leads r JOIN params x ON r.user_id = x.losing_user_id),
    'lead_assignments', (SELECT count(*) FROM public.lead_assignments r JOIN params x ON r.user_id = x.losing_user_id OR r.added_by = x.losing_user_id),
    'chat_sessions', (SELECT count(*) FROM public.chat_sessions r JOIN params x ON r.user_id = x.losing_user_id),
    'chat_messages', (SELECT count(*) FROM public.chat_messages r JOIN params x ON r.author_id = x.losing_user_id),
    'chat_assignments', (SELECT count(*) FROM public.chat_assignments r JOIN params x ON r.user_id = x.losing_user_id OR r.assigned_by = x.losing_user_id),
    'staff_permissions', (SELECT count(*) FROM public.staff_permission_assignments r JOIN params x ON r.staff_user_id = x.losing_user_id OR r.granted_by = x.losing_user_id),
    'staff_permission_audit', (SELECT count(*) FROM public.staff_permission_audit r JOIN params x ON r.staff_user_id = x.losing_user_id OR r.actor_id = x.losing_user_id),
    'staff_customer_settings', (SELECT count(*) FROM public.staff_customer_settings r JOIN params x ON r.user_id = x.losing_user_id),
    'chat_staff_capacity', (SELECT count(*) FROM public.chat_staff_capacity r JOIN params x ON r.user_id = x.losing_user_id),
    'owner_access', (SELECT count(*) FROM public.owner_access_config r JOIN params x ON r.owner_user_id = x.losing_user_id),
    'storage_objects', (SELECT count(*) FROM storage.objects r JOIN params x ON r.owner = x.losing_user_id),
    'listing_lifecycle_events', (SELECT count(*) FROM public.user_listing_lifecycle_events r JOIN params x ON r.listing_owner_id = x.losing_user_id OR r.actor_id = x.losing_user_id),
    'verification_cases', (SELECT count(*) FROM public.property_verification_cases r JOIN params x ON r.submitted_by = x.losing_user_id OR r.reviewed_by = x.losing_user_id),
    'verification_evidence', (SELECT count(*) FROM public.property_verification_evidence r JOIN params x ON r.submitted_by = x.losing_user_id),
    'verification_events', (SELECT count(*) FROM public.property_verification_events r JOIN params x ON r.actor_id = x.losing_user_id),
    'property_audit_events', (SELECT count(*) FROM public.property_change_audit_events r JOIN params x ON r.actor_id = x.losing_user_id),
    'news_publication_events', (SELECT count(*) FROM public.news_publication_events r JOIN params x ON r.actor_id = x.losing_user_id),
    'search_visibility_runs', (SELECT count(*) FROM public.search_visibility_runs r JOIN params x ON r.actor_id = x.losing_user_id),
    'seo_route_overrides', (SELECT count(*) FROM public.seo_route_overrides r JOIN params x ON r.updated_by = x.losing_user_id)
  ) AS value
), checks AS (
  SELECT
    (SELECT count(*) FROM accounts) = 2 AS both_accounts_exist,
    (SELECT count(*) FROM accounts a JOIN params x ON a.id = x.losing_user_id
      WHERE a.email = 'monyen1444@gmail.com'
        AND a.role = 'user'
        AND a.normalized_phone = x.normalized_phone
        AND a.email_confirmed_at IS NULL
        AND a.last_sign_in_at IS NULL) = 1 AS losing_account_matches,
    (SELECT count(*) FROM accounts a JOIN params x ON a.id = x.retained_user_id
      WHERE a.email = 'phamyen0099@gmail.com'
        AND a.role = 'user'
        AND a.normalized_phone = x.normalized_phone
        AND a.email_confirmed_at IS NOT NULL
        AND a.last_sign_in_at IS NOT NULL) = 1 AS retained_account_matches,
    (SELECT count(*) FROM public.profiles p JOIN params x ON public.normalize_vn_phone(p.phone) = x.normalized_phone) = 2 AS duplicate_group_unchanged,
    (SELECT count(*) FROM public.user_customer_records r JOIN params x ON r.user_id = x.losing_user_id) = 1 AS only_auto_customer_record,
    (SELECT count(*) FROM losing_agent_profile) = 1 AS only_auto_agent_profile,
    (SELECT (value->>'slug_aliases')::bigint FROM losing_agent_state) = 0 AS no_agent_slug_aliases,
    (SELECT (value->>'nonautomatic_audit_events')::bigint FROM losing_agent_state) = 0 AS no_nonautomatic_agent_audit,
    (
      SELECT bool_and(entry.value::bigint = 0)
      FROM losing_dependency_state state
      CROSS JOIN LATERAL jsonb_each_text(state.value - 'customer_records') AS entry(key, value)
    ) AS no_business_dependencies
)
SELECT jsonb_build_object(
  'measured_at', now(),
  'write_performed', false,
  'accounts', COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.id) FROM accounts a), '[]'::jsonb),
  'losing_agent_state', (SELECT value FROM losing_agent_state),
  'losing_dependency_state', (SELECT value FROM losing_dependency_state),
  'checks', (SELECT to_jsonb(c) FROM checks c),
  'safe_to_delete_losing_account', (
    SELECT both_accounts_exist
      AND losing_account_matches
      AND retained_account_matches
      AND duplicate_group_unchanged
      AND only_auto_customer_record
      AND only_auto_agent_profile
      AND no_agent_slug_aliases
      AND no_nonautomatic_agent_audit
      AND no_business_dependencies
    FROM checks
  )
) AS duplicate_phone_cleanup_dry_run;

ROLLBACK;
