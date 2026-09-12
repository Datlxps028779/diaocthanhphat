-- =============================================================================
-- C2 — Read-only verification/public-trust audit
--
-- Measures the relationship between the public verification projection and its
-- case, evidence, reviewer, scope, expiry, event, storage and RLS sources.
-- This file never creates cases/evidence, changes a projection, writes events,
-- calls a privileged mutation RPC, changes RLS, or changes storage policies.
-- Run it in Supabase SQL Editor after C1 post-verification.
-- =============================================================================

BEGIN TRANSACTION READ ONLY;

-- The public frontend contract accepts only these scope codes.
-- The same immutable array is used in every check so this audit remains read-only.

-- Canonicalized arrays make equality checks deterministic even if order differs.
WITH property_projection AS (
  SELECT
    p.id AS property_id,
    p.is_active,
    p.is_verified,
    p.verification_status,
    p.verification_scope_codes,
    p.verified_at,
    p.verified_until,
    COALESCE(
      p.is_verified IS TRUE
      AND p.verification_status = 'verified'
      AND p.verified_at IS NOT NULL
      AND p.verified_until > now()
      AND EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.verification_scope_codes, '{}'::text[])) AS scope(code)
        WHERE scope.code IN (
          'contact_confirmed',
          'location_info_reviewed',
          'media_reviewed',
          'listing_details_reviewed',
          'document_reference_reviewed'
        )
      ),
      false
    ) AS public_projection_valid
  FROM public.properties AS p
), case_quality AS (
  SELECT
    c.id AS case_id,
    c.property_id,
    c.user_listing_id,
    c.status,
    c.scope_codes,
    c.public_reason_codes,
    c.submitted_by,
    c.submitted_at,
    c.reviewed_by,
    c.reviewed_at,
    c.verified_until,
    c.updated_at,
    count(e.id)::bigint AS evidence_count,
    COALESCE(
      c.scope_codes IS NOT NULL
      AND cardinality(c.scope_codes) > 0
      AND array_position(c.scope_codes, NULL) IS NULL
      AND c.scope_codes <@
        ARRAY[
          'contact_confirmed',
          'location_info_reviewed',
          'media_reviewed',
          'listing_details_reviewed',
          'document_reference_reviewed'
        ]::text[],
      false
    ) AS scope_codes_valid,
    COALESCE(
      c.public_reason_codes IS NOT NULL
      AND cardinality(c.public_reason_codes) > 0
      AND array_position(c.public_reason_codes, NULL) IS NULL
      AND c.public_reason_codes <@ c.scope_codes,
      false
    ) AS public_reason_codes_valid
  FROM public.property_verification_cases AS c
  LEFT JOIN public.property_verification_evidence AS e ON e.case_id = c.id
  GROUP BY c.id
), verified_case_quality AS (
  SELECT
    cq.*,
    COALESCE(
      cq.status = 'verified'
      AND cq.reviewed_by IS NOT NULL
      AND cq.reviewed_at IS NOT NULL
      AND cq.verified_until > now()
      AND cq.evidence_count > 0
      AND cq.scope_codes_valid
      AND cq.public_reason_codes_valid,
      false
    ) AS case_is_publicly_eligible
  FROM case_quality AS cq
), property_case_rollup AS (
  SELECT
    pp.property_id,
    pp.public_projection_valid,
    count(vc.case_id) FILTER (WHERE vc.status = 'verified')::bigint AS verified_case_count,
    count(vc.case_id) FILTER (WHERE vc.case_is_publicly_eligible)::bigint AS eligible_verified_case_count,
    count(vc.case_id) FILTER (WHERE vc.status = 'verified' AND vc.evidence_count > 0)::bigint AS verified_case_with_evidence_count,
    count(vc.case_id) FILTER (WHERE vc.status = 'verified' AND vc.reviewed_by IS NOT NULL AND vc.reviewed_at IS NOT NULL)::bigint AS verified_case_with_reviewer_count,
    count(vc.case_id) FILTER (WHERE vc.status = 'verified' AND vc.verified_until <= now())::bigint AS expired_verified_case_count
  FROM property_projection AS pp
  LEFT JOIN verified_case_quality AS vc ON vc.property_id = pp.property_id
  GROUP BY pp.property_id, pp.public_projection_valid
), property_case_match AS (
  SELECT
    pp.property_id,
    pp.is_active,
    pp.is_verified,
    pp.verification_status,
    pp.verification_scope_codes,
    pp.verified_at,
    pp.verified_until,
    pp.public_projection_valid,
    vc.case_id,
    vc.status AS case_status,
    vc.scope_codes AS case_scope_codes,
    vc.public_reason_codes AS case_public_reason_codes,
    vc.reviewed_by,
    vc.reviewed_at,
    vc.verified_until AS case_verified_until,
    vc.evidence_count,
    vc.scope_codes_valid,
    vc.public_reason_codes_valid,
    vc.case_is_publicly_eligible
  FROM property_projection AS pp
  LEFT JOIN LATERAL (
    SELECT vc.*
    FROM verified_case_quality AS vc
    WHERE vc.property_id = pp.property_id
      AND vc.status = 'verified'
    ORDER BY vc.updated_at DESC NULLS LAST, vc.case_id DESC
    LIMIT 1
  ) AS vc ON true
)
SELECT
  now() AS measured_at,
  'verification_public_trust'::text AS source,
  'c2_summary'::text AS check_code,
  'summary'::text AS severity,
  'all'::text AS scope,
  count(*)::bigint AS total_properties,
  count(*) FILTER (WHERE is_active IS TRUE)::bigint AS active_properties,
  count(*) FILTER (WHERE is_verified IS TRUE)::bigint AS legacy_verified_properties,
  count(*) FILTER (WHERE is_active IS TRUE AND is_verified IS TRUE)::bigint AS active_legacy_verified_properties,
  count(*) FILTER (WHERE is_active IS TRUE AND public_projection_valid)::bigint AS active_public_projection_valid,
  count(*) FILTER (WHERE is_active IS TRUE AND is_verified IS TRUE AND NOT public_projection_valid)::bigint AS active_legacy_flag_without_valid_projection,
  count(*) FILTER (WHERE is_active IS TRUE AND verification_status = 'verified' AND NOT public_projection_valid)::bigint AS active_modern_status_without_valid_projection,
  count(*) FILTER (WHERE is_active IS TRUE AND public_projection_valid AND COALESCE(case_is_publicly_eligible, false))::bigint AS active_projection_with_eligible_case,
  count(*) FILTER (WHERE is_active IS TRUE AND public_projection_valid AND NOT COALESCE(case_is_publicly_eligible, false))::bigint AS active_projection_without_eligible_case,
  count(*) FILTER (WHERE case_status = 'verified')::bigint AS verified_cases,
  count(*) FILTER (WHERE case_status = 'verified' AND evidence_count > 0)::bigint AS verified_cases_with_evidence,
  count(*) FILTER (WHERE case_status = 'verified' AND reviewed_by IS NOT NULL AND reviewed_at IS NOT NULL)::bigint AS verified_cases_with_reviewer,
  count(*) FILTER (WHERE case_status = 'verified' AND case_verified_until <= now())::bigint AS expired_verified_cases,
  count(*) FILTER (WHERE case_status = 'verified' AND is_active IS FALSE)::bigint AS verified_cases_on_inactive_properties,
  'Legacy is_verified is reported for audit only; it is never treated as sufficient public evidence.'::text AS notes
