/**
 * OFFLINE / SOURCE-LEVEL TESTS — NOT RUNTIME DATABASE TESTS.
 *
 * These tests read the reconciliation migration as text and assert its contract.
 * They do NOT connect to PostgreSQL, do NOT run the RPC, and cannot prove runtime
 * behaviour (lock ordering, actual SQLSTATE values, real constraint interaction).
 * Those must be confirmed by the manual preflight/dry-run on a real database,
 * which the owner runs separately.
 *
 * What they can prove: the file exists with the agreed signature, stays
 * server-only, keeps the mutation surface closed and allowlisted, and does not
 * disturb the existing schema objects it must not touch.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MIGRATION_PATH = 'supabase/migrations/20261011010000_search_visibility_registry_reconcile.sql';

const migration = readFileSync(resolve(process.cwd(), MIGRATION_PATH), 'utf8');

const SIGNATURE = 'public.reconcile_search_visibility_snapshot(uuid, jsonb, jsonb, text, jsonb)';

const CANDIDATE_FIELDS = [
  'source_key',
  'entity_type',
  'entity_id',
  'canonical_url',
  'canonical_path',
  'eligible',
  'reason_code',
  'reason_detail',
  'content_updated_at',
] as const;

describe('search visibility registry reconcile migration (offline source checks)', () => {
  it('declares the agreed RPC contract', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.reconcile_search_visibility_snapshot(');
    expect(migration).toContain('p_run_id uuid,');
    expect(migration).toContain('p_candidates jsonb,');
    expect(migration).toContain('p_registry jsonb,');
    expect(migration).toContain('p_snapshot_fingerprint text,');
    expect(migration).toContain('p_summary jsonb');
    expect(migration).toContain('RETURNS jsonb');
    expect(migration).toContain('RETURN jsonb_build_object(');
    // Deterministic search path, and no privilege escalation: the audit tables
    // already deny anon/authenticated, so the server role's own rights suffice.
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain('SECURITY INVOKER');
    expect(migration).not.toContain('SECURITY DEFINER');
  });

  it('is executable by service_role only', () => {
    expect(migration).toContain("v_role := coalesce(auth.role(), '');");
    expect(migration).toContain("IF v_role <> 'service_role' THEN");
    expect(migration).toContain("USING ERRCODE = '42501'");
    expect(migration).toContain('REVOKE ALL ON FUNCTION ' + SIGNATURE + ' FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION ' + SIGNATURE + ' TO service_role;');
    // The grant must never reach a browser role.
    expect(migration).not.toContain('TO anon, authenticated');
    expect(migration).not.toContain('TO authenticated, anon');
  });

  it('accepts server-created owner runs without requiring a user JWT on service-role calls', () => {
    expect(migration).not.toContain('auth.uid()');
    expect(migration).toContain("IF v_role <> 'service_role' THEN");
    expect(migration).toContain("v_run.status <> 'running'");
  });

  it('serializes writers and fences older runs against newer ones', () => {
    expect(migration).toContain(
      "PERFORM pg_advisory_xact_lock(hashtextextended('search-visibility-reconcile', 0));",
    );
    // Eligibility of the run itself.
    expect(migration).toContain("v_run.run_type <> 'eligibility_sync'");
    expect(migration).toContain("v_run.status <> 'running'");
    // Fence ordering uses the DB stored started_at plus id, never a client clock.
    expect(migration).toContain("r.status IN ('running', 'succeeded')");
    expect(migration).toContain('(r.started_at, r.id) > (v_run.started_at, p_run_id)');
    expect(migration).toContain("USING ERRCODE = 'P0002'");
    // The advisory lock must be taken before the run is read, so the fence check
    // and the writes it guards are in the same serialized region.
    const lockAt = migration.indexOf("pg_advisory_xact_lock(hashtextextended('search-visibility-reconcile'");
    const fenceAt = migration.indexOf('(r.started_at, r.id) > (v_run.started_at, p_run_id)');
    expect(lockAt).toBeGreaterThan(-1);
    expect(fenceAt).toBeGreaterThan(lockAt);
  });

  it('rejects a stale registry snapshot with a distinct SQLSTATE and no partial write', () => {
    expect(migration).toContain('SV_RECONCILE_STALE_REGISTRY');
    expect(migration).toContain("USING ERRCODE = '54000'");
    // The snapshot comparison covers the four expected columns and orders both
    // sides deterministically, so comparison is not order-sensitive.
    expect(migration).toContain("'source_version', u.source_version");
    expect(migration).toContain("'eligible', u.eligible");
    expect(migration).toContain('ORDER BY u.source_key');
    expect(migration).toContain("ORDER BY entry.row->>'source_key'");
    // Compared before any INSERT/UPDATE reaches the registry.
    const staleAt = migration.indexOf('SV_RECONCILE_STALE_REGISTRY');
    const firstInsertAt = migration.indexOf('INSERT INTO public.search_visibility_urls AS target');
    expect(staleAt).toBeGreaterThan(-1);
    expect(firstInsertAt).toBeGreaterThan(staleAt);
  });

  it('validates canonical conflicts before writing and leaves the unique index alone', () => {
    expect(migration).toContain('SV_RECONCILE_CANONICAL_CONFLICT');
    expect(migration).toContain("HAVING count(DISTINCT c.source_key) > 1");
    expect(migration).toContain("USING ERRCODE = '23505'");
    const conflictAt = migration.indexOf('SV_RECONCILE_CANONICAL_CONFLICT');
    const firstInsertAt = migration.indexOf('INSERT INTO public.search_visibility_urls AS target');
    expect(conflictAt).toBeGreaterThan(-1);
    expect(firstInsertAt).toBeGreaterThan(conflictAt);
    // Conflict detection spans live rows in every namespace plus the candidates.
    expect(migration).toContain('FROM public.search_visibility_urls u');
    expect(migration).toContain('WHERE u.canonical_url IS NOT NULL');
    // Never drops or disables the unique index.
    expect(migration).not.toContain('DROP INDEX');
    expect(migration).not.toContain('search_visibility_urls_canonical_url_unique');
  });

  it('lets a retiring key hand its canonical url over to a candidate', () => {
    // Regression: a canonical URL claimed by BOTH a retiring key and a candidate
    // was reported as a conflict, so the legitimate locality restructure (old
    // path key retires, new key claims the URL) could never be applied. A
    // retiring key is about to release its URL, so it must not count as a
    // claimant — every other claimant still does.
    const conflictBlock = migration.slice(
      migration.indexOf('WITH retiring AS ('),
      migration.indexOf('SV_RECONCILE_CANONICAL_CONFLICT'),
    );
    expect(conflictBlock).toContain('u.source_key NOT IN (SELECT ret.source_key FROM retiring ret)');
    // The exclusion is scoped to exactly the retiring set, computed from the
    // retirement list — not a blanket namespace exemption.
    expect(conflictBlock).toContain("SELECT value->>'source_key' AS source_key");
    expect(conflictBlock).toContain('FROM jsonb_array_elements(v_retired) AS value');
    // Only locality-namespace keys can ever enter that set.
    const retireSetQuery = migration.slice(
      migration.indexOf('INTO v_retired'),
      migration.indexOf('v_retired_cnt := jsonb_array_length(v_retired);'),
    );
    expect(retireSetQuery).toContain("split_part(r.source_key, ':', 1)");
    expect(retireSetQuery).toContain("IN ('area', 'area_listing', 'locality_news')");
  });

  it('retires before upserting so the URL is free when the candidate claims it', () => {
    // Ordering is load-bearing: releasing the URL after the candidate insert
    // would fail the partial unique index, and releasing it outside the
    // transaction could leave the URL owned by nobody.
    const conflictAt = migration.indexOf('SV_RECONCILE_CANONICAL_CONFLICT');
    const retireAt = migration.indexOf('-- 7. Retire BEFORE the candidate upsert');
    const upsertAt = migration.indexOf('INSERT INTO public.search_visibility_urls AS target');
    const finalizeAt = migration.indexOf('UPDATE public.search_visibility_runs');
    const commitAt = migration.indexOf('\nCOMMIT;');
    expect(conflictAt).toBeGreaterThan(-1);
    expect(retireAt).toBeGreaterThan(conflictAt);
    expect(upsertAt).toBeGreaterThan(retireAt);
    expect(finalizeAt).toBeGreaterThan(upsertAt);
    expect(commitAt).toBeGreaterThan(finalizeAt);
    // A retirement UPDATE exists and is not the last write before COMMIT, so a
    // later failure rolls the release back with everything else.
    expect(migration.slice(retireAt, upsertAt)).toContain('UPDATE public.search_visibility_urls AS target');
  });

  it('bounds and allowlists the payload before mutating anything', () => {
    expect(migration).toContain("jsonb_typeof(p_candidates) <> 'array'");
    expect(migration).toContain("jsonb_typeof(p_registry) <> 'array'");
    expect(migration).toContain("jsonb_typeof(p_summary) <> 'object'");
    expect(migration).toContain('SV_RECONCILE_PAYLOAD');
    // Caps.
    expect(migration).toContain('c_max_candidates   constant integer := 20000;');
    expect(migration).toContain('c_max_registry     constant integer := 20000;');
    expect(migration).toContain('c_max_retired      constant integer := 5000;');
    // Duplicates rejected for both payload arrays.
    expect(migration).toContain('duplicate candidate source key');
    expect(migration).toContain('duplicate registry source key');
    expect(migration).toContain('GROUP BY item.row->>\'source_key\' HAVING count(*) > 1');
    // Closed allowlist: every candidate field must be present and nothing extra.
    for (const field of CANDIDATE_FIELDS) {
      expect(migration).toContain(`'${field}'`);
    }
    expect(migration).toContain("item.row ?& ARRAY[");
    expect(migration).toContain("<> '{}'::jsonb");
    // The shape check must be a direct IF EXISTS: a nullable marker variable
    // silently accepts a malformed row that selects NULL.
    expect(migration).not.toContain('v_missing_shape');
    expect(migration).not.toContain('INTO v_missing_shape');
    // Field-level allowlist mirrors the service policy.
    expect(migration).toContain("(item.row->>'source_key') !~ '^[a-z_]+:[A-Za-z0-9:_-]{1,240}$'");
    expect(migration).toContain("c_canonical_regex  constant text := '^https://chonhaviet\\.com/[A-Za-z0-9/_-]*$';");
    expect(migration).toContain("c_path_regex       constant text := '^/[A-Za-z0-9/_-]*$';");
    expect(migration).toContain('eligibility shape invalid');
    // Malformed payload uses a distinct SQLSTATE, not the generic P0001.
    expect(migration).toContain("USING ERRCODE = '22023'");
  });

  it('ties canonical_url to origin || canonical_path instead of regex each alone', () => {
    // Regression: a regex-valid url and a regex-valid path can still describe
    // different pages. The two must be checked as a pair, and both present or
    // both absent — which the eligibility shape check does not cover for
    // ineligible candidates that legitimately carry a path.
    const fieldBlock = migration.slice(
      migration.indexOf('-- Field-level allowlist:'),
      migration.indexOf('eligibility shape invalid'),
    );
    expect(migration).toContain("c_origin           constant text := 'https://chonhaviet.com';");
    expect(fieldBlock).toContain("(item.row->>'canonical_url') IS DISTINCT FROM (");
    expect(fieldBlock).toContain("c_origin || (item.row->>'canonical_path')");
    expect(fieldBlock).toContain("c_origin || (item.row->>'canonical_path')");
    // A NULL path must map to a NULL url, not to the bare origin.
    expect(fieldBlock).toContain("CASE WHEN (item.row->>'canonical_path') IS NULL THEN NULL");
  });

  it('bounds every promised field, including entity_id, key, fingerprint and summary', () => {
    expect(migration).toContain('c_max_key          constant integer := 256;');
    expect(migration).toContain('c_max_fingerprint  constant integer := 128;');
    expect(migration).toContain('c_max_summary      constant integer := 20000;');
    expect(migration).toContain("length(item.row->>'source_key') > c_max_key");
    expect(migration).toContain("length(coalesce(item.row->>'entity_id', '')) > c_max_text");
    expect(migration).toContain('length(p_snapshot_fingerprint) > c_max_fingerprint');
    expect(migration).toContain('length(p_summary::text) > c_max_summary');
    // Registry rows are bounded too, and reject unknown keys outright.
    expect(migration).toContain(
      "item.row - ARRAY['source_key', 'canonical_url', 'source_version', 'eligible'] <> '{}'::jsonb",
    );
    expect(migration).toContain("length(item.row->>'source_version') > c_max_key");
  });

  it('upserts every candidate with the same field semantics as the service toRow', () => {
    expect(migration).toContain('INSERT INTO public.search_visibility_urls AS target (');
    expect(migration).toContain('ON CONFLICT (source_key) DO UPDATE SET');
    // The update list must not touch identity, evidence or creation columns.
    const updateBlock = migration.slice(
      migration.indexOf('ON CONFLICT (source_key) DO UPDATE SET'),
      migration.indexOf('RETURNING target.source_key'),
    );
    for (const preserved of [
      'created_at',
      'inspection_evidence',
      'google_verdict',
      'inspection_status',
      'sitemap_status',
      'inspection_attempt_count',
      'evidence_observed_at',
    ]) {
      expect(updateBlock).not.toContain(preserved);
    }
    // Identity is preserved by construction: the conflict target is source_key
    // and the primary key is never part of the update list. (entity_id is a
    // derived field and is intentionally refreshed.)
    expect(updateBlock).not.toContain('source_key = EXCLUDED');
    expect(updateBlock).not.toMatch(/^\s*id = /m);
    expect(updateBlock).not.toContain('created_at =');
    // source_version comes from a stable, documented DB helper — never jsonb::text
    // and never a deliberately mismatching fallback.
    expect(migration).toContain('public.search_visibility_source_version(');
    expect(migration).not.toContain('sourceKey');
    expect(migration).not.toContain('unsupported-sha256-');
    expect(migration).not.toContain("'unsupported");
    expect(migration).not.toContain('md5(coalesce');
  });

  it('takes the upsert count from a data-modifying CTE, not a FROM sub-select', () => {
    // Regression: PostgreSQL rejects `SELECT ... FROM (INSERT ... RETURNING)`,
    // which is not valid syntax for a data-modifying statement.
    expect(migration).not.toContain('FROM (\n    INSERT INTO');
    expect(migration).not.toContain(') AS upserted;');
    expect(migration).toContain('WITH upserted AS (');
    expect(migration).toContain('SELECT count(*) INTO v_upserted FROM upserted;');
    // The CTE must close before the count is taken.
    const cteAt = migration.indexOf('WITH upserted AS (');
    const countAt = migration.indexOf('SELECT count(*) INTO v_upserted FROM upserted;');
    const returningAt = migration.indexOf('RETURNING target.source_key');
    expect(cteAt).toBeGreaterThan(-1);
    expect(returningAt).toBeGreaterThan(cteAt);
    expect(countAt).toBeGreaterThan(returningAt);
  });

  it('identifies locality namespaces by exact split, never by a LIKE wildcard', () => {
    // Regression: '_' is a single-character wildcard in LIKE, so
    // LIKE 'area_listing:%' also matches 'areaXlisting:...'.
    expect(migration).not.toContain("LIKE 'area");
    expect(migration).not.toContain("LIKE 'locality");
    expect(migration).toContain(
      "split_part(r.source_key, ':', 1) IN ('area', 'area_listing', 'locality_news')",
    );
  });

  it('hashes source_version from a normalised JSON array preimage', () => {
    const helperBlock = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.search_visibility_source_version('),
      migration.indexOf('REVOKE ALL ON FUNCTION public.search_visibility_source_version'),
    );
    // Immutable and schema-pinned, so the value cannot drift with the caller.
    expect(helperBlock).toContain('IMMUTABLE');
    expect(helperBlock).toContain('SET search_path = public, pg_temp');
    expect(helperBlock).toContain('sha256(');
    expect(helperBlock).toContain("'hex'");
    expect(helperBlock).toContain("convert_to(");
    expect(helperBlock).toContain('jsonb_build_array(');
    // An ARRAY, not an object: jsonb preserves array order, so the encoding is
    // deterministic; jsonb object key order is not guaranteed.
    expect(helperBlock).not.toContain('jsonb_build_object(');
    // Eligible is a real jsonb boolean, not text.
    expect(helperBlock).toContain('p_eligible,');
    // Timestamp is normalised to an integer with no timezone/DateStyle
    // dependency — timestamptz::text is NOT immutable (it follows TimeZone).
    expect(helperBlock).toContain('extract(epoch FROM p_content_updated_at)');
    expect(helperBlock).toContain('::bigint');
    expect(helperBlock).not.toContain('p_content_updated_at::text');
    // The '<null>' string sentinel is gone: it could collide with a real value.
    expect(helperBlock).not.toContain("'<null>'");
    expect(helperBlock).not.toContain('coalesce(p_reason_detail');
    // Long free text is digested, so the preimage size stays bounded.
    expect(helperBlock).toContain('md5(p_reason_detail)');
    // Opaque to the application: not reachable by a browser role.
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.search_visibility_source_version(text, text, boolean, text, text, timestamptz) FROM PUBLIC, anon, authenticated;',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.search_visibility_source_version(text, text, boolean, text, text, timestamptz) TO service_role;',
    );
  });

  it('retires only absent locality-namespace keys, idempotently, preserving history', () => {
    expect(migration).toContain("split_part(r.source_key, ':', 1) IN ('area', 'area_listing', 'locality_news')");
    // Only keys absent from the candidate set are retired.
    expect(migration).toContain('AND NOT EXISTS (');
    expect(migration).toContain("WHERE item.row->>'source_key' = r.source_key");
    // Required eligibility downgrade and the queue stop. Only status/queue
    // fields may change — historical evidence must survive.
    expect(migration).toContain("reason_code = 'MISSING_REQUIRED_SOURCE'");
    expect(migration).toContain('canonical_url = NULL,');
    expect(migration).toContain("sitemap_status = 'not_needed'");
    expect(migration).toContain("inspection_status = 'not_requested'");
    expect(migration).toContain('next_inspection_at = NULL,');
    // canonical_path is intentionally retained: the retirement block must not
    // clear it, and the function must never delete or rename a registry row.
    const retireBlock = migration.slice(
      migration.indexOf('-- 7. Retire BEFORE the candidate upsert'),
      migration.indexOf('-- 8. Upsert candidates'),
    );
    expect(retireBlock).not.toContain('canonical_path = NULL');
    expect(retireBlock).not.toContain('DELETE FROM');
    expect(migration).not.toContain('DELETE FROM public.search_visibility_urls');
    // Regression: an earlier revision wiped the audit trail on retirement.
    // Every historical evidence column must be left untouched. Scoped to the SET
    // clause, so the explanatory comment naming those columns is not counted.
    const retireSetClause = retireBlock.slice(
      retireBlock.indexOf('SET eligible = false,'),
      retireBlock.indexOf('WHERE target.source_key IN ('),
    );
    for (const preservedEvidence of [
      'last_sitemap_submission_at',
      'sitemap_submission_fingerprint',
      'sitemap_error',
      'inspection_error',
      'last_inspected_at',
      'google_verdict',
      'google_coverage_state',
      'inspection_evidence',
      'evidence_observed_at',
      'inspection_attempt_count',
    ]) {
      expect(retireSetClause).not.toContain(preservedEvidence);
    }
    // The status/queue fields it IS allowed to change are present.
    expect(retireSetClause).toContain("sitemap_status = 'not_needed',");
    expect(retireSetClause).toContain("inspection_status = 'not_requested',");
    expect(retireSetClause).toContain('next_inspection_at = NULL,');
  });

  it('retirement is idempotent — an already-retired key is a no-op, not an error', () => {
    // Regression: an earlier revision aborted when a retiring key had a NULL
    // canonical_url, which broke every repeat sync (and every absent key that
    // was never eligible). A NULL canonical is a valid steady state.
    expect(migration).not.toContain('SV_RECONCILE_RETIRE');
    expect(migration).not.toContain('v_bad_retire');
    expect(migration).not.toContain('retiring key has no canonical url to archive');
    // The retirement UPDATE is unconditional over the retiring set, so repeating
    // it changes nothing beyond re-stamping evaluated_at/updated_at.
    const retireBlock = migration.slice(
      migration.indexOf('-- 7. Retire BEFORE the candidate upsert'),
      migration.indexOf('-- 8. Upsert candidates'),
    );
    expect(retireBlock).toContain('UPDATE public.search_visibility_urls AS target');
    expect(retireBlock).not.toContain('IF EXISTS');
  });

  it('finalizes the run atomically, preserving the metadata shape the service writes', () => {
    expect(migration).toContain('UPDATE public.search_visibility_runs');
    expect(migration).toContain("status = 'succeeded',");
    // p_summary is merged at the TOP level — the service sends
    // {summary, debugSourceCounts} and existing readers expect exactly those keys
    // at the top of metadata. Nesting them under 'summary' would break that shape.
    expect(migration).toContain('|| coalesce(p_summary, \'{}\'::jsonb)');
    expect(migration).not.toContain("'summary', coalesce(p_summary");
    // The RPC's own result is nested under a reserved key applied AFTER the
    // merge, so a caller-supplied key of the same name cannot overwrite it.
    const mergeAt = migration.indexOf("|| coalesce(p_summary, '{}'::jsonb)");
    const reservedAt = migration.indexOf("'snapshotReconcile',");
    expect(mergeAt).toBeGreaterThan(-1);
    expect(reservedAt).toBeGreaterThan(mergeAt);
    expect(migration).toContain("'snapshotFingerprint', p_snapshot_fingerprint");
    expect(migration).toContain("'retiredCanonicals'");
    expect(migration).toContain("'retiredKeys', v_retired");
    // Retired canonical URLs are archived in the metadata *and* present in the
    // returned payload, so the caller can report what it released.
    expect(migration).toContain("'canonical_url', r.canonical_url");
    expect(migration).toContain('retiredCount');
    // The run update is part of the same transaction: no COMMIT before it.
    const finalizeAt = migration.indexOf('UPDATE public.search_visibility_runs');
    const commitAt = migration.indexOf('\nCOMMIT;');
    expect(finalizeAt).toBeGreaterThan(-1);
    expect(commitAt).toBeGreaterThan(finalizeAt);
    expect(migration.slice(0, finalizeAt)).not.toContain('COMMIT;');
  });

  it('does not alter existing schema objects, constraints, RLS or other migrations', () => {
    for (const forbidden of [
      'ALTER TABLE',
      'DROP TABLE',
      'DROP POLICY',
      'DROP CONSTRAINT',
      'CREATE POLICY',
      'SET NOT NULL',
      'CREATE UNIQUE INDEX',
      'CREATE TABLE',
    ]) {
      expect(migration).not.toContain(forbidden);
    }
    expect(migration).toContain('BEGIN;');
    expect(migration.trimEnd().endsWith('COMMIT;'));
  });

  it('is not a general-purpose write RPC', () => {
    // No dynamic SQL and no caller-supplied table or column name.
    expect(migration).not.toContain('EXECUTE format(');
    expect(migration).not.toMatch(/\bEXECUTE\s+[a-z_"']/);
    expect(migration).not.toContain('quote_ident');
    expect(migration).not.toContain('quote_literal');
    // The only tables it writes are the two audit tables.
    const writes = [...migration.matchAll(/(INSERT INTO|UPDATE) public\.([a-z_]+)/g)].map(
      match => match[2],
    );
    expect(new Set(writes)).toEqual(
      new Set(['search_visibility_urls', 'search_visibility_runs']),
    );
  });
});
