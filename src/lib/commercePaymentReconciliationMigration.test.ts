import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const foundation = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261014000000_commerce_foundation.sql'), 'utf8');
const ingress = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261014030000_commerce_webhook_ingress.sql'), 'utf8');
const paymentWorker = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261014040000_commerce_payment_worker.sql'), 'utf8');
const reconciliation = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261014050000_commerce_payment_reconciliation.sql'), 'utf8');

describe('commerce payment reconciliation migration', () => {
  it('distinguishes signed webhooks from provider API observations', () => {
    expect(foundation).toContain("verification_method IN ('webhook_signature','provider_api_lookup')");
    expect(foundation).toContain('commerce_payment_events_verification_source');
    expect(foundation).toContain('commerce_webhook_inbox_verification_source');
    expect(ingress).toContain("'webhook_signature', p_signed_data_hash, NULL");
    expect(reconciliation).toContain("'provider_api_lookup', NULL, p_provider_lookup_hash");
    expect(reconciliation).toContain("v_event_type, false, 'provider_api_lookup'");
    expect(paymentWorker).toContain("v_event.verification_method = 'provider_api_lookup' AND v_event.signature_valid");
  });

  it('creates a private reconciliation queue and schedules attached pending attempts', () => {
    expect(reconciliation).toContain('CREATE TABLE IF NOT EXISTS public.commerce_payment_reconciliation_jobs');
    expect(reconciliation).toContain('payment_attempt_id uuid NOT NULL UNIQUE');
    expect(reconciliation).toContain('ALTER TABLE public.commerce_payment_reconciliation_jobs ENABLE ROW LEVEL SECURITY');
    expect(reconciliation).toContain('REVOKE ALL ON TABLE public.commerce_payment_reconciliation_jobs FROM PUBLIC, anon, authenticated');
    expect(reconciliation).toContain('trg_commerce_payment_reconciliation_job');
    expect(reconciliation).toContain("NEW.status = 'pending'");
    expect(reconciliation).toContain("clock_timestamp() + interval '2 minutes'");
  });

  it('claims due and stale jobs with skip-locked leases', () => {
    expect(reconciliation).toContain('public.commerce_claim_payment_reconciliations(');
    expect(reconciliation).toContain("j.status IN ('pending','retry')");
    expect(reconciliation).toContain("j.status = 'processing'");
    expect(reconciliation).toContain('FOR UPDATE OF j SKIP LOCKED');
    expect(reconciliation).toContain('processing_token = gen_random_uuid()');
  });

  it('locks order then attempt then job before validating claim ownership', () => {
    const complete = reconciliation.slice(
      reconciliation.indexOf('CREATE OR REPLACE FUNCTION public.commerce_complete_payment_reconciliation'),
      reconciliation.indexOf('CREATE OR REPLACE FUNCTION public.commerce_fail_payment_reconciliation'),
    );
    const orderLock = complete.indexOf('FROM public.commerce_orders o');
    const attemptLock = complete.indexOf('FROM public.commerce_payment_attempts a', orderLock);
    const jobLock = complete.indexOf('FROM public.commerce_payment_reconciliation_jobs j', attemptLock);
    expect(orderLock).toBeGreaterThan(0);
    expect(attemptLock).toBeGreaterThan(orderLock);
    expect(jobLock).toBeGreaterThan(attemptLock);
    expect(complete.indexOf('Reconciliation claim is not owned by this worker.')).toBeGreaterThan(jobLock);
  });

  it('reconciles provider identity, amount and currency before event insertion', () => {
    const identity = reconciliation.indexOf('Provider lookup identity does not match payment attempt.');
    const amount = reconciliation.indexOf('Provider lookup amount does not match attempt and order.');
    const currency = reconciliation.indexOf('Provider lookup currency does not match attempt and order.');
    const inboxInsert = reconciliation.indexOf('INSERT INTO public.commerce_webhook_inbox(');
    expect(identity).toBeGreaterThan(0);
    expect(amount).toBeGreaterThan(identity);
    expect(currency).toBeGreaterThan(amount);
    expect(inboxInsert).toBeGreaterThan(currency);
  });

  it('feeds terminal lookup observations into inbox and event atomically', () => {
    const inboxInsert = reconciliation.indexOf('INSERT INTO public.commerce_webhook_inbox(');
    const eventInsert = reconciliation.indexOf('INSERT INTO public.commerce_payment_events(');
    const processed = reconciliation.indexOf("SET status = 'processed'", eventInsert);
    expect(eventInsert).toBeGreaterThan(inboxInsert);
    expect(processed).toBeGreaterThan(eventInsert);
    expect(reconciliation).toContain("CASE WHEN p_provider_status = 'succeeded' THEN 'payment.succeeded' ELSE 'payment.failed' END");
    expect(reconciliation).toContain("'lookup:' || v_attempt.id::text || ':' || p_provider_status");
  });

  it('keeps pending observations alive through expiry grace and bounds transport errors separately', () => {
    expect(reconciliation).toContain("+ interval '24 hours'");
    expect(reconciliation).toContain("ELSE interval '30 minutes'");
    expect(reconciliation).toContain('provider_pending_after_grace');
    expect(reconciliation).toContain('consecutive_errors integer NOT NULL DEFAULT 0');
    expect(reconciliation).toContain('p_retryable AND v_job.consecutive_errors < 7');
    expect(reconciliation).toContain('consecutive_errors = j.consecutive_errors + 1');
    expect(reconciliation).toContain('payment_reconciliation_dead_lettered');
  });

  it('restricts reconciliation RPCs to service role', () => {
    expect((reconciliation.match(/auth\.role\(\) IS DISTINCT FROM 'service_role'/g) ?? []).length).toBe(3);
    expect((reconciliation.match(/SECURITY DEFINER/g) ?? []).length).toBe(4);
    expect((reconciliation.match(/SET search_path = public, pg_temp/g) ?? []).length).toBe(4);
    for (const signature of [
      'commerce_claim_payment_reconciliations(integer)',
      'commerce_complete_payment_reconciliation(',
      'commerce_fail_payment_reconciliation(uuid, uuid, text, boolean)',
    ]) {
      expect(reconciliation).toContain(`REVOKE ALL ON FUNCTION public.${signature}`);
      expect(reconciliation).toContain(`GRANT EXECUTE ON FUNCTION public.${signature}`);
    }
  });
});
