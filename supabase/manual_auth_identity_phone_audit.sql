-- Read-only audit before enforcing one normalized phone per account.
-- Run in Supabase SQL Editor and return the single JSON result unchanged.

BEGIN TRANSACTION READ ONLY;

WITH params AS (
  SELECT '0967433879'::text AS target_phone
), normalized_users AS (
  SELECT
    u.id,
    lower(NULLIF(btrim(u.email), '')) AS normalized_email,
    NULLIF(public.normalize_vn_phone(u.phone), '') AS auth_phone,
    NULLIF(public.normalize_vn_phone(u.raw_user_meta_data->>'phone'), '') AS metadata_phone,
    u.email_confirmed_at,
    u.phone_confirmed_at,
    u.last_sign_in_at,
    u.created_at,
    u.updated_at,
    u.banned_until,
    u.deleted_at
  FROM auth.users u
), normalized_profiles AS (
  SELECT
    p.id,
    NULLIF(btrim(p.display_name), '') AS display_name,
    p.role,
    p.phone AS stored_phone,
    NULLIF(public.normalize_vn_phone(p.phone), '') AS normalized_phone,
    p.created_at,
    p.updated_at
  FROM public.profiles p
), email_duplicate_groups AS (
  SELECT
    normalized_email,
    count(*) AS account_count,
    array_agg(id ORDER BY created_at, id) AS user_ids
  FROM normalized_users
  WHERE normalized_email IS NOT NULL
    AND deleted_at IS NULL
  GROUP BY normalized_email
  HAVING count(*) > 1
), phone_duplicate_groups AS (
  SELECT
    normalized_phone,
    count(*) AS account_count,
    array_agg(id ORDER BY created_at, id) AS user_ids
  FROM normalized_profiles
  WHERE normalized_phone IS NOT NULL
  GROUP BY normalized_phone
  HAVING count(*) > 1
), target_accounts AS (
  SELECT
    p.id AS user_id,
    u.normalized_email,
    p.display_name,
    p.role,
    p.stored_phone,
    p.normalized_phone,
    u.auth_phone,
    u.metadata_phone,
    u.email_confirmed_at,
    u.phone_confirmed_at,
    u.last_sign_in_at,
    u.created_at AS auth_created_at,
    p.created_at AS profile_created_at,
    u.banned_until,
    u.deleted_at
  FROM normalized_profiles p
  JOIN normalized_users u ON u.id = p.id
  CROSS JOIN params x
  WHERE p.normalized_phone = x.target_phone
), account_footprints AS (
  SELECT
    a.*,
    jsonb_build_object(
      'auth_identities', (SELECT count(*) FROM auth.identities x WHERE x.user_id = a.user_id),
      'owner_access', (SELECT count(*) FROM public.owner_access_config x WHERE x.owner_user_id = a.user_id),
      'staff_permissions', (SELECT count(*) FROM public.staff_permission_assignments x WHERE x.staff_user_id = a.user_id),
      'staff_permission_grants_authored', (SELECT count(*) FROM public.staff_permission_assignments x WHERE x.granted_by = a.user_id),
      'staff_customer_settings', (SELECT count(*) FROM public.staff_customer_settings x WHERE x.user_id = a.user_id),
      'chat_staff_capacity', (SELECT count(*) FROM public.chat_staff_capacity x WHERE x.user_id = a.user_id),
      'user_listings_total', (SELECT count(*) FROM public.user_listings x WHERE x.user_id = a.user_id),
      'user_listings_pending', (SELECT count(*) FROM public.user_listings x WHERE x.user_id = a.user_id AND x.status = 'pending'),
      'user_listings_approved', (SELECT count(*) FROM public.user_listings x WHERE x.user_id = a.user_id AND x.status = 'approved'),
      'user_listings_rejected', (SELECT count(*) FROM public.user_listings x WHERE x.user_id = a.user_id AND x.status = 'rejected'),
      'linked_properties', (
        SELECT count(DISTINCT x.property_id)
        FROM public.user_listings x
        WHERE x.user_id = a.user_id AND x.property_id IS NOT NULL
      ),
      'active_linked_properties', (
        SELECT count(DISTINCT p.id)
        FROM public.user_listings x
        JOIN public.properties p ON p.id = x.property_id
        WHERE x.user_id = a.user_id AND p.is_active IS TRUE
      ),
      'agent_profiles', (SELECT count(*) FROM public.agent_profiles x WHERE x.user_id = a.user_id),
      'customer_records', (SELECT count(*) FROM public.user_customer_records x WHERE x.user_id = a.user_id),
      'customer_activities_as_subject', (SELECT count(*) FROM public.user_customer_activities x WHERE x.user_id = a.user_id),
      'customer_activities_authored', (SELECT count(*) FROM public.user_customer_activities x WHERE x.author_id = a.user_id),
      'customer_assignments_as_customer', (SELECT count(*) FROM public.user_customer_assignments x WHERE x.user_id = a.user_id),
      'customer_assignments_as_staff', (SELECT count(*) FROM public.user_customer_assignments x WHERE x.staff_user_id = a.user_id),
      'leads_explicitly_linked', (SELECT count(*) FROM public.leads x WHERE x.user_id = a.user_id),
      'leads_on_linked_properties', (
        SELECT count(*)
        FROM public.leads x
        WHERE x.property_id IN (
          SELECT ul.property_id FROM public.user_listings ul
          WHERE ul.user_id = a.user_id AND ul.property_id IS NOT NULL
        )
      ),
      'lead_assignments_as_staff', (SELECT count(*) FROM public.lead_assignments x WHERE x.user_id = a.user_id),
      'chat_sessions_explicitly_linked', (SELECT count(*) FROM public.chat_sessions x WHERE x.user_id = a.user_id),
      'chat_sessions_on_linked_properties', (
        SELECT count(*)
        FROM public.chat_sessions x
        WHERE x.property_id IN (
          SELECT ul.property_id FROM public.user_listings ul
          WHERE ul.user_id = a.user_id AND ul.property_id IS NOT NULL
        )
      ),
      'chat_assignments_as_staff', (SELECT count(*) FROM public.chat_assignments x WHERE x.user_id = a.user_id),
      'property_favorites', (SELECT count(*) FROM public.property_favorites x WHERE x.user_id = a.user_id),
      'user_favorites', (SELECT count(*) FROM public.user_favorites x WHERE x.user_id = a.user_id),
      'saved_searches', (SELECT count(*) FROM public.user_saved_searches x WHERE x.user_id = a.user_id),
      'taste_signals', (SELECT count(*) FROM public.user_taste_signals x WHERE x.user_id = a.user_id),
      'user_media', (SELECT count(*) FROM public.user_media x WHERE x.user_id = a.user_id),
      'listing_panoramas', (SELECT count(*) FROM public.user_listing_panoramas x WHERE x.owner_user_id = a.user_id),
      'storage_objects_owned', (SELECT count(*) FROM storage.objects x WHERE x.owner = a.user_id),
      'listing_lifecycle_as_owner', (SELECT count(*) FROM public.user_listing_lifecycle_events x WHERE x.listing_owner_id = a.user_id),
      'listing_lifecycle_as_actor', (SELECT count(*) FROM public.user_listing_lifecycle_events x WHERE x.actor_id = a.user_id),
      'verification_cases_submitted', (SELECT count(*) FROM public.property_verification_cases x WHERE x.submitted_by = a.user_id),
      'verification_cases_reviewed', (SELECT count(*) FROM public.property_verification_cases x WHERE x.reviewed_by = a.user_id),
      'verification_evidence_submitted', (SELECT count(*) FROM public.property_verification_evidence x WHERE x.submitted_by = a.user_id),
      'verification_events_as_actor', (SELECT count(*) FROM public.property_verification_events x WHERE x.actor_id = a.user_id),
      'property_audit_events_as_actor', (SELECT count(*) FROM public.property_change_audit_events x WHERE x.actor_id = a.user_id),
      'agent_audit_events_as_actor', (SELECT count(*) FROM public.agent_profile_audit_events x WHERE x.actor_id = a.user_id),
      'staff_permission_audit_as_subject', (SELECT count(*) FROM public.staff_permission_audit x WHERE x.staff_user_id = a.user_id),
      'staff_permission_audit_as_actor', (SELECT count(*) FROM public.staff_permission_audit x WHERE x.actor_id = a.user_id),
      'news_publication_events_as_actor', (SELECT count(*) FROM public.news_publication_events x WHERE x.actor_id = a.user_id),
      'search_visibility_runs_as_actor', (SELECT count(*) FROM public.search_visibility_runs x WHERE x.actor_id = a.user_id),
      'seo_route_overrides_as_editor', (SELECT count(*) FROM public.seo_route_overrides x WHERE x.updated_by = a.user_id)
    ) AS footprint,
    to_jsonb(array_remove(ARRAY[
      CASE WHEN a.role IN ('admin', 'staff') THEN 'elevated_role' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.owner_access_config x WHERE x.owner_user_id = a.user_id) THEN 'configured_owner' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.staff_permission_assignments x WHERE x.staff_user_id = a.user_id) THEN 'has_staff_permissions' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.news_publication_events x WHERE x.actor_id = a.user_id) THEN 'news_audit_delete_restrict' END,
      CASE WHEN EXISTS (SELECT 1 FROM public.user_listing_panoramas x WHERE x.owner_user_id = a.user_id) THEN 'uuid_bound_storage_paths' END
    ], NULL)) AS stop_reasons
  FROM target_accounts a
), required_relations AS (
  SELECT unnest(ARRAY[
    'auth.users',
    'auth.identities',
    'public.profiles',
    'public.owner_access_config',
    'public.staff_permission_assignments',
    'public.user_listings',
    'public.properties',
    'public.agent_profiles',
    'public.user_customer_records',
    'public.user_customer_activities',
    'public.user_customer_assignments',
    'public.leads',
    'public.chat_sessions',
    'public.property_favorites',
    'public.user_favorites',
    'public.user_saved_searches',
    'public.user_taste_signals',
    'public.user_media',
    'public.user_listing_panoramas',
    'storage.objects'
  ]) AS relation_name
), missing_relations AS (
  SELECT relation_name
  FROM required_relations
  WHERE to_regclass(relation_name) IS NULL
), phone_index_state AS (
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object('index_name', indexname, 'definition', indexdef) ORDER BY indexname),
    '[]'::jsonb
  ) AS indexes
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename = 'profiles'
    AND indexdef ILIKE '%phone%'
)
SELECT jsonb_build_object(
  'measured_at', now(),
  'target_phone', (SELECT target_phone FROM params),
  'write_performed', false,
  'missing_required_relations', COALESCE(
    (SELECT jsonb_agg(relation_name ORDER BY relation_name) FROM missing_relations),
    '[]'::jsonb
  ),
  'email_duplicate_groups', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'normalized_email', normalized_email,
          'account_count', account_count,
          'user_ids', user_ids
        ) ORDER BY normalized_email
      )
      FROM email_duplicate_groups
    ),
    '[]'::jsonb
  ),
  'phone_duplicate_groups', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'normalized_phone', normalized_phone,
          'account_count', account_count,
          'user_ids', user_ids
        ) ORDER BY normalized_phone
      )
      FROM phone_duplicate_groups
    ),
    '[]'::jsonb
  ),
  'target_accounts', COALESCE(
    (
      SELECT jsonb_agg(
        jsonb_build_object(
          'user_id', user_id,
          'email', normalized_email,
          'display_name', display_name,
          'role', role,
          'stored_phone', stored_phone,
          'normalized_phone', normalized_phone,
          'auth_phone', auth_phone,
          'metadata_phone', metadata_phone,
          'email_confirmed_at', email_confirmed_at,
          'phone_confirmed_at', phone_confirmed_at,
          'last_sign_in_at', last_sign_in_at,
          'auth_created_at', auth_created_at,
          'profile_created_at', profile_created_at,
          'banned_until', banned_until,
          'deleted_at', deleted_at,
          'stop_reasons', stop_reasons,
          'footprint', footprint
        ) ORDER BY auth_created_at, user_id
      )
      FROM account_footprints
    ),
    '[]'::jsonb
  ),
  'profile_phone_indexes', (SELECT indexes FROM phone_index_state),
  'decision_status', 'awaiting_human_review_after_measurement'
) AS auth_identity_phone_audit;

ROLLBACK;