FROM property_case_match;

-- Public projection candidates. These are evidence rows, not repair instructions.
WITH property_projection AS (
  SELECT
    p.id AS property_id,
    p.is_active,
    p.is_verified,
    p.verification_status,
    p.verification_scope_codes,
    p.verified_at,
    p.verified_until,
    COALESCE(
      p.is_verified IS TRUE
      AND p.verification_status = 'verified'
      AND p.verified_at IS NOT NULL
      AND p.verified_until > now()
      AND EXISTS (
        SELECT 1
        FROM unnest(COALESCE(p.verification_scope_codes, '{}'::text[])) AS scope(code)
        WHERE scope.code IN (
          'contact_confirmed',
          'location_info_reviewed',
          'media_reviewed',
          'listing_details_reviewed',
          'document_reference_reviewed'
        )
      ),
      false
    ) AS public_projection_valid
  FROM public.properties AS p
), case_quality AS (
  SELECT
    c.id AS case_id,
    c.property_id,
    c.status,
    c.scope_codes,
    c.public_reason_codes,
    c.reviewed_by,
    c.reviewed_at,
    c.verified_until,
    c.updated_at,
    count(e.id)::bigint AS evidence_count,
    COALESCE(
      c.scope_codes IS NOT NULL
      AND cardinality(c.scope_codes) > 0
      AND array_position(c.scope_codes, NULL) IS NULL
      AND c.scope_codes <@
        ARRAY[
          'contact_confirmed',
          'location_info_reviewed',
          'media_reviewed',
          'listing_details_reviewed',
          'document_reference_reviewed'
        ]::text[],
      false
    ) AS scope_codes_valid,
    COALESCE(
      c.public_reason_codes IS NOT NULL
      AND cardinality(c.public_reason_codes) > 0
      AND array_position(c.public_reason_codes, NULL) IS NULL
      AND c.public_reason_codes <@ c.scope_codes,
      false
    ) AS public_reason_codes_valid
  FROM public.property_verification_cases AS c
  LEFT JOIN public.property_verification_evidence AS e ON e.case_id = c.id
  GROUP BY c.id
), property_case_match AS (
  SELECT
    pp.*,
    vc.case_id,
    vc.status AS case_status,
    vc.scope_codes AS case_scope_codes,
    vc.public_reason_codes AS case_public_reason_codes,
    vc.reviewed_by,
    vc.reviewed_at,
    vc.verified_until AS case_verified_until,
    vc.evidence_count,
    vc.scope_codes_valid,
    vc.public_reason_codes_valid,
    COALESCE(
      vc.status = 'verified'
      AND vc.reviewed_by IS NOT NULL
      AND vc.reviewed_at IS NOT NULL
      AND vc.verified_until > now()
      AND vc.evidence_count > 0
      AND vc.scope_codes_valid
      AND vc.public_reason_codes_valid,
      false
    ) AS case_is_publicly_eligible
  FROM property_projection AS pp
  LEFT JOIN LATERAL (
    SELECT cq.*
    FROM case_quality AS cq
    WHERE cq.property_id = pp.property_id
      AND cq.status = 'verified'
    ORDER BY cq.updated_at DESC NULLS LAST, cq.case_id DESC
    LIMIT 1
  ) AS vc ON true
)
SELECT
  now() AS measured_at,
  'verification_public_trust'::text AS source,
  candidate.check_code,
  candidate.severity,
  candidate.scope,
  property_id,
  case_id,
  is_verified,
  verification_status,
  verified_at,
  verified_until,
  case_status,
  case_verified_until,
  evidence_count,
  reviewed_by IS NOT NULL AS has_reviewer,
  reviewed_at IS NOT NULL AS has_reviewed_at,
  public_projection_valid,
  case_is_publicly_eligible,
  candidate.notes
