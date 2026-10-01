import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dryRun = readFileSync(resolve(process.cwd(), 'supabase/manual_commerce_rpc_dry_run.sql'), 'utf8');
const verify = readFileSync(resolve(process.cwd(), 'supabase/manual_commerce_rpc_verify.sql'), 'utf8');

const executableSql = (sql: string) => sql
  .replace(/--.*$/gm, '')
  .replace(/'(?:''|[^'])*'/g, "''");

describe('commerce RPC operational scripts', () => {
  it('keeps preflight and verification read-only', () => {
    for (const sql of [dryRun, verify]) {
      expect(executableSql(sql)).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DO)\b/i);
    }
  });

  it('checks every RPC signature before and after migration', () => {
    const functions = [
      'commerce_create_order',
      'commerce_reserve_listing_quota',
      'commerce_consume_listing_quota',
      'commerce_release_listing_quota',
      'commerce_start_payment_attempt',
      'commerce_claim_payment_checkout',
      'commerce_attach_payment_checkout',
      'commerce_fail_payment_attempt',
      'commerce_enqueue_verified_payment_webhook',
      'commerce_claim_payment_webhooks',
      'commerce_process_payment_webhook',
      'commerce_fail_payment_webhook',
      'commerce_claim_payment_reconciliations',
      'commerce_complete_payment_reconciliation',
      'commerce_fail_payment_reconciliation',
      'commerce_claim_outbox',
      'commerce_deliver_outbox',
      'commerce_fail_outbox',
    ];
    for (const fn of functions) {
      expect(dryRun).toContain(fn);
      expect(verify).toContain(fn);
    }
  });

  it('verifies security definer, search path, execute ACL and direct table writes', () => {
    expect(verify).toContain('security_definer');
    expect(verify).toContain('search_path=public, pg_temp');
    expect(verify).toContain('anon_execute_denied');
    expect(verify).toContain('authenticated_execute_matches_contract');
    expect(verify).toContain('service_role_execute_matches_contract');
    expect(verify).toContain('no_client_table_writes');
    expect(verify).toContain('payment_worker_contract_present');
    expect(verify).toContain('payment_reconciliation_contract_present');
    expect(verify).toContain("trigger_table.relname = 'commerce_payment_attempts'");
    expect(verify).toContain('outbox_delivery_contract_present');
  });

  it('verifies the zero-delta consume invariant and emits a single pass marker', () => {
    expect(verify).toContain('commerce_quota_ledger_delta_check');
    expect(verify).toContain('consume_zero_delta_constraint_present');
    expect(verify).toContain('commerce_rpc_verify_pass');
  });
});
