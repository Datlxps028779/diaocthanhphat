import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014080000_commerce_account_operations_read_models.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_account_operations_dry_run.sql'),
  'utf8',
);
const verify = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_account_operations_verify.sql'),
  'utf8',
);

const executableSql = (sql: string) => sql
  .replace(/--.*$/gm, '')
  .replace(/'(?:''|[^'])*'/g, "''");

describe('commerce account and operations read models migration', () => {
  it('adds explicit staff permissions without exposing alert tables', () => {
    expect(migration).toContain("('commerce-operations', 'view', 'Vận hành thanh toán')");
    expect(migration).toContain("('commerce-operations', 'edit', 'Vận hành thanh toán')");
    expect(migration).not.toMatch(/GRANT SELECT ON public\.commerce_operations_alerts/i);
  });

  it('returns an owner-scoped sanitized account snapshot', () => {
    expect(migration).toContain('commerce_get_my_account_snapshot()');
    expect(migration).toContain('v_actor uuid := auth.uid()');
    expect(migration).toContain('o.owner_user_id = v_actor');
    expect(migration).toContain('e.owner_user_id = v_actor');
    expect(migration).toContain('n.owner_user_id = v_actor');
    expect(migration).toContain('AS items');
    expect(migration).toContain('package_version_id');
    expect(migration).toContain('total_amount_minor');
    expect(migration).not.toContain("'provider_metadata'");
    expect(migration).not.toContain("'payload_hash'");
  });

  it('marks only the caller notification as read', () => {
    expect(migration).toContain('commerce_mark_notification_read(p_notification_id uuid)');
    expect(migration).toContain('owner_user_id = v_actor');
    expect(migration).toContain('read_at = COALESCE(n.read_at, clock_timestamp())');
  });

  it('gates operations lookup and mutation by granular permissions', () => {
    expect(migration).toContain("has_staff_permission('commerce-operations', 'view')");
    expect(migration).toContain("has_staff_permission('commerce-operations', 'edit')");
    expect(migration).toContain('commerce_get_operations_alerts(');
    expect(migration).toContain('commerce_update_operations_alert_status(');
    expect(migration).toContain("p_status NOT IN ('open','acknowledged','resolved')");
    expect(migration).toContain('commerce_operations_alert_status_changed');
  });

  it('keeps preflight and verification scripts read-only', () => {
    for (const sql of [dryRun, verify]) {
      expect(executableSql(sql)).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DO)\b/i);
    }
    expect(dryRun).toContain('commerce_account_operations_preflight');
    expect(verify).toContain('commerce_account_operations_verify_pass');
    expect(verify).toContain('owner_snapshot_sanitized');
    expect(verify).toContain('operations_permissions_present');
  });

  it('hardens every RPC and exposes only authenticated execution', () => {
    for (const signature of [
      'commerce_get_my_account_snapshot()',
      'commerce_mark_notification_read(uuid)',
      'commerce_get_operations_alerts(text, integer)',
      'commerce_update_operations_alert_status(uuid, text)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated;`);
    }
    expect((migration.match(/SECURITY DEFINER/g) ?? []).length).toBe(4);
    expect((migration.match(/SET search_path = public, pg_temp/g) ?? []).length).toBe(4);
  });
});
