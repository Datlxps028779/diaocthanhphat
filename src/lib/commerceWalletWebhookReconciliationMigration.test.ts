import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014170000_commerce_wallet_webhook_reconciliation.sql'),
  'utf8',
);

describe('commerce wallet webhook and reconciliation migration', () => {
  it('creates reconciliation jobs scoped to wallet checkout identity', () => {
    expect(migration).toContain('commerce_wallet_topup_reconciliation_jobs');
    expect(migration).toContain('topup_checkout_id uuid NOT NULL UNIQUE');
    expect(migration).toContain('provider_payment_id text NOT NULL');
    expect(migration).toContain("status IN ('pending','processing','retry','processed','dead_letter')");
  });

  it('creates wallet webhook processing without using package payment attempts', () => {
    expect(migration).toContain('commerce_process_wallet_payment_webhook');
    expect(migration).toContain('commerce_wallet_topup_checkouts');
    expect(migration).toContain('commerce_credit_wallet_topup');
    expect(migration).toContain('Payment event is not attached to a wallet top-up checkout.');
    expect(migration).not.toContain('commerce_order_items');
    expect(migration).not.toContain('commerce_entitlements');
  });

  it('routes by provider payment id or provider order code for early webhook delivery', () => {
    expect(migration).toContain('provider_payment_id = v_event.provider_payment_id');
    expect(migration).toContain("v_event.payload->>'orderCode'");
    expect(migration).toContain('provider_order_code');
  });

  it('keeps verified wallet credit and reconciliation mutations service-only', () => {
    for (const signature of [
      'commerce_process_wallet_payment_webhook(uuid, uuid)',
      'commerce_claim_wallet_topup_reconciliations(integer)',
      'commerce_complete_wallet_topup_reconciliation(uuid, uuid, text, text, bigint, text, text, timestamptz, timestamptz)',
      'commerce_fail_wallet_topup_reconciliation(uuid, uuid, text, boolean)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`);
    }
    expect((migration.match(/SECURITY DEFINER/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect((migration.match(/SET search_path = public, pg_temp/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });
});
