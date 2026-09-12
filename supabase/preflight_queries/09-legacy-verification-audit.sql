-- Read-only audit for legacy properties.is_verified rows.
-- This reports evidence/case/projection state; it does not mutate data.
BEGIN TRANSACTION READ ONLY;

WITH measured AS (
  SELECT now() AS measured_at
), legacy_properties AS (
  SELECT
    p.id,
    p.public_code,
    p.title,
    p.is_active,
    p.is_verified,
    p.verification_status,
    p.verification_scope_codes,
    p.verified_at,
    p.verified_until,
    m.measured_at
  FROM public.properties p
  CROSS JOIN measured m
  WHERE p.is_verified IS TRUE
), case_counts AS (
  SELECT
    c.property_id,
    count(*)::integer AS case_count,
    count(*) FILTER (WHERE c.status = 'verified')::integer AS verified_case_count
  FROM public.property_verification_cases c
  JOIN legacy_properties p ON p.id = c.property_id
  GROUP BY c.property_id
), ranked_cases AS (
  SELECT
    c.*,
    row_number() OVER (
      PARTITION BY c.property_id
      ORDER BY c.created_at DESC, c.id DESC
    ) AS row_number
  FROM public.property_verification_cases c
  JOIN legacy_properties p ON p.id = c.property_id
), latest_cases AS (
  SELECT * FROM ranked_cases WHERE row_number = 1
), ranked_verified_cases AS (
  SELECT
    c.*,
    row_number() OVER (
      PARTITION BY c.property_id
      ORDER BY c.reviewed_at DESC NULLS LAST, c.created_at DESC, c.id DESC
    ) AS row_number
  FROM public.property_verification_cases c
  JOIN legacy_properties p ON p.id = c.property_id
  WHERE c.status = 'verified'
), latest_verified_cases AS (
  SELECT * FROM ranked_verified_cases WHERE row_number = 1
), evidence_stats AS (
  SELECT
    e.case_id,
    count(*)::integer AS evidence_count,
    count(*) FILTER (WHERE o.name IS NOT NULL)::integer AS stored_object_count,
    count(*) FILTER (WHERE o.name IS NULL)::integer AS missing_object_count,
    string_agg(DISTINCT e.kind, ', ' ORDER BY e.kind) AS evidence_kinds
  FROM public.property_verification_evidence e
  LEFT JOIN storage.objects o
    ON o.bucket_id = 'verification-evidence'
   AND o.name = e.storage_path
  JOIN latest_verified_cases c ON c.id = e.case_id
  GROUP BY e.case_id
), ranked_events AS (
  SELECT
    e.*,
    row_number() OVER (
      PARTITION BY e.case_id
      ORDER BY e.occurred_at DESC, e.id DESC
    ) AS row_number
  FROM public.property_verification_events e
  JOIN latest_verified_cases c ON c.id = e.case_id
), latest_events AS (
  SELECT * FROM ranked_events WHERE row_number = 1
), classified AS (
  SELECT
    p.*,
    coalesce(cc.case_count, 0) AS case_count,
    coalesce(cc.verified_case_count, 0) AS verified_case_count,
    lc.id AS latest_case_id,
    lc.status AS latest_case_status,
    lc.created_at AS latest_case_created_at,
    lvc.id AS latest_verified_case_id,
    lvc.status AS latest_verified_case_status,
    lvc.scope_codes AS latest_verified_scope_codes,
    lvc.public_reason_codes AS latest_verified_public_reason_codes,
    lvc.reviewed_by AS latest_verified_reviewed_by,
    lvc.reviewed_at AS latest_verified_reviewed_at,
    lvc.verified_until AS latest_verified_case_until,
    coalesce(es.evidence_count, 0) AS evidence_count,
    coalesce(es.stored_object_count, 0) AS stored_object_count,
    coalesce(es.missing_object_count, 0) AS missing_object_count,
    es.evidence_kinds,
    le.event_type AS latest_event_type,
    le.to_status AS latest_event_to_status,
    le.occurred_at AS latest_event_occurred_at,
    CASE
      WHEN lc.id IS NULL THEN 'no_case'
      WHEN le.id IS NULL THEN 'missing_latest_event'
      WHEN le.to_status IS NOT DISTINCT FROM lc.status THEN 'matches_latest_case'
      ELSE 'event_status_mismatch'
    END AS event_state,
    CASE
      WHEN lc.id IS NULL THEN 'legacy_only'
      WHEN lvc.id IS NULL
       AND lc.status IN ('revoked', 'rejected', 'withdrawn', 'superseded') THEN 'revoked_or_unverified'
      WHEN lvc.id IS NULL THEN 'missing_case'
      WHEN lc.id IS DISTINCT FROM lvc.id
       AND lc.created_at > lvc.created_at
       AND lc.status IN ('revoked', 'rejected', 'withdrawn', 'superseded') THEN 'revoked_or_unverified'
      WHEN coalesce(es.evidence_count, 0) = 0
        OR coalesce(es.missing_object_count, 0) > 0 THEN 'missing_evidence'
      WHEN lvc.verified_until IS NULL
        OR lvc.verified_until <= p.measured_at
        OR p.verified_until IS NULL
        OR p.verified_until <= p.measured_at THEN 'expired'
      WHEN ARRAY(
        SELECT DISTINCT code
        FROM unnest(coalesce(p.verification_scope_codes, '{}'::text[])) AS scope(code)
        ORDER BY code
      ) IS DISTINCT FROM ARRAY(
        SELECT DISTINCT code
        FROM unnest(coalesce(lvc.public_reason_codes, '{}'::text[])) AS reasons(code)
        ORDER BY code
      ) THEN 'scope_mismatch'
      WHEN p.is_verified IS DISTINCT FROM true
        OR p.verification_status IS DISTINCT FROM 'verified'
        OR p.verified_at IS NULL
        OR p.verified_until IS DISTINCT FROM lvc.verified_until THEN 'projection_mismatch'
      ELSE 'evidence_backed'
    END AS classification
  FROM legacy_properties p
  LEFT JOIN case_counts cc ON cc.property_id = p.id
  LEFT JOIN latest_cases lc ON lc.property_id = p.id
  LEFT JOIN latest_verified_cases lvc ON lvc.property_id = p.id
  LEFT JOIN evidence_stats es ON es.case_id = lvc.id
  LEFT JOIN latest_events le ON le.case_id = lvc.id
), summary_rows AS (
  SELECT
    min(measured_at) AS measured_at,
    classification,
    count(*)::integer AS property_count,
    count(*) FILTER (WHERE is_active IS TRUE)::integer AS active_property_count,
    count(*) FILTER (WHERE event_state <> 'matches_latest_case')::integer AS event_anomaly_count
  FROM classified
  GROUP BY classification
), inventory AS (
  SELECT
    measured_at,
    'legacy_verification_summary'::text AS inventory_type,
    'public.properties'::text AS object_name,
    classification AS item_name,
    'classification_summary'::text AS item_kind,
    'properties.is_verified = true'::text AS validated,
    jsonb_build_object(
      'classification', classification,
      'property_count', property_count,
      'active_property_count', active_property_count,
      'event_anomaly_count', event_anomaly_count
    )::text AS definition,
    (classification = 'evidence_backed') AS bool_value,
    classification AS text_value,
    NULL::boolean AS anon_value,
    NULL::boolean AS authenticated_value
  FROM summary_rows

  UNION ALL

  SELECT
    measured_at,
    'legacy_verification_detail'::text,
    'public.properties'::text,
    coalesce(public_code::text, id::text),
    'property_audit'::text,
    title,
    jsonb_build_object(
      'property_id', id,
      'public_code', public_code,
      'title', title,
      'is_active', is_active,
      'is_verified', is_verified,
      'verification_status', verification_status,
      'verification_scope_codes', verification_scope_codes,
      'verified_at', verified_at,
      'verified_until', verified_until,
      'case_count', case_count,
      'verified_case_count', verified_case_count,
      'latest_case_id', latest_case_id,
      'latest_case_status', latest_case_status,
      'latest_case_created_at', latest_case_created_at,
      'latest_verified_case_id', latest_verified_case_id,
      'latest_verified_scope_codes', latest_verified_scope_codes,
      'latest_verified_public_reason_codes', latest_verified_public_reason_codes,
      'latest_verified_reviewed_by', latest_verified_reviewed_by,
      'latest_verified_reviewed_at', latest_verified_reviewed_at,
      'latest_verified_case_until', latest_verified_case_until,
      'evidence_count', evidence_count,
      'stored_object_count', stored_object_count,
      'missing_object_count', missing_object_count,
      'evidence_kinds', evidence_kinds,
      'latest_event_type', latest_event_type,
      'latest_event_to_status', latest_event_to_status,
      'latest_event_occurred_at', latest_event_occurred_at,
      'event_state', event_state,
      'classification', classification
    )::text,
    (classification = 'evidence_backed'),
    classification,
    NULL::boolean,
    NULL::boolean
  FROM classified
)
SELECT
  measured_at,
  inventory_type,
  object_name,
  item_name,
  item_kind,
  validated,
  definition,
  bool_value,
  text_value,
  anon_value,
  authenticated_value
FROM inventory
ORDER BY
  CASE inventory_type
    WHEN 'legacy_verification_summary' THEN 1
    ELSE 2
  END,
  item_name;

ROLLBACK;
