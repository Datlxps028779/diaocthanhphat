import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const dryRun = read('supabase/manual_seo_freshness_dead_letter_recovery_dry_run.sql');
const apply = read('supabase/manual_seo_freshness_dead_letter_recovery_apply.sql');
const verify = read('supabase/manual_seo_freshness_dead_letter_recovery_verify.sql');

const BATCHES = [
  '2c1d1d8ac864e15a00c415aea28b15519bf850414279d1ed4dc88ea5b3f6e604',
  '3232f98850fd69c188ff582f4ee9a87a9066131a6ff0c80175e9066fc28d146b',
];

describe('SEO freshness dead-letter recovery', () => {
  it('keeps preflight and verification read-only', () => {
    for (const sql of [dryRun, verify]) {
      expect(sql).toContain('BEGIN TRANSACTION READ ONLY');
      expect(sql).toContain("'write_performed', false");
      expect(sql).toContain('ROLLBACK;');
    }
  });

  it('scopes recovery to the two measured batches and fails closed on drift', () => {
    for (const batch of BATCHES) {
      expect(dryRun).toContain(batch);
      expect(apply).toContain(batch);
      expect(verify).toContain(batch);
    }
    expect(apply).toContain('v_batch_count <> 2');
    expect(apply).toContain('v_job_count <> 20');
    expect(apply).toContain('v_dead_letter_count <> 20');
    expect(apply).toContain('v_expected_error_count <> 20');
    expect(apply).toContain('Recovery aborted');
  });

  it('requeues without changing identity or dedupe keys', () => {
    expect(apply).toContain("SET status = 'pending'");
    expect(apply).toContain('attempt_count = 0');
    expect(apply).toContain('next_attempt_at = now()');
    expect(apply).not.toMatch(/DELETE\s+FROM\s+public\.seo_freshness_jobs/i);
    expect(apply).not.toMatch(/dedupe_key\s*=/i);
    expect(apply).not.toMatch(/path\s*=/i);
  });

  it('requires every recovered job to succeed', () => {
    expect(verify).toContain('succeeded_count = 20');
    expect(verify).toContain('dead_letter_count = 0');
    expect(verify).toContain('error_count = 0');
    expect(verify).toContain('processed_count = 20');
  });
});
