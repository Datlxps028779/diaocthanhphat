import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const foundation = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261014000000_commerce_foundation.sql'), 'utf8');
const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261014020000_commerce_checkout_boundary.sql'), 'utf8');

describe('commerce checkout boundary migration', () => {
  it('assigns a unique provider-safe numeric code per payment attempt', () => {
    expect(foundation).toContain('provider_order_code bigint GENERATED ALWAYS AS IDENTITY UNIQUE');
    expect(foundation).toContain('provider_order_code BETWEEN 1 AND 9007199254740991');
  });

  it('creates payment attempts only from the locked owner order amount and currency', () => {
    expect(migration).toContain('public.commerce_start_payment_attempt(');
    expect(migration).toContain('AND owner_user_id = v_actor');
    expect(migration).toContain('FOR UPDATE;');
    expect(migration).toContain("v_order.id, p_provider, 'created', v_order.total_minor, v_order.currency");
    expect(migration).not.toMatch(/p_(amount|currency|provider_order_code)/i);
  });

  it('uses one 15-minute lease for the durable attempt and provider checkout', () => {
    expect(migration).toContain("date_trunc('second', now() + interval '15 minutes')");
    expect(migration).toContain('attempt_expires_at timestamptz');
    expect((migration.match(/v_attempt\.status, v_attempt\.expires_at/g) ?? []).length).toBe(2);
    expect((migration.match(/v_attempt\.provider_payment_id, v_attempt\.checkout_url/g) ?? []).length).toBe(2);
  });

  it('replays matching payment idempotency before current order-state validation', () => {
    const replay = migration.indexOf('IF FOUND THEN');
    const stateCheck = migration.indexOf("IF v_order.status NOT IN ('draft', 'payment_failed', 'awaiting_payment')");
    expect(replay).toBeGreaterThan(0);
    expect(replay).toBeLessThan(stateCheck);
    expect(migration).toContain('Idempotency key was already used for another payment attempt.');
  });

  it('prevents parallel active attempts for one order', () => {
    expect(migration).toContain("a.status IN ('created', 'pending')");
    expect(migration).toContain("a.expires_at IS NULL OR a.expires_at > now()");
    expect(migration).toContain('Order already has an active payment attempt.');
  });

  it('locks order before attempt for attach and failure transitions', () => {
    for (const functionName of ['commerce_attach_payment_checkout', 'commerce_fail_payment_attempt']) {
      const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${functionName}`);
      const end = migration.indexOf('$$;', start) + 3;
      const sql = migration.slice(start, end);
      expect(sql.indexOf('FROM public.commerce_orders')).toBeGreaterThan(0);
      expect(sql.indexOf('FROM public.commerce_orders')).toBeLessThan(sql.indexOf('SELECT * INTO v_attempt'));
    }
  });

  it('replays an attached checkout before validating whether its expiry is still future', () => {
    const attach = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.commerce_attach_payment_checkout'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.commerce_fail_payment_attempt'),
    );
    expect(attach.indexOf("IF v_attempt.provider_payment_id = btrim(p_provider_payment_id) THEN")).toBeGreaterThan(0);
    expect(attach.indexOf("IF v_attempt.provider_payment_id = btrim(p_provider_payment_id) THEN")).toBeLessThan(
      attach.indexOf('Checkout expiry must be in the future.'),
    );
    expect(attach).toContain('Checkout URL conflicts with the attached provider payment.');
    expect(attach).toContain("AND (v_attempt.expires_at IS NOT NULL OR p_expires_at IS NULL)");
    expect(attach).toContain('expires_at = COALESCE(expires_at, p_expires_at)');
    expect(attach).toContain('Checkout expiry conflicts with the attached provider payment.');
  });

  it('marks only unattached create attempts failed and preserves other active attempts', () => {
    expect(migration).toContain("v_attempt.status <> 'created' OR v_attempt.provider_payment_id IS NOT NULL");
    expect(migration).toContain('Only an unattached checkout creation attempt can be marked failed.');
    expect(migration).toContain("a.status IN ('created', 'pending')");
    expect(migration).toContain("a.expires_at IS NULL OR a.expires_at > now()");
  });

  it('atomically claims one provider call per attempt with a stale-claim recovery window', () => {
    expect(migration).toContain('public.commerce_claim_payment_checkout(');
    expect(migration).toContain("checkout_claim_token', p_claim_token");
    expect(migration).toContain('v_claim_now := clock_timestamp()');
    expect(migration).toContain("v_claimed_at > v_claim_now - interval '60 seconds'");
    expect(migration).toContain("'checkout_claimed_at', v_claim_now");
    expect(migration).toContain("provider_metadata - 'checkout_claim_token' - 'checkout_claimed_at'");
    expect(migration).toContain('Checkout claim is not owned by this worker.');
  });

  it('allows only service role to claim or mutate provider checkout state', () => {
    expect((migration.match(/auth\.role\(\) IS DISTINCT FROM 'service_role'/g) ?? []).length).toBe(3);
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.commerce_attach_payment_checkout(uuid, text, text, timestamptz) FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.commerce_claim_payment_checkout(uuid, text) FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.commerce_fail_payment_attempt(uuid, text, text) FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commerce_attach_payment_checkout(uuid, text, text, timestamptz) TO service_role;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commerce_claim_payment_checkout(uuid, text) TO service_role;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commerce_fail_payment_attempt(uuid, text, text) TO service_role;');
  });

  it('keeps owner attempt creation authenticated and all functions hardened', () => {
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commerce_start_payment_attempt(uuid, text, text) TO authenticated;');
    expect((migration.match(/SECURITY DEFINER/g) ?? []).length).toBe(4);
    expect((migration.match(/SET search_path = public, pg_temp/g) ?? []).length).toBe(4);
  });

  it('does not downgrade an order after any settled payment state', () => {
    expect(migration).toContain("a.status IN ('succeeded', 'partially_refunded', 'refunded', 'chargeback')");
    expect(migration).toContain("SET status = 'payment_failed'");
  });
});
