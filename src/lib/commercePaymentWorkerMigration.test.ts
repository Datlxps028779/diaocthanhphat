import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const foundation = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261014000000_commerce_foundation.sql'), 'utf8');
const ingress = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261014030000_commerce_webhook_ingress.sql'), 'utf8');
const worker = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261014040000_commerce_payment_worker.sql'), 'utf8');

describe('commerce payment worker migration', () => {
  it('persists provider payment identity independently of provider payload shape', () => {
    expect(foundation).toContain('provider_payment_id text NOT NULL CHECK');
    expect(ingress).toContain('provider, provider_event_id, provider_payment_id, payment_attempt_id, order_id');
    expect(ingress).toContain('v_event.provider_payment_id <> btrim(p_provider_payment_id)');
    expect(worker).toContain('a.provider_payment_id = v_event.provider_payment_id');
  });

  it('claims due and stale inbox rows with skip-locked leases and unique tokens', () => {
    expect(worker).toContain('public.commerce_claim_payment_webhooks(');
    expect(worker).toContain("i.status IN ('pending', 'retry')");
    expect(worker).toContain("i.status = 'processing'");
    expect(worker).toContain('FOR UPDATE SKIP LOCKED');
    expect(worker).toContain('processing_token = gen_random_uuid()');
    expect(worker).toContain("clock_timestamp() + interval '2 minutes'");
  });

  it('locks event then inbox and order then attempt to avoid lock-order inversions', () => {
    const process = worker.slice(
      worker.indexOf('CREATE OR REPLACE FUNCTION public.commerce_process_payment_webhook'),
      worker.indexOf('CREATE OR REPLACE FUNCTION public.commerce_fail_payment_webhook'),
    );
    const eventLock = process.indexOf('FROM public.commerce_payment_events e');
    const inboxLock = process.indexOf('FROM public.commerce_webhook_inbox i', eventLock);
    const orderLock = process.indexOf('FROM public.commerce_orders o');
    const attemptLock = process.indexOf('FROM public.commerce_payment_attempts a', orderLock);
    expect(eventLock).toBeGreaterThan(0);
    expect(inboxLock).toBeGreaterThan(eventLock);
    expect(orderLock).toBeGreaterThan(inboxLock);
    expect(attemptLock).toBeGreaterThan(orderLock);
  });

  it('reconciles signed identity, amount and currency before money state changes', () => {
    expect(worker).toContain('v_event.verification_method <> v_inbox.verification_method');
    expect(worker).toContain('v_event.signed_data_hash IS DISTINCT FROM v_inbox.signed_data_hash');
    expect(worker).toContain('v_event.provider_lookup_hash IS DISTINCT FROM v_inbox.provider_lookup_hash');
    expect(worker).toContain('Payment event linkage conflicts with provider payment identity.');
    expect(worker).toContain('Payment amount does not match attempt and order.');
    expect(worker).toContain('Payment currency does not match attempt and order.');
    expect(worker).toContain("v_event.event_type NOT IN ('payment.succeeded', 'payment.failed')");
    const amountCheck = worker.indexOf('Payment amount does not match attempt and order.');
    const successUpdate = worker.indexOf("SET status = 'succeeded'");
    expect(amountCheck).toBeLessThan(successUpdate);
  });

  it('terminalizes a failed attempt without emitting order failure after any attempt settled', () => {
    expect(worker).toContain("v_attempt_settled := v_attempt.status IN ('succeeded', 'partially_refunded', 'refunded', 'chargeback')");
    expect(worker).toContain('settled.id <> v_attempt.id');
    expect(worker).toContain('IF NOT v_attempt_settled THEN');
    expect(worker).toContain('IF NOT v_failure_ignored THEN');
    expect(worker).toContain("THEN 'commerce.payment.failure_ignored'");
    expect(worker).toContain("THEN 'payment_failure_ignored_after_settlement'");
  });

  it('atomically marks paid, creates subscription periods, entitlements, quota grant and outbox', () => {
    expect(worker).toContain("SET status = 'paid'");
    expect(worker).toContain('INSERT INTO public.commerce_subscription_periods(');
    expect(worker).toContain("grace_until = v_period_end + interval '3 days'");
    expect(worker).toContain('INSERT INTO public.commerce_entitlements(');
    expect(worker).toContain('INSERT INTO public.commerce_quota_ledger(');
    expect(worker).toContain("'payment-event:' || v_event.id::text || ':grant'");
    expect(worker).toContain("'commerce.order.paid', 'order', v_order.id");
    expect(worker).toContain('ON CONFLICT (topic, aggregate_type, aggregate_id) DO NOTHING');
  });

  it('keeps listing-specific benefits inactive until listing approval without exceeding a subscription period', () => {
    expect(foundation).toContain('commerce_entitlements_active_sponsored_window');
    expect(worker).toContain("WHEN v_kind IN ('listing_quota', 'seller_analytics') THEN 'active'");
    expect(worker).toContain("ELSE 'awaiting_listing_approval'");
    expect(worker.indexOf("WHEN v_version.billing_mode = 'subscription' THEN v_period.period_end")).toBeLessThan(
      worker.indexOf("WHEN v_entitlement_status <> 'active' THEN NULL"),
    );
  });

  it('bounds retry backoff and dead-letters permanent or exhausted failures', () => {
    expect(worker).toContain('p_retryable AND v_inbox.attempts < 8');
    expect(worker).toContain("v_next_status := 'retry'");
    expect(worker).toContain("v_next_status := 'dead_letter'");
    expect(worker).toContain("WHEN 1 THEN interval '15 seconds'");
    expect(worker).toContain("ELSE interval '30 minutes'");
    expect(worker).toContain('payment_webhook_dead_lettered');
  });

  it('restricts all worker entry points to service role with hardened search paths', () => {
    expect((worker.match(/auth\.role\(\) IS DISTINCT FROM 'service_role'/g) ?? []).length).toBe(3);
    expect((worker.match(/SECURITY DEFINER/g) ?? []).length).toBe(3);
    expect((worker.match(/SET search_path = public, pg_temp/g) ?? []).length).toBe(3);
    for (const name of [
      'commerce_claim_payment_webhooks(integer)',
      'commerce_process_payment_webhook(uuid, uuid)',
      'commerce_fail_payment_webhook(uuid, uuid, text, boolean)',
    ]) {
      expect(worker).toContain(`REVOKE ALL ON FUNCTION public.${name} FROM PUBLIC, anon, authenticated;`);
      expect(worker).toContain(`GRANT EXECUTE ON FUNCTION public.${name} TO service_role;`);
    }
  });
});