FROM property_case_match
CROSS JOIN LATERAL (VALUES
  (
    'legacy_flag_without_public_projection'::text,
    CASE WHEN is_active THEN 'high' ELSE 'medium' END,
    CASE WHEN is_active THEN 'active_public' ELSE 'all' END,
    is_verified IS TRUE AND NOT public_projection_valid,
    'Legacy is_verified is true but the strict public verification contract is not satisfied'::text
  ),
  (
    'modern_verified_status_without_public_projection'::text,
    CASE WHEN is_active THEN 'high' ELSE 'medium' END,
    CASE WHEN is_active THEN 'active_public' ELSE 'all' END,
    verification_status = 'verified' AND NOT public_projection_valid,
    'verification_status is verified but projection is missing a valid flag, date or public scope'::text
  ),
  (
    'public_projection_without_eligible_case'::text,
    'high'::text,
    'active_public'::text,
    is_active IS TRUE AND public_projection_valid AND NOT case_is_publicly_eligible,
    'Public projection has no matching verified case with reviewer, evidence, valid scope and future validity'::text
  ),
  (
    'public_projection_case_window_or_scope_mismatch'::text,
    'high'::text,
    'active_public'::text,
    is_active IS TRUE
      AND public_projection_valid
      AND case_status = 'verified'
      AND case_is_publicly_eligible
      AND (
        case_verified_until IS DISTINCT FROM verified_until
        OR (
          SELECT array_agg(DISTINCT code ORDER BY code)
          FROM unnest(verification_scope_codes) AS code
        ) IS DISTINCT FROM (
          SELECT array_agg(DISTINCT code ORDER BY code)
          FROM unnest(case_public_reason_codes) AS code
        )
      ),
    'Public projection validity window or public scope differs from the approved case'::text
  )
) AS candidate(check_code, severity, scope, is_candidate, notes)
WHERE candidate.is_candidate
ORDER BY candidate.severity DESC, candidate.check_code, property_id;

