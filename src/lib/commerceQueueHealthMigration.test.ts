import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261015030000_commerce_queue_health.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_queue_health_dry_run.sql'),
  'utf8',
);
const verify = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_queue_health_verify.sql'),
  'utf8',
);

const executableSql = (sql: string) => sql
  .replace(/--.*$/gm, '')
  .replace(/'(?:''|[^'])*'/g, "''");

describe('commerce queue health migration', () => {
  it('exposes aggregate status counts for both private queues', () => {
    expect(migration).toContain('commerce_get_operations_queue_health()');
    expect(migration).toContain('commerce_outbox');
    expect(migration).toContain('commerce_email_deliveries');
    for (const status of ['pending', 'processing', 'retry', 'dead_letter', 'sent']) {
      expect(migration).toContain(`status = '${status}'`);
    }
    expect(migration).toContain("'oldest_actionable_at'");
    expect(migration).toContain('statement_timestamp()');
  });

  it('uses due-only actionable semantics for retry and stale processing', () => {
    expect(migration).toContain("status IN ('pending', 'retry') AND (next_attempt_at IS NULL OR next_attempt_at <= v_observed_at)");
    expect(migration).toContain("status = 'processing' AND next_attempt_at IS NOT NULL AND next_attempt_at <= v_observed_at");
    expect(migration).toContain("OR status = 'dead_letter'");
    expect(migration).toContain('min(created_at) FILTER');
  });

  it('hardens the staff read boundary without table grants', () => {
    expect(migration).toContain("has_staff_permission('commerce-operations', 'view')");
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.commerce_get_operations_queue_health() FROM PUBLIC, anon;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commerce_get_operations_queue_health() TO authenticated;');
    expect(migration).not.toContain('GRANT SELECT');
  });

  it('does not mutate queues, expose row fields, or call workers', () => {
    expect(executableSql(migration)).not.toMatch(/\b(INSERT|UPDATE|DELETE|FOR UPDATE|SKIP LOCKED)\b/i);
    for (const sensitiveField of ['recipient_email', 'provider_message_id', 'provider_metadata', 'processing_token', 'subject', 'body']) {
      expect(migration).not.toContain(sensitiveField);
    }
    for (const worker of ['commerce_claim_outbox', 'commerce_deliver_outbox', 'commerce_fail_outbox', 'commerce_claim_email_deliveries', 'commerce_complete_email_delivery', 'commerce_fail_email_delivery']) {
      expect(migration).not.toContain(worker);
    }
  });

  it('keeps manual preflight and verification scripts read-only', () => {
    for (const sql of [dryRun, verify]) {
      expect(executableSql(sql)).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DO)\b/i);
    }
    expect(dryRun).toContain('commerce_queue_health_preflight');
    expect(verify).toContain('commerce_queue_health_verify_pass');
  });
});
