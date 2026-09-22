-- Read-only verification after duplicate cleanup and normalized-phone migration.

BEGIN TRANSACTION READ ONLY;

WITH params AS (
  SELECT
    '638c8de1-c0f1-414e-95c9-5b1545ceee2e'::uuid AS removed_user_id,
    '6149cd97-47d4-43a2-9e67-1fcc23ea168e'::uuid AS retained_user_id,
    '0967433879'::text AS normalized_phone
), duplicate_groups AS (
  SELECT public.normalize_vn_phone(phone) AS normalized_phone, count(*) AS account_count
  FROM public.profiles
  WHERE NULLIF(public.normalize_vn_phone(phone), '') IS NOT NULL
  GROUP BY public.normalize_vn_phone(phone)
  HAVING count(*) > 1
), index_state AS (
  SELECT
    i.indisunique,
    i.indisvalid,
    i.indisready,
    pg_get_indexdef(i.indexrelid) AS definition
  FROM pg_index i
  JOIN pg_class c ON c.oid = i.indexrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'profiles_normalized_phone_unique'
), checks AS (
  SELECT
    NOT EXISTS (SELECT 1 FROM auth.users u JOIN params x ON u.id = x.removed_user_id) AS removed_auth_user_absent,
    NOT EXISTS (SELECT 1 FROM public.profiles p JOIN params x ON p.id = x.removed_user_id) AS removed_profile_absent,
    NOT EXISTS (SELECT 1 FROM public.agent_profiles p JOIN params x ON p.user_id = x.removed_user_id) AS removed_agent_profile_absent,
    NOT EXISTS (SELECT 1 FROM public.user_customer_records p JOIN params x ON p.user_id = x.removed_user_id) AS removed_customer_record_absent,
    EXISTS (
      SELECT 1
      FROM auth.users u
      JOIN public.profiles p ON p.id = u.id
      JOIN params x ON u.id = x.retained_user_id
      WHERE lower(u.email) = 'phamyen0099@gmail.com'
        AND u.email_confirmed_at IS NOT NULL
        AND p.role = 'user'
        AND public.normalize_vn_phone(p.phone) = x.normalized_phone
    ) AS retained_account_intact,
    (SELECT count(*) FROM duplicate_groups) = 0 AS no_duplicate_normalized_phones,
    (SELECT count(*) FROM index_state WHERE indisunique AND indisvalid AND indisready) = 1 AS unique_index_ready,
    EXISTS (
      SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public'
        AND c.relname = 'profiles'
        AND t.tgname = 'trg_enforce_profile_identity'
        AND NOT t.tgisinternal
        AND t.tgenabled <> 'D'
    ) AS profile_identity_trigger_enabled
)
SELECT jsonb_build_object(
  'measured_at', now(),
  'write_performed', false,
  'checks', (SELECT to_jsonb(c) FROM checks c),
  'index_state', COALESCE((SELECT jsonb_agg(to_jsonb(i)) FROM index_state i), '[]'::jsonb),
  'remaining_duplicate_groups', COALESCE((SELECT jsonb_agg(to_jsonb(d)) FROM duplicate_groups d), '[]'::jsonb),
  'pass', (
    SELECT removed_auth_user_absent
      AND removed_profile_absent
      AND removed_agent_profile_absent
      AND removed_customer_record_absent
      AND retained_account_intact
      AND no_duplicate_normalized_phones
      AND unique_index_ready
      AND profile_identity_trigger_enabled
    FROM checks
  )
) AS profile_phone_uniqueness_verification;

ROLLBACK;