-- Verified-case integrity candidates.
WITH case_quality AS (
  SELECT
    c.id AS case_id,
    c.property_id,
    c.user_listing_id,
    c.status,
    c.scope_codes,
    c.public_reason_codes,
    c.reviewed_by,
    c.reviewed_at,
    c.verified_until,
    c.updated_at,
    count(e.id)::bigint AS evidence_count,
    COALESCE(
      c.scope_codes IS NOT NULL
      AND cardinality(c.scope_codes) > 0
      AND array_position(c.scope_codes, NULL) IS NULL
      AND c.scope_codes <@
        ARRAY[
          'contact_confirmed',
          'location_info_reviewed',
          'media_reviewed',
          'listing_details_reviewed',
          'document_reference_reviewed'
        ]::text[],
      false
    ) AS scope_codes_valid,
    COALESCE(
      c.public_reason_codes IS NOT NULL
      AND cardinality(c.public_reason_codes) > 0
      AND array_position(c.public_reason_codes, NULL) IS NULL
      AND c.public_reason_codes <@ c.scope_codes,
      false
    ) AS public_reason_codes_valid
  FROM public.property_verification_cases AS c
  LEFT JOIN public.property_verification_evidence AS e ON e.case_id = c.id
  GROUP BY c.id
)
SELECT
  now() AS measured_at,
  'verification_cases'::text AS source,
  candidate.check_code,
  candidate.severity,
  candidate.scope,
  cq.case_id,
  cq.property_id,
  cq.user_listing_id,
  cq.status,
  cq.scope_codes,
  cq.public_reason_codes,
  cq.evidence_count,
  cq.reviewed_by IS NOT NULL AS has_reviewer,
  cq.reviewed_at IS NOT NULL AS has_reviewed_at,
  cq.verified_until,
  candidate.notes
FROM case_quality AS cq
LEFT JOIN public.properties AS p ON p.id = cq.property_id
CROSS JOIN LATERAL (VALUES
  (
    'verified_case_without_evidence'::text,
    'high'::text,
    'public_claim'::text,
    cq.status = 'verified' AND cq.evidence_count = 0,
    'A verified case has no connected evidence record'::text
  ),
  (
    'verified_case_missing_reviewer'::text,
    'high'::text,
    'public_claim'::text,
    cq.status = 'verified' AND (cq.reviewed_by IS NULL OR cq.reviewed_at IS NULL),
    'A verified case is missing reviewer identity or review timestamp'::text
  ),
  (
    'verified_case_expired'::text,
    'high'::text,
    'public_claim'::text,
    cq.status = 'verified' AND (cq.verified_until IS NULL OR cq.verified_until <= now()),
    'A verified case validity window is absent or no longer in the future'::text
  ),
  (
    'verified_case_invalid_scope_codes'::text,
    'high'::text,
    'public_claim'::text,
    cq.status = 'verified' AND NOT cq.scope_codes_valid,
    'A verified case contains empty, null or unknown scope codes'::text
  ),
  (
    'verified_case_invalid_public_reason_codes'::text,
    'high'::text,
    'public_claim'::text,
    cq.status = 'verified' AND NOT cq.public_reason_codes_valid,
    'Public reason codes are empty, null or outside the case scope'::text
  ),
  (
    'verified_case_on_inactive_property'::text,
    'medium'::text,
    'public_claim'::text,
    cq.status = 'verified' AND p.id IS NOT NULL AND p.is_active IS FALSE,
    'The verified case belongs to a property that is not currently active'::text
  )
) AS candidate(check_code, severity, scope, is_candidate, notes)
WHERE candidate.is_candidate
ORDER BY candidate.severity DESC, candidate.check_code, cq.property_id, cq.case_id;

