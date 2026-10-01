import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014100000_commerce_email_delivery.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_email_delivery_dry_run.sql'),
  'utf8',
);
const verify = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_email_delivery_verify.sql'),
  'utf8',
);

const executableSql = (sql: string) => sql
  .replace(/--.*$/gm, '')
  .replace(/'(?:''|[^'])*'/g, "''");

describe('commerce email delivery migration', () => {
  it('creates a private durable email queue from owner notifications', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.commerce_email_deliveries');
    expect(migration).toContain('notification_id uuid NOT NULL UNIQUE');
    expect(migration).toContain('recipient_email text NOT NULL');
    expect(migration).toContain('enqueue_commerce_notification_email()');
    expect(migration).toContain('trg_enqueue_commerce_notification_email');
    expect(migration).toContain('AFTER INSERT ON public.commerce_notifications');
    expect(migration).toContain('ALTER TABLE public.commerce_email_deliveries ENABLE ROW LEVEL SECURITY');
    expect(migration).not.toMatch(/GRANT SELECT ON public\.commerce_email_deliveries/i);
  });

  it('claims leased batches and records provider completion', () => {
    expect(migration).toContain('commerce_claim_email_deliveries(');
    expect(migration).toContain('FOR UPDATE SKIP LOCKED');
    expect(migration).toContain("clock_timestamp() + interval '5 minutes'");
    expect(migration).toContain('commerce_complete_email_delivery(');
    expect(migration).toContain("status = 'sent'");
    expect(migration).toContain('provider_message_id');
  });

  it('retries transient failures and dead-letters bounded attempts', () => {
    expect(migration).toContain('commerce_fail_email_delivery(');
    expect(migration).toContain('p_provider_message_id IS NULL AND p_retryable AND v_delivery.attempts < 8');
    expect(migration).toContain('provider_message_id = COALESCE');
    expect(migration).toContain("v_next_status := 'retry'");
    expect(migration).toContain("v_next_status := 'dead_letter'");
    expect(migration).toContain("'email_delivery_dead_letter'");
    expect(migration).toContain('commerce_email_delivery_dead_lettered');
  });

  it('keeps preflight and verification scripts read-only', () => {
    for (const sql of [dryRun, verify]) {
      expect(executableSql(sql)).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DO)\b/i);
    }
    expect(dryRun).toContain('commerce_email_delivery_preflight');
    expect(verify).toContain('commerce_email_delivery_verify_pass');
    expect(verify).toContain('uncertain_delivery_guard_present');
  });

  it('restricts workers to service role with hardened functions', () => {
    for (const signature of [
      'commerce_claim_email_deliveries(integer)',
      'commerce_complete_email_delivery(uuid, uuid, text)',
      'commerce_fail_email_delivery(uuid, uuid, text, boolean, text)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`);
    }
    expect((migration.match(/auth\.role\(\) IS DISTINCT FROM 'service_role'/g) ?? []).length).toBe(3);
  });
});
