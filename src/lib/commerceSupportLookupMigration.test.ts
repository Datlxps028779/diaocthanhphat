import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014090000_commerce_support_lookup.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_support_lookup_dry_run.sql'),
  'utf8',
);
const verify = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_support_lookup_verify.sql'),
  'utf8',
);

const executableSql = (sql: string) => sql
  .replace(/--.*$/gm, '')
  .replace(/'(?:''|[^'])*'/g, "''");

describe('commerce support lookup migration', () => {
  it('counts unresolved alerts through the operations view permission', () => {
    expect(migration).toContain('commerce_get_operations_alert_count()');
    expect(migration).toContain("has_staff_permission('commerce-operations', 'view')");
    expect(migration).toContain("status IN ('open','acknowledged')");
  });

  it('joins the full support chain without provider payloads', () => {
    expect(migration).toContain('commerce_get_operations_alert_detail(p_alert_id uuid)');
    expect(migration).toContain('commerce_payment_attempts');
    expect(migration).toContain('commerce_orders');
    expect(migration).toContain('commerce_payment_events');
    expect(migration).toContain('commerce_entitlements');
    expect(migration).toContain('commerce_quota_reservations');
    expect(migration).toContain('user_listings');
    expect(migration).toContain('properties');
    expect(migration).toContain('commerce_notifications');
    expect(migration).not.toContain('provider_metadata');
    expect(migration).not.toContain('payload_hash');
    expect(migration).not.toContain('signed_data_hash');
    expect(migration).not.toContain('provider_lookup_hash');
  });

  it('fails closed on missing permission or unrelated alerts', () => {
    expect(migration).toContain("Commerce operations view permission required.");
    expect(migration).toContain("Operations alert not found.");
    expect(migration).toContain('a.id = p_alert_id');
  });

  it('keeps preflight and verification read-only', () => {
    for (const sql of [dryRun, verify]) {
      expect(executableSql(sql)).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DO)\b/i);
    }
    expect(dryRun).toContain('commerce_support_lookup_preflight');
    expect(verify).toContain('commerce_support_lookup_verify_pass');
    expect(verify).toContain('sanitized_lookup_contract_present');
  });

  it('hardens both RPCs', () => {
    for (const signature of [
      'commerce_get_operations_alert_count()',
      'commerce_get_operations_alert_detail(uuid)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated;`);
    }
    expect((migration.match(/SECURITY DEFINER/g) ?? []).length).toBe(2);
    expect((migration.match(/SET search_path = public, pg_temp/g) ?? []).length).toBe(2);
  });
});
