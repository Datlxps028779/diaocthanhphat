import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260909010000_seo_freshness_queue.sql'),
  'utf8',
);
const worker = readFileSync(
  resolve(process.cwd(), 'supabase/functions/seo-freshness-worker/index.ts'),
  'utf8',
);
const internalRoute = readFileSync(
  resolve(process.cwd(), 'app/api/internal/seo-freshness-revalidate/route.ts'),
  'utf8',
);
const supabaseConfig = readFileSync(
  resolve(process.cwd(), 'supabase/config.toml'),
  'utf8',
);

describe('SEO freshness queue contract', () => {
  it('creates a private deduplicated queue with bounded status and retry fields', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.seo_freshness_jobs');
    expect(migration).toContain('dedupe_key text NOT NULL UNIQUE');
    expect(migration).toContain("status IN ('pending', 'processing', 'succeeded', 'failed', 'dead_letter')");
    expect(migration).toContain('attempt_count integer NOT NULL DEFAULT 0');
    expect(migration).toContain('max_attempts integer NOT NULL DEFAULT 5');
    expect(migration).toContain('FOR UPDATE SKIP LOCKED');
    expect(migration).toContain("locked_at < now() - interval '10 minutes'");
    expect(migration).toContain('REVOKE ALL ON TABLE public.seo_freshness_jobs FROM PUBLIC, anon, authenticated');
  });

  it('restricts queue mutation RPCs to service role and keeps a fixed search path', () => {
    expect(migration).toMatch(/SECURITY DEFINER\s+SET search_path = public, pg_temp/g);
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.claim_seo_freshness_jobs(text, integer) TO service_role');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.complete_seo_freshness_job(uuid, text, boolean, text) TO service_role');
    expect(migration).toContain("status = CASE WHEN v_next_attempt >= max_attempts THEN 'dead_letter' ELSE 'failed' END");
  });

  it('keeps the worker internal, bounded, timed out, and free of Google Indexing API calls', () => {
    expect(worker).toContain('const MAX_BATCH = 25');
    expect(worker).toContain('x-seo-freshness-worker-secret');
    expect(worker).toContain('claim_seo_freshness_jobs');
    expect(worker).toContain('complete_seo_freshness_job');
    expect(worker).toContain('AbortSignal.timeout(15_000)');
    expect(worker).not.toMatch(/indexing\.googleapis\.com|URL_UPDATED|URL_DELETED/);
  });

  it('configures the worker without JWT because it authenticates with its own secret', () => {
    expect(supabaseConfig).toContain('[functions.seo-freshness-worker]');
    expect(supabaseConfig).toContain('[functions.ai-chat]');
    expect(supabaseConfig).toMatch(/\[functions\.seo-freshness-worker\][\s\S]*?verify_jwt = false/);
  });

  it('requires an internal secret and a strict public path allowlist', () => {
    expect(internalRoute).toContain('SEO_FRESHNESS_INTERNAL_SECRET');
    expect(internalRoute).toContain('timingSafeEqual');
    expect(internalRoute).toContain("value.includes('?')");
    expect(internalRoute).toContain("value.includes('#')");
    expect(internalRoute).toContain('body.paths.length > 100');
  });
});