-- Multiple verified cases should not exist for one property under the open-case policy.
SELECT
  now() AS measured_at,
  'verification_cases'::text AS source,
  'multiple_verified_cases_per_property'::text AS check_code,
  'high'::text AS severity,
  'public_claim'::text AS scope,
  property_id,
  count(*)::bigint AS row_count,
  array_agg(id ORDER BY id) AS case_ids,
  'More than one case has status verified for the same property'::text AS notes
FROM public.property_verification_cases
WHERE status = 'verified'
GROUP BY property_id
HAVING count(*) > 1
ORDER BY property_id;

-- Evidence storage and metadata candidates. The schema constraints are checked
-- again here so production evidence is explicit rather than inferred from DDL.
SELECT
  now() AS measured_at,
  'verification_evidence'::text AS source,
  candidate.check_code,
  candidate.severity,
  candidate.scope,
  e.id AS evidence_id,
  e.case_id,
  c.property_id,
  e.storage_path,
  e.mime_type,
  e.size_bytes,
  candidate.notes
FROM public.property_verification_evidence AS e
JOIN public.property_verification_cases AS c ON c.id = e.case_id
LEFT JOIN storage.objects AS o
  ON o.bucket_id = 'verification-evidence'
 AND o.name = e.storage_path
CROSS JOIN LATERAL (VALUES
  (
    'evidence_private_object_missing'::text,
    'high'::text,
    'public_claim'::text,
    o.id IS NULL,
    'Evidence metadata has no matching object in the private verification-evidence bucket'::text
  ),
  (
    'evidence_storage_path_invalid'::text,
    'high'::text,
    'public_claim'::text,
    e.storage_path !~ ('^cases/' || e.case_id::text || '/[^/]+$'),
    'Evidence storage path does not match the case-scoped private path contract'::text
  ),
  (
    'evidence_mime_type_invalid'::text,
    'high'::text,
    'public_claim'::text,
    e.mime_type IS NULL OR e.mime_type NOT IN ('application/pdf', 'image/jpeg', 'image/png', 'image/webp'),
    'Evidence MIME type is absent or outside the allowed private-evidence set'::text
  ),
  (
    'evidence_size_invalid'::text,
    'high'::text,
    'public_claim'::text,
    e.size_bytes IS NULL OR e.size_bytes <= 0 OR e.size_bytes > 10485760,
    'Evidence size is absent, non-positive or greater than 10 MB'::text
  )
) AS candidate(check_code, severity, scope, is_candidate, notes)
WHERE candidate.is_candidate
ORDER BY candidate.severity DESC, candidate.check_code, e.case_id, e.id;

-- Verification event integrity candidates.
WITH latest_event AS (
  SELECT DISTINCT ON (e.case_id)
    e.case_id,
    e.property_id,
    e.event_type,
    e.from_status,
    e.to_status,
    e.actor_id,
    e.actor_role,
    e.occurred_at,
    e.id AS event_id
  FROM public.property_verification_events AS e
  ORDER BY e.case_id, e.occurred_at DESC, e.id DESC
), event_rollup AS (
  SELECT
    c.id AS case_id,
    c.property_id,
    c.status,
    le.event_id AS latest_event_id,
    le.property_id AS latest_event_property_id,
    le.to_status AS latest_event_to_status,
    count(e.id)::bigint AS event_count,
    count(e.id) FILTER (WHERE e.event_type = 'verified' AND e.to_status = 'verified')::bigint AS verified_event_count,
    count(e.id) FILTER (WHERE e.property_id IS DISTINCT FROM c.property_id)::bigint AS property_mismatch_event_count
  FROM public.property_verification_cases AS c
  LEFT JOIN public.property_verification_events AS e ON e.case_id = c.id
  LEFT JOIN latest_event AS le ON le.case_id = c.id
  GROUP BY c.id, le.event_id, le.property_id, le.to_status
)
SELECT
  now() AS measured_at,
  'verification_events'::text AS source,
  candidate.check_code,
  candidate.severity,
  candidate.scope,
  er.case_id,
  er.property_id,
  er.status,
  er.event_count,
  er.verified_event_count,
  er.latest_event_id,
  er.latest_event_to_status,
  er.property_mismatch_event_count,
  candidate.notes
