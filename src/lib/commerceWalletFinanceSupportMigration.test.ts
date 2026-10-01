import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014190000_commerce_wallet_finance_support.sql'),
  'utf8',
);
const dryRun = readFileSync(resolve(process.cwd(), 'supabase/manual_commerce_wallet_finance_support_dry_run.sql'), 'utf8');
const verify = readFileSync(resolve(process.cwd(), 'supabase/manual_commerce_wallet_finance_support_verify.sql'), 'utf8');

const executableSql = (sql: string) => sql.replace(/--.*$/gm, '').replace(/'(?:''|[^'])*'/g, "''");

describe('commerce wallet finance and support migration', () => {
  it('keeps wallet finance internal and non-withdrawable', () => {
    expect(migration).toContain("case_kind IN ('chargeback', 'adjustment')");
    expect(migration).toContain("operation IN ('admin_credit', 'admin_debit', 'chargeback_debit')");
    expect(executableSql(migration)).not.toMatch(/withdraw|bank_refund|provider_refund|tax_invoice/i);
    expect(migration).toContain('available_minor < v_case.amount_minor');
    expect(migration).toContain("status = 'blocked'");
  });

  it('requires separate finance permissions and restricted RPC ACLs', () => {
    expect(migration).toContain("('commerce-finance', 'view'");
    expect(migration).toContain("('commerce-finance', 'edit'");
    expect(migration).toContain("has_staff_permission('commerce-finance', 'edit')");
    expect(migration).toContain("has_staff_permission('commerce-operations', 'view')");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.commerce_finance_adjust_wallet');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commerce_get_wallet_support_detail(text) TO authenticated;');
  });

  it('keeps support lookup sanitized and read-only', () => {
    expect(migration).toContain('commerce_wallet_topup_reconciliation_jobs');
    expect(migration).toContain("'auditTimeline'");
    expect(migration).toContain("'document_type', r.document_type");
    expect(migration).not.toContain('claim_token');
    expect(migration).not.toContain('checkout_url');
    expect(migration).not.toContain('provider_lookup_hash');
    expect(migration).not.toContain('provider_metadata');
  });

  it('requires migration prerequisites without writing in preflight', () => {
    expect(executableSql(dryRun)).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DO)\b/i);
    expect(verify).toContain('commerce_wallet_finance_support_verify_pass');
  });
});
