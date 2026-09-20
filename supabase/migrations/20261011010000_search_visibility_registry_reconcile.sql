-- =============================================================================
-- Search Visibility — atomic registry reconciliation (single RPC)
--
-- Production SQL is run by the user, after the manual preflight/dry run.
--
-- PROBLEM: the eligibility sync currently reads the public sources, then upserts
-- every candidate row, then finishes the run — three separate round trips with no
-- shared transaction. Two syncs can interleave, an older run can overwrite a newer
-- one, a failed run leaves a half-written registry, and candidates that used to be
-- eligible but no longer exist (retired locality keys) stay eligible forever and
-- keep feeding the sitemap and the inspection queue.
--
-- THIS MIGRATION: adds ONE server-only RPC that performs, inside a single
-- transaction and under a transaction advisory lock:
--   1. payload validation (bounded, allowlisted, no duplicate source keys);
--   2. run eligibility + fence against a newer started/succeeded run
--      (using the DB stored started_at/id, never a client clock);
--   3. stale-read detection: the caller's full expected registry snapshot must
--      still match the live table, otherwise the whole call aborts with no write;
--   4. identify the retiring set (only absent area:/area_listing:/locality_news:
--      keys), then validate canonical conflicts with those retiring keys excluded —
--      they are about to release their URLs, so a candidate may take one over;
--   5. retire FIRST, releasing those canonical URLs inside this transaction;
--   6. upsert of every candidate, with the same field semantics as the current
--      service toRow() (row id, created_at and all inspection/sitemap evidence
--      are preserved by ON CONFLICT DO UPDATE). Retirement is idempotent: an
--      already-retired key, or an absent key that never had a canonical, is a
--      valid steady state and is retired again as a no-op;
--   7. retirement details: eligible=false, reason_code=MISSING_REQUIRED_SOURCE,
--      canonical_url archived into run metadata then set to NULL, canonical_path
--      retained, pending sitemap/inspection stopped. Rows are never deleted and
--      never renamed;
--   8. run finalization with the summary, the snapshot fingerprint and the
--      retired keys/original canonicals.
--
-- It does not touch the public site, the sitemap, robots, RLS, the unique index,
-- the CHECK constraints, or any Google integration. It is not a general-purpose
-- write RPC: the payload shape is a closed allowlist and every column it can
-- write is fixed in this file.
--
-- EXECUTION: service_role only. The tables already REVOKE ALL from PUBLIC, anon
-- and authenticated (20260906000000), so service_role holds the needed rights and
-- SECURITY INVOKER is sufficient — no privilege escalation.
-- NOTE ON source_version: it is an opaque, DB-owned hash persisted on the row.
-- The value is produced here by public.search_visibility_source_version(), a
-- stable IMMUTABLE helper hashing the text of a JSON *array* of normalised parts
-- (see the helper below). The application treats whatever this function returns
-- as opaque: it reads the persisted source_version back and hands it to this RPC
-- in p_registry, so no TypeScript caller needs to reproduce the hash.
--
-- NOTE ON metadata: p_summary is merged at the TOP level of run metadata, so the
-- caller's {summary, debugSourceCounts} keeps the exact shape existing readers
-- expect. This RPC's own result is nested under the reserved key
-- `snapshotReconcile` and is applied last, so it cannot be overwritten.
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Stable, DB-owned source_version hash.
--
-- The preimage is the text of a JSON *array* of already-normalised parts, hashed
-- with sha256. An array (not an object) is used deliberately: jsonb preserves
-- array element order, so the encoding is deterministic, while jsonb *object*
-- key order is not guaranteed and jsonb::text additionally inserts spaces — which
-- is why a jsonb object hash could never be stable or comparable.
--
-- Each part is normalised so that distinct inputs can never produce the same:
--   * NULL          -> SQL NULL, which jsonb renders as JSON null (distinct from
--                      the JSON string "null" and from the empty string);
--   * timestamp     -> epoch microseconds, an integer with no timezone or
--                      DateStyle dependency (timestamptz::text is NOT immutable:
--                      it follows the session TimeZone);
--   * eligible      -> jsonb boolean true/false;
--   * long text     -> md5 digest, so an unbounded reason_detail can never make
--                      the preimage size unpredictable.
--
-- IMMUTABLE is accurate here: every operator used (jsonb_build_array, ->,
-- md5, sha256, convert_to, encode) is immutable, and no text rendering of a
-- timestamp is involved.
--
-- The application must treat the result as opaque: read the persisted value and
-- pass it back in p_registry. It never needs to recompute it.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_visibility_source_version(
  p_source_key text,
  p_canonical_path text,
  p_eligible boolean,
  p_reason_code text,
  p_reason_detail text,
  p_content_updated_at timestamptz
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT encode(
    sha256(
      convert_to(
        jsonb_build_array(
          p_source_key,
          p_canonical_path,
          p_eligible,
          p_reason_code,
          CASE WHEN p_reason_detail IS NULL THEN NULL ELSE md5(p_reason_detail) END,
          CASE WHEN p_content_updated_at IS NULL THEN NULL
               ELSE (extract(epoch FROM p_content_updated_at) * 1000000)::bigint END
        )::text,
        'UTF8'
      )
    ),
    'hex'
  );
$$;

-- Opaque to the application; not a browser-callable surface.
REVOKE ALL ON FUNCTION public.search_visibility_source_version(text, text, boolean, text, text, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_visibility_source_version(text, text, boolean, text, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_search_visibility_snapshot(
  p_run_id uuid,
  p_candidates jsonb,
  p_registry jsonb,
  p_snapshot_fingerprint text,
  p_summary jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Payload bounds. These cap the work one call can do, whatever the caller sends.
  c_max_candidates   constant integer := 20000;
  c_max_registry     constant integer := 20000;
  c_max_retired      constant integer := 5000;
  c_max_url          constant integer := 512;
  c_max_text         constant integer := 512;
  c_max_detail       constant integer := 1000;
  c_max_key          constant integer := 256;
  c_max_fingerprint  constant integer := 128;
  c_max_summary      constant integer := 20000;
  c_origin           constant text := 'https://chonhaviet.com';
  c_canonical_regex  constant text := '^https://chonhaviet\.com/[A-Za-z0-9/_-]*$';
  c_path_regex       constant text := '^/[A-Za-z0-9/_-]*$';

  v_role          text;
  v_run           record;
  v_live          jsonb;
  v_candidate_cnt integer;
  v_registry_cnt  integer;
  v_now           timestamptz := now();
  v_stale         text;
  v_conflict      text;
  v_retired       jsonb;
  v_retired_cnt   integer;
  v_upserted      integer;
  v_metadata      jsonb;
BEGIN
  -- ---------------------------------------------------------------------------
  -- 0. Caller must be the server.
  -- ---------------------------------------------------------------------------
  v_role := coalesce(auth.role(), '');
  IF v_role <> 'service_role' THEN
    RAISE EXCEPTION 'SV_RECONCILE_FORBIDDEN: service_role required' USING ERRCODE = '42501';
  END IF;

  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: run id is required' USING ERRCODE = '22023';
  END IF;
  IF p_snapshot_fingerprint IS NULL OR btrim(p_snapshot_fingerprint) = '' THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: snapshot fingerprint is required' USING ERRCODE = '22023';
  END IF;
  IF length(p_snapshot_fingerprint) > c_max_fingerprint THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: snapshot fingerprint too long' USING ERRCODE = '22023';
  END IF;
  -- Bound the summary before it is copied verbatim into run metadata.
  IF p_summary IS NOT NULL AND length(p_summary::text) > c_max_summary THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: summary too large' USING ERRCODE = '22023';
  END IF;

  -- Everything below is one atomic unit. The advisory lock serializes every
  -- registry writer (this RPC is the only one), so the fence check, the stale
  -- snapshot comparison, the upserts, the retirements and the finalization cannot
  -- interleave with another run — which is what makes "an older run can never
  -- write after a newer one" enforceable rather than best-effort.
  PERFORM pg_advisory_xact_lock(hashtextextended('search-visibility-reconcile', 0));

  -- ---------------------------------------------------------------------------
  -- 1. Run eligibility.
  -- ---------------------------------------------------------------------------
  SELECT id, run_type, status, actor_id, started_at, metadata
  INTO v_run
  FROM public.search_visibility_runs
  WHERE id = p_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'SV_RECONCILE_RUN: run not found' USING ERRCODE = 'P0002';
  END IF;
  IF v_run.run_type <> 'eligibility_sync' THEN
    RAISE EXCEPTION 'SV_RECONCILE_RUN: run is not an eligibility sync' USING ERRCODE = '22023';
  END IF;
  IF v_run.status <> 'running' THEN
    RAISE EXCEPTION 'SV_RECONCILE_RUN: run is not running' USING ERRCODE = 'P0002';
  END IF;
  -- actor_id records the initiating owner; the server uses service_role for both
  -- owner and cron runs, so caller identity is the role checked above, not actor_id.

  -- ---------------------------------------------------------------------------
  -- 2. Fence: a newer eligibility run that is running or already succeeded wins.
  --    Ordering is by the DB stored started_at then id — never a client clock.
  -- ---------------------------------------------------------------------------
  IF EXISTS (
    SELECT 1
    FROM public.search_visibility_runs r
    WHERE r.run_type = 'eligibility_sync'
      AND r.id <> p_run_id
      AND r.status IN ('running', 'succeeded')
      AND (r.started_at, r.id) > (v_run.started_at, p_run_id)
  ) THEN
    RAISE EXCEPTION 'SV_RECONCILE_SUPERSEDED: a newer eligibility run already owns the registry'
      USING ERRCODE = 'P0002';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 3. Payload validation — before any mutation.
  -- ---------------------------------------------------------------------------
  IF p_candidates IS NULL OR jsonb_typeof(p_candidates) <> 'array' THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: candidates must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF p_registry IS NULL OR jsonb_typeof(p_registry) <> 'array' THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: registry must be a JSON array' USING ERRCODE = '22023';
  END IF;
  IF p_summary IS NOT NULL AND jsonb_typeof(p_summary) <> 'object' THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: summary must be a JSON object' USING ERRCODE = '22023';
  END IF;

  v_candidate_cnt := jsonb_array_length(p_candidates);
  v_registry_cnt  := jsonb_array_length(p_registry);
  IF v_candidate_cnt > c_max_candidates THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: too many candidates' USING ERRCODE = '22023';
  END IF;
  IF v_registry_cnt > c_max_registry THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: registry snapshot too large' USING ERRCODE = '22023';
  END IF;

  -- Duplicate source keys inside one payload would make the upsert
  -- "ON CONFLICT DO UPDATE command cannot affect row a second time" fail.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_candidates) AS item(row)
    GROUP BY item.row->>'source_key' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: duplicate candidate source key' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_registry) AS item(row)
    GROUP BY item.row->>'source_key' HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: duplicate registry source key' USING ERRCODE = '22023';
  END IF;

  -- Closed allowlist per candidate row: only these keys may appear, no null key
  -- sets. Anything else (an extra column, a missing key, a wrong type) is refused
  -- rather than silently dropped. Asserted directly — a nullable marker variable
  -- would silently accept a malformed row that selects NULL.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_candidates) AS item(row)
    WHERE jsonb_typeof(item.row) <> 'object'
       OR NOT (item.row ?& ARRAY[
            'source_key', 'entity_type', 'entity_id', 'canonical_url',
            'canonical_path', 'eligible', 'reason_code', 'reason_detail',
            'content_updated_at'
          ])
       OR item.row - ARRAY[
            'source_key', 'entity_type', 'entity_id', 'canonical_url',
            'canonical_path', 'eligible', 'reason_code', 'reason_detail',
            'content_updated_at'
          ] <> '{}'::jsonb
       OR jsonb_typeof(item.row->'source_key') <> 'string'
       OR jsonb_typeof(item.row->'entity_type') <> 'string'
       OR jsonb_typeof(item.row->'canonical_url') NOT IN ('string', 'null')
       OR jsonb_typeof(item.row->'canonical_path') NOT IN ('string', 'null')
       OR jsonb_typeof(item.row->'reason_code') <> 'string'
       OR jsonb_typeof(item.row->'reason_detail') NOT IN ('string', 'null')
       OR jsonb_typeof(item.row->'entity_id') NOT IN ('string', 'null')
       OR jsonb_typeof(item.row->'content_updated_at') NOT IN ('string', 'null')
       OR jsonb_typeof(item.row->'eligible') <> 'boolean'
  ) THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: candidate row shape not allowlisted' USING ERRCODE = '22023';
  END IF;

  -- Field-level allowlist: the same policy the service validates before writing,
  -- plus the canonical origin||path relationship the service enforces through
  -- canonicalAuditUrl(). Checking each field independently is not enough: a
  -- regex-valid url and a regex-valid path could still describe different pages,
  -- so the two must be tied together explicitly.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_candidates) AS item(row)
    WHERE (item.row->>'source_key') !~ '^[a-z_]+:[A-Za-z0-9:_-]{1,240}$'
       OR length(item.row->>'source_key') > c_max_key
       OR (item.row->>'entity_type') NOT IN (
            'static', 'property', 'news', 'area', 'area_listing',
            'neighborhood', 'property_type', 'news_category', 'managed_page'
          )
       OR (item.row->>'reason_code') NOT IN (
            'ELIGIBLE', 'INACTIVE_PROPERTY', 'UNPUBLISHED_NEWS',
            'QUALITY_GATE_FAILED', 'MISSING_REQUIRED_SOURCE', 'UNSUPPORTED_ENTITY'
          )
       OR length(coalesce(item.row->>'canonical_url', '')) > c_max_url
       OR length(coalesce(item.row->>'canonical_path', '')) > c_max_url
       OR length(coalesce(item.row->>'reason_detail', '')) > c_max_detail
       OR length(coalesce(item.row->>'entity_id', '')) > c_max_text
       OR (item.row->>'canonical_url') IS NOT NULL
          AND (item.row->>'canonical_url') !~ c_canonical_regex
       OR (item.row->>'canonical_path') IS NOT NULL
          AND ((item.row->>'canonical_path') !~ c_path_regex
               OR (item.row->>'canonical_path') LIKE '%//%')
       -- url and path must describe the same page: url = origin || path, both
       -- present or both absent.
       OR (item.row->>'canonical_url') IS DISTINCT FROM (
            CASE WHEN (item.row->>'canonical_path') IS NULL THEN NULL
                 ELSE c_origin || (item.row->>'canonical_path') END
          )
  ) THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: candidate value outside allowlist' USING ERRCODE = '22023';
  END IF;

  -- Eligibility shape must match search_visibility_url_eligibility_shape, so a
  -- bad payload fails here with a clear code instead of a CHECK violation.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_candidates) AS item(row)
    WHERE (item.row->>'eligible') = 'true'
      AND ((item.row->>'reason_code') <> 'ELIGIBLE'
           OR (item.row->>'canonical_path') IS NULL
           OR (item.row->>'canonical_url') IS NULL)
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_candidates) AS item(row)
    WHERE (item.row->>'eligible') = 'false'
      AND (item.row->>'reason_code') = 'ELIGIBLE'
  ) THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: eligibility shape invalid' USING ERRCODE = '22023';
  END IF;

  -- Registry snapshot rows: source_key + canonical_url + source_version + eligible.
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_registry) AS item(row)
    WHERE jsonb_typeof(item.row) <> 'object'
       OR NOT (item.row ?& ARRAY['source_key', 'canonical_url', 'source_version', 'eligible'])
       OR item.row - ARRAY['source_key', 'canonical_url', 'source_version', 'eligible'] <> '{}'::jsonb
       OR jsonb_typeof(item.row->'source_key') <> 'string'
       OR jsonb_typeof(item.row->'canonical_url') NOT IN ('string', 'null')
       OR jsonb_typeof(item.row->'source_version') <> 'string'
       OR jsonb_typeof(item.row->'eligible') <> 'boolean'
       OR length(item.row->>'source_key') > c_max_key
       OR length(item.row->>'source_version') > c_max_key
       OR length(coalesce(item.row->>'canonical_url', '')) > c_max_url
  ) THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: registry row shape not allowlisted' USING ERRCODE = '22023';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 4. Stale-read detection: the caller's expected registry must still be current.
  --    Compares only the columns the client actually saw, and compares NULLs as
  --    equal so an eligible row missing its canonical_url is still detectable.
  -- ---------------------------------------------------------------------------
  SELECT jsonb_agg(jsonb_build_object(
           'source_key', u.source_key,
           'canonical_url', u.canonical_url,
           'source_version', u.source_version,
           'eligible', u.eligible
         ) ORDER BY u.source_key)
  INTO v_live
  FROM public.search_visibility_urls u;

  IF coalesce(v_live, '[]'::jsonb) IS DISTINCT FROM coalesce(
       (SELECT jsonb_agg(entry.row ORDER BY entry.row->>'source_key')
        FROM jsonb_array_elements(p_registry) AS entry(row)),
       '[]'::jsonb
     ) THEN
    RAISE EXCEPTION 'SV_RECONCILE_STALE_REGISTRY: registry changed since the snapshot was read'
      USING ERRCODE = '54000';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 5. Identify the retiring set FIRST: absent from candidates, inside the
  --    locality namespaces only. Everything below depends on knowing exactly
  --    which rows are leaving the registry.
  --    A retired row keeps its id, history and evidence; it loses its canonical
  --    URL (archived into the run metadata) and its pending work. An absent row
  --    that is already ineligible with no canonical_url is a valid steady state
  --    (a previous retirement, or a key that never had a canonical) — it is
  --    retired again as a no-op rather than treated as an error, so this RPC is
  --    idempotent under repetition.
  -- ---------------------------------------------------------------------------
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'source_key', r.source_key,
           'canonical_url', r.canonical_url
         ) ORDER BY r.source_key), '[]'::jsonb)
  INTO v_retired
  FROM public.search_visibility_urls r
  -- The namespace test must be an exact split, NOT a LIKE pattern: the '_' in
  -- 'area_listing:%' and 'locality_news:%' is a single-character wildcard, so a
  -- LIKE would also match e.g. 'areaXlisting:...'. split_part on the first colon
  -- compares the namespace literally.
  WHERE split_part(r.source_key, ':', 1) IN ('area', 'area_listing', 'locality_news')
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_candidates) AS item(row)
      WHERE item.row->>'source_key' = r.source_key
    );

  v_retired_cnt := jsonb_array_length(v_retired);
  IF v_retired_cnt > c_max_retired THEN
    RAISE EXCEPTION 'SV_RECONCILE_PAYLOAD: too many retiring keys' USING ERRCODE = '22023';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 6. Canonical conflict validation, under the lock, before writing.
  --
  --    A canonical_url may be claimed by at most one source_key — but a retiring
  --    key is on its way out and is about to release its URL, so it must NOT be
  --    counted against the candidate that is legitimately taking that URL over
  --    (the expected locality restructure: old area_listing:/area: path key
  --    retires, new candidate claims its canonical). Every other claimant still
  --    counts, so a genuine clash with an active row or another namespace is
  --    still rejected exactly as before.
  -- ---------------------------------------------------------------------------
  WITH retiring AS (
    SELECT value->>'source_key' AS source_key
    FROM jsonb_array_elements(v_retired) AS value
  ), claimed AS (
    SELECT u.canonical_url, u.source_key
    FROM public.search_visibility_urls u
    WHERE u.canonical_url IS NOT NULL
      AND u.source_key NOT IN (SELECT ret.source_key FROM retiring ret)
    UNION ALL
    SELECT item.row->>'canonical_url', item.row->>'source_key'
    FROM jsonb_array_elements(p_candidates) AS item(row)
    WHERE item.row->>'canonical_url' IS NOT NULL
  )
  SELECT string_agg(DISTINCT c.canonical_url, '; ')
  INTO v_conflict
  FROM claimed c
  GROUP BY c.canonical_url
  HAVING count(DISTINCT c.source_key) > 1;

  IF v_conflict IS NOT NULL THEN
    RAISE EXCEPTION 'SV_RECONCILE_CANONICAL_CONFLICT: canonical url claimed by several source keys: %',
      left(v_conflict, 400) USING ERRCODE = '23505';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 7. Retire BEFORE the candidate upsert. Order matters: a retiring key must
  --    release its canonical_url in this transaction before the candidate that
  --    inherits that URL is inserted, otherwise the partial unique index rejects
  --    the handover. Doing it in one transaction means a failure later rolls the
  --    release back, so the registry is never left with the URL owned by nobody.
  --
  --    History is PRESERVED, not wiped. This UPDATE only stops future work and
  --    releases the URL; every historical evidence column is left untouched:
  --    last_sitemap_submission_at, sitemap_submission_fingerprint, sitemap_error,
  --    inspection_error, last_inspected_at, google_* verdicts, inspection_evidence
  --    and evidence_observed_at all keep their values. Clearing them would erase
  --    the audit trail of what was submitted and observed while the key was live.
  -- ---------------------------------------------------------------------------
  IF v_retired_cnt > 0 THEN
    UPDATE public.search_visibility_urls AS target
    SET eligible = false,
        reason_code = 'MISSING_REQUIRED_SOURCE',
        reason_detail = 'Nguồn public không còn được kiểm tra trong lượt đồng bộ này (khóa đã ngừng tồn tại).',
        canonical_url = NULL,
        -- Status/queue fields only: stop this key from being picked up again.
        sitemap_status = 'not_needed',
        inspection_status = 'not_requested',
        inspection_priority = 0,
        next_inspection_at = NULL,
        evaluated_at = v_now,
        updated_at = v_now
    WHERE target.source_key IN (
      SELECT value->>'source_key'
      FROM jsonb_array_elements(v_retired) AS value
    );
  END IF;

  -- ---------------------------------------------------------------------------
  -- 8. Upsert candidates. ON CONFLICT (source_key) DO UPDATE reuses the existing
  --    row, so id, created_at and every inspection/sitemap/evidence column is
  --    preserved — the update list below is the complete set of columns this RPC
  --    can write, matching the service toRow() semantics.
  -- ---------------------------------------------------------------------------
  -- A data-modifying CTE, not a sub-select: PostgreSQL does not accept
  -- INSERT ... RETURNING inside a FROM sub-query, so the count is taken from the
  -- CTE that owns the write.
  WITH upserted AS (
    INSERT INTO public.search_visibility_urls AS target (
      source_key, entity_type, entity_id, canonical_url, canonical_path,
      eligible, reason_code, reason_detail, content_updated_at,
      evaluated_at, source_version, updated_at
    )
    SELECT
      item.row->>'source_key',
      item.row->>'entity_type',
      item.row->>'entity_id',
      item.row->>'canonical_url',
      item.row->>'canonical_path',
      (item.row->>'eligible')::boolean,
      item.row->>'reason_code',
      item.row->>'reason_detail',
      (item.row->>'content_updated_at')::timestamptz,
      v_now,
      -- Opaque DB-owned hash. Stable and consistent for identical inputs; the
      -- application stores it and hands it back in p_registry unchanged.
      public.search_visibility_source_version(
        item.row->>'source_key',
        item.row->>'canonical_path',
        (item.row->>'eligible')::boolean,
        item.row->>'reason_code',
        item.row->>'reason_detail',
        (item.row->>'content_updated_at')::timestamptz
      ),
      v_now
    FROM jsonb_array_elements(p_candidates) AS item(row)
    ON CONFLICT (source_key) DO UPDATE SET
      entity_type = EXCLUDED.entity_type,
      entity_id = EXCLUDED.entity_id,
      canonical_url = EXCLUDED.canonical_url,
      canonical_path = EXCLUDED.canonical_path,
      eligible = EXCLUDED.eligible,
      reason_code = EXCLUDED.reason_code,
      reason_detail = EXCLUDED.reason_detail,
      content_updated_at = EXCLUDED.content_updated_at,
      evaluated_at = EXCLUDED.evaluated_at,
      source_version = EXCLUDED.source_version,
      updated_at = EXCLUDED.updated_at
    RETURNING target.source_key
  )
  SELECT count(*) INTO v_upserted FROM upserted;

  -- ---------------------------------------------------------------------------
  -- 9. Finalize the run in the same transaction.
  --
  --    Metadata keeps the EXACT shape the service already writes: p_summary is
  --    merged at the TOP level (the caller sends {summary, debugSourceCounts}),
  --    so `metadata.summary` and `metadata.debugSourceCounts` stay where existing
  --    readers expect them. The reconciliation's own fields live under reserved
  --    `snapshotReconcile` keys, applied AFTER the merge, so a caller-supplied
  --    key of the same name can never overwrite an authoritative record of what
  --    this transaction actually retired.
  -- ---------------------------------------------------------------------------
  v_metadata := coalesce(v_run.metadata, '{}'::jsonb)
    || coalesce(p_summary, '{}'::jsonb)
    || jsonb_build_object(
         'snapshotReconcile',
         jsonb_build_object(
           'snapshotFingerprint', p_snapshot_fingerprint,
           'retiredKeys', v_retired,
           'retiredCanonicals', v_retired,
           'retiredCount', v_retired_cnt,
           'upsertedCount', v_upserted,
           'reconciledBy', 'reconcile_search_visibility_snapshot'
         )
       );

  UPDATE public.search_visibility_runs
  SET status = 'succeeded',
      requested_count = v_candidate_cnt,
      processed_count = v_candidate_cnt,
      succeeded_count = v_candidate_cnt,
      deferred_count = 0,
      failed_count = 0,
      error_summary = NULL,
      metadata = v_metadata,
      finished_at = v_now
  WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'runId', p_run_id,
    'status', 'succeeded',
    'candidateCount', v_candidate_cnt,
    'upsertedCount', v_upserted,
    'retiredCount', v_retired_cnt,
    'retiredKeys', v_retired,
    'snapshotFingerprint', p_snapshot_fingerprint,
    'finishedAt', v_now
  );
END;
$$;

COMMENT ON FUNCTION public.reconcile_search_visibility_snapshot(uuid, jsonb, jsonb, text, jsonb) IS
'Atomic Search Visibility registry reconciliation. service_role only; call after all public source reads, with the full expected registry snapshot. Merges p_summary at the top level of run metadata (preserving metadata.summary/debugSourceCounts) and records its own result under metadata.snapshotReconcile. Retires only absent area:/area_listing:/locality_news: keys, identified by exact namespace split. Production SQL is run by the user.';

-- Server-only. The underlying tables already deny every browser role, and this
-- function is SECURITY INVOKER with no elevated rights, so execution is limited
-- to the role that already owns the writes.
REVOKE ALL ON FUNCTION public.reconcile_search_visibility_snapshot(uuid, jsonb, jsonb, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_search_visibility_snapshot(uuid, jsonb, jsonb, text, jsonb) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
