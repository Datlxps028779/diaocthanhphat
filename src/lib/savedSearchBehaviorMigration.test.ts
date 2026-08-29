import { readFileSync, readdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260910000000_separate_behavior_saved_search.sql'),
  'utf8',
);

const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_saved_search_behavior_separation_dry_run.sql'),
  'utf8',
);

describe('behavior and saved-search separation migration', () => {
  it('uses a migration version that is unique across the repository', () => {
    const files = readdirSync(resolve(process.cwd(), 'supabase/migrations')).filter(file => file.endsWith('.sql'));
    const versions = files.map(file => file.split('_')[0]);
    expect(versions.filter(version => version === '20260910000000')).toHaveLength(1);
    expect(versions.filter(version => version === '20260908000000')).toHaveLength(1);
  });

  it('marks saved-search provenance and disables automatic alert rows without deleting data', () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS origin text NOT NULL DEFAULT 'automatic'");
    expect(migration).toContain("CHECK (origin IN ('automatic', 'explicit'))");
    expect(migration).toMatch(/UPDATE public\.user_saved_searches[\s\S]*alert_enabled = false[\s\S]*WHERE origin = 'automatic'/);
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.user_saved_searches/i);
  });

  it('blocks stale clients from creating automatic alert rows', () => {
    expect(migration).toContain('ALTER COLUMN alert_enabled SET DEFAULT false');
    expect(migration).toContain("CHECK (origin <> 'automatic' OR alert_enabled = false)");
    expect(migration).toMatch(/CREATE POLICY "uss_insert"[\s\S]*origin = 'explicit'/);
  });

  it('adds event identity and a locked sliding-window RPC for remote dedupe', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS event_id uuid');
    expect(migration).toContain('idx_user_taste_signals_event');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS dedupe_key text');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.record_user_taste_signal');
    expect(migration).toContain('RETURNS uuid');
    expect(migration).toContain('SELECT s.event_id');
    expect(migration).toContain('RETURN v_existing_event_id');
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('make_interval(secs => v_window_seconds)');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain('DROP POLICY IF EXISTS "uts_insert"');
    expect(migration).toContain('REVOKE INSERT ON TABLE public.user_taste_signals FROM authenticated');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.record_user_taste_signal');
    expect(migration).not.toContain('dedupe_bucket');
  });

  it('keeps the production preflight read-only', () => {
    expect(dryRun).toContain('FROM public.user_saved_searches');
    expect(dryRun).toContain('FROM public.user_taste_signals');
    const statements = dryRun.replace(/--.*$/gm, '');
    expect(statements).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|DROP|TRUNCATE)\b/i);
  });
});
