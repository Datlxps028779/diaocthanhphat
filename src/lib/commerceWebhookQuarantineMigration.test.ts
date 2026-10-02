import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014240000_commerce_webhook_quarantine.sql'),
  'utf8',
);
const paymentWorkerMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014040000_commerce_payment_worker.sql'),
  'utf8',
);
const walletWorkerMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014170000_commerce_wallet_webhook_reconciliation.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_webhook_quarantine_dry_run.sql'),
  'utf8',
);
const verify = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_webhook_quarantine_verify.sql'),
  'utf8',
);
const apply = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_webhook_quarantine_apply.sql'),
  'utf8',
);

const webhookId = '2a4eab5c-21e4-44e3-8f15-e4e1fdfbf7c9';

describe('commerce webhook quarantine migration', () => {
  it('adds a terminal quarantine status without changing processed semantics', () => {
    expect(migration).toContain("'dead_letter','quarantined'" );
    expect(migration).toContain("SET status = 'quarantined'");
    expect(migration).toContain("AND i.status = 'dead_letter'");
    expect(migration).not.toContain("SET status = 'processed'");
    expect(migration).toContain("processed_at', NULL");
  });

  it('uses a service-role-only hardened RPC', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.commerce_quarantine_orphan_test_webhook(');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain("auth.role() IS DISTINCT FROM 'service_role'");
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.commerce_quarantine_orphan_test_webhook(uuid)');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commerce_quarantine_orphan_test_webhook(uuid)');
    expect(migration).toContain('TO service_role;');
  });

  it('requires the exact stale sample identity and absence of financial links', () => {
    for (const guard of [
      "v_inbox.provider_event_id <> 'TF230204212323'",
      "v_inbox.attempts <> 8",
      "v_inbox.last_error_code <> 'P0002'",
      "v_inbox.verification_method <> 'webhook_signature'",
      "v_event.event_type <> 'payment.succeeded'",
      'NOT v_event.signature_valid',
      'v_event.amount_minor <> 3000',
      "v_event.currency <> 'VND'",
      "TIMESTAMPTZ '2023-02-04 00:00:00+00'",
      "TIMESTAMPTZ '2023-02-05 00:00:00+00'",
      "v_order_code <> '123'",
      'v_event.payment_attempt_id IS NOT NULL',
      'v_event.order_id IS NOT NULL',
      'public.commerce_payment_attempts',
      'public.commerce_wallet_topup_checkouts',
    ]) {
      expect(migration).toContain(guard);
    }
  });

  it('records append-only audit state and financial safety metadata', () => {
    expect(migration).toContain("'payment_webhook_quarantined'");
    expect(migration).toContain('before_state');
    expect(migration).toContain('after_state');
    expect(migration).toContain("'reason', 'orphan_test_webhook'");
    expect(migration).toContain("'no_financial_mutation', true");
    expect(migration).toContain("RETURN QUERY SELECT v_inbox.id, v_audit_event_id, 'quarantined'::text");
  });

  it('keeps both worker claim paths closed to quarantined rows', () => {
    expect(paymentWorkerMigration).toContain("i.status IN ('pending', 'retry')");
    expect(paymentWorkerMigration).not.toContain("i.status IN ('pending', 'retry', 'quarantined')");
    expect(walletWorkerMigration).toContain("i.status IN ('pending', 'retry')");
    expect(walletWorkerMigration).not.toContain("i.status IN ('pending', 'retry', 'quarantined')");
  });

  it('keeps user-run scripts bounded to the approved UUID', () => {
    for (const script of [dryRun, verify, apply]) {
      expect(script).toContain(webhookId);
    }
    expect(dryRun).toContain('preflight_pass');
    expect(verify).toContain('verify_pass');
    expect(apply).toContain('commerce_quarantine_orphan_test_webhook');
    expect(apply).toContain("set_config('request.jwt.claim.role', 'service_role', true)");
    expect(apply).not.toContain('UPDATE public.commerce_webhook_inbox');
  });
});
