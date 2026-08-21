-- =============================================================================
-- Search Visibility foundation — additive, owner-only audit data
--
-- This migration does NOT contact Google, submit a sitemap, inspect URLs, schedule
-- work, alter public URLs, or change sitemap/indexability policy. It only creates
-- private audit storage for canonical eligibility and future evidence collection.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.search_visibility_urls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE CHECK (source_key ~ '^[a-z_]+:[A-Za-z0-9:_-]{1,240}$'),
  entity_type text NOT NULL CHECK (entity_type IN (
    'static', 'property', 'news', 'area', 'area_listing', 'neighborhood', 'news_category', 'managed_page'
  )),
  entity_id text,
  canonical_url text,
  canonical_path text,
  eligible boolean NOT NULL,
  reason_code text NOT NULL CHECK (reason_code IN (
    'ELIGIBLE', 'INACTIVE_PROPERTY', 'UNPUBLISHED_NEWS', 'QUALITY_GATE_FAILED', 'MISSING_REQUIRED_SOURCE', 'UNSUPPORTED_ENTITY'
  )),
  reason_detail text,
  content_updated_at timestamptz,
  source_version text NOT NULL,
  evaluated_at timestamptz NOT NULL DEFAULT now(),
  sitemap_status text NOT NULL DEFAULT 'not_needed' CHECK (sitemap_status IN ('not_needed', 'pending', 'submitted', 'error')),
  last_sitemap_submission_at timestamptz,
  sitemap_submission_fingerprint text,
  sitemap_error text,
  inspection_status text NOT NULL DEFAULT 'not_requested' CHECK (inspection_status IN ('not_requested', 'queued', 'inspected', 'deferred', 'error')),
  inspection_priority smallint NOT NULL DEFAULT 0 CHECK (inspection_priority BETWEEN 0 AND 100),
  next_inspection_at timestamptz,
  last_inspected_at timestamptz,
  inspection_attempt_count integer NOT NULL DEFAULT 0 CHECK (inspection_attempt_count >= 0),
  inspection_error text,
  google_verdict text,
  google_coverage_state text,
  google_canonical text,
  user_canonical text,
  google_robots_state text,
  google_last_crawl_at timestamptz,
  inspection_evidence jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(inspection_evidence) = 'object'),
  evidence_observed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT search_visibility_url_eligibility_shape CHECK (
    (eligible AND reason_code = 'ELIGIBLE' AND canonical_path IS NOT NULL AND canonical_url IS NOT NULL)
    OR (NOT eligible AND reason_code <> 'ELIGIBLE')
  ),
  CONSTRAINT search_visibility_url_public_path CHECK (
    canonical_path IS NULL OR (canonical_path ~ '^/[A-Za-z0-9/_-]*$' AND canonical_path !~ '//')
  ),
  CONSTRAINT search_visibility_url_absolute_canonical CHECK (
    canonical_url IS NULL OR canonical_url ~ '^https://chonhaviet\\.com/[A-Za-z0-9/_-]*$'
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS search_visibility_urls_canonical_url_unique
  ON public.search_visibility_urls(canonical_url)
  WHERE canonical_url IS NOT NULL;
CREATE INDEX IF NOT EXISTS search_visibility_urls_eligibility_idx
  ON public.search_visibility_urls(eligible, entity_type, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS search_visibility_urls_inspection_idx
  ON public.search_visibility_urls(inspection_status, next_inspection_at ASC NULLS FIRST)
  WHERE eligible;

CREATE TABLE IF NOT EXISTS public.search_visibility_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL CHECK (run_type IN ('eligibility_sync', 'sitemap_submit', 'sitemap_check', 'inspection_batch')),
  actor_kind text NOT NULL CHECK (actor_kind IN ('system', 'owner')),
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  request_fingerprint text,
  requested_count integer NOT NULL DEFAULT 0 CHECK (requested_count >= 0),
  processed_count integer NOT NULL DEFAULT 0 CHECK (processed_count >= 0),
  succeeded_count integer NOT NULL DEFAULT 0 CHECK (succeeded_count >= 0),
  deferred_count integer NOT NULL DEFAULT 0 CHECK (deferred_count >= 0),
  failed_count integer NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'succeeded', 'partial', 'failed')),
  error_summary text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT search_visibility_run_counts_consistent CHECK (processed_count <= requested_count)
);
CREATE INDEX IF NOT EXISTS search_visibility_runs_type_time_idx
  ON public.search_visibility_runs(run_type, started_at DESC);

ALTER TABLE public.search_visibility_urls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.search_visibility_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.search_visibility_urls FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.search_visibility_runs FROM PUBLIC, anon, authenticated;

-- Owner-MFA reads through the authenticated caller client. No browser role can write;
-- server-only scheduled work will use service_role after its separate approval.
GRANT SELECT ON TABLE public.search_visibility_urls TO authenticated;
GRANT SELECT ON TABLE public.search_visibility_runs TO authenticated;

DROP POLICY IF EXISTS "search_visibility_urls_owner_select" ON public.search_visibility_urls;
CREATE POLICY "search_visibility_urls_owner_select" ON public.search_visibility_urls
  FOR SELECT TO authenticated USING (public.is_owner_mfa());
DROP POLICY IF EXISTS "search_visibility_runs_owner_select" ON public.search_visibility_runs;
CREATE POLICY "search_visibility_runs_owner_select" ON public.search_visibility_runs
  FOR SELECT TO authenticated USING (public.is_owner_mfa());

NOTIFY pgrst, 'reload schema';

COMMIT;
