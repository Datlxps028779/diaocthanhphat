import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'supabase/staging_commerce_e2e_seed.sql'), 'utf8');

describe('staging Commerce E2E seed', () => {
  it('is explicitly staging-only and does not call PayOS', () => {
    expect(sql).toContain('STAGING ONLY. NEVER RUN ON PRODUCTION.');
    expect(sql).toContain("'e2e_checkout_test'");
    expect(sql).toContain('is_purchasable');
    expect(sql).not.toContain('commerce_claim_payment_checkout');
    expect(sql).not.toContain('commerce_attach_payment_checkout');
  });

  it('allows cleanup only for owned unpaid E2E-prefixed orders', () => {
    expect(sql).toContain('commerce_e2e_close_test_checkout');
    expect(sql).toContain("p_idempotency_key !~ '^e2e_staging_");
    expect(sql).toContain('o.owner_user_id = v_actor');
    expect(sql).toContain("o.idempotency_key = 'order:' || p_idempotency_key");
    expect(sql).toContain("v_order.status IN ('paid','partially_refunded','refunded','chargeback')");
    expect(sql).toContain('a.provider_payment_id IS NOT NULL');
    expect(sql).toContain("event_type, correlation_id");
    expect(sql).toContain("'staging_e2e_checkout_closed'");
  });

  it('keeps cleanup RPC authenticated and removes stale checkout claims', () => {
    expect(sql).toContain("provider_metadata = a.provider_metadata - 'checkout_claim_token' - 'checkout_claimed_at'");
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.commerce_e2e_close_test_checkout(uuid, text) FROM PUBLIC, anon;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.commerce_e2e_close_test_checkout(uuid, text) TO authenticated;');
  });
});