FROM event_rollup AS er
CROSS JOIN LATERAL (VALUES
  (
    'verified_case_without_verified_event'::text,
    'high'::text,
    'audit_integrity'::text,
    er.status = 'verified' AND er.verified_event_count = 0,
    'A verified case has no corresponding verified transition event'::text
  ),
  (
    'latest_event_status_mismatch'::text,
    'high'::text,
    'audit_integrity'::text,
    er.latest_event_id IS NOT NULL AND er.latest_event_to_status IS DISTINCT FROM er.status,
    'The latest verification event to_status differs from the case status'::text
  ),
  (
    'case_without_verification_events'::text,
    'medium'::text,
    'audit_integrity'::text,
    er.status = 'verified' AND er.event_count = 0,
    'A verified case has no lifecycle event history'::text
  ),
  (
    'verification_event_property_mismatch'::text,
    'high'::text,
    'audit_integrity'::text,
    er.property_mismatch_event_count > 0,
    'One or more verification events reference a different property than the case'::text
  )
) AS candidate(check_code, severity, scope, is_candidate, notes)
WHERE candidate.is_candidate
ORDER BY candidate.severity DESC, candidate.check_code, er.property_id, er.case_id;

-- RLS inventory for all tables that can support a public verification claim.
SELECT
  now() AS measured_at,
  'verification_runtime'::text AS source,
  CASE
    WHEN c.relrowsecurity IS TRUE THEN 'rls_enabled'
    ELSE 'rls_disabled'
  END AS check_code,
  CASE WHEN c.relrowsecurity IS TRUE THEN 'info' ELSE 'high' END AS severity,
  'runtime_security'::text AS scope,
  n.nspname AS schema_name,
  c.relname AS table_name,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_row_level_security,
  'RLS must remain enabled on property and verification tables'::text AS notes
FROM pg_class AS c
JOIN pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'properties',
    'property_verification_cases',
    'property_verification_evidence',
    'property_verification_events'
  )
ORDER BY c.relname;

-- Policy definitions are reported for review without exposing verification files
-- or internal decision notes.
SELECT
  now() AS measured_at,
  'verification_runtime'::text AS source,
  'rls_policy_inventory'::text AS check_code,
  'info'::text AS severity,
  'runtime_security'::text AS scope,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check,
  'Review that public/anon access cannot read or write verification evidence and cases'::text AS notes
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'properties',
    'property_verification_cases',
    'property_verification_evidence',
    'property_verification_events'
  )
ORDER BY tablename, policyname;

-- Function security inventory. This does not invoke any function.
SELECT
  now() AS measured_at,
  'verification_runtime'::text AS source,
  'verification_function_security'::text AS check_code,
  CASE
    WHEN p.prosecdef IS TRUE AND p.proconfig @> ARRAY['search_path=public, pg_temp']::text[] THEN 'info'
    ELSE 'high'
  END AS severity,
  'runtime_security'::text AS scope,
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS identity_arguments,
  p.prosecdef AS security_definer,
  p.proconfig AS configuration,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  'Privileged verification functions should use SECURITY DEFINER with a fixed public, pg_temp search_path'::text AS notes
FROM pg_proc AS p
JOIN pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN (
    'open_property_verification_case',
    'add_property_verification_evidence',
    'submit_property_verification_case',
    'decide_property_verification_case',
    'revoke_property_verification_case',
    'expire_property_verification_cases',
    'property_verification_actor_role',
    'property_verification_internal_write_enabled'
  )
ORDER BY p.proname, identity_arguments;

ROLLBACK;
