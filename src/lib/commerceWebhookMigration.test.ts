import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014030000_commerce_webhook_ingress.sql'),
  'utf8',
);

describe('commerce webhook ingress migration', () => {
  it('accepts only service-role verified events', () => {
    expect(migration).toContain("auth.role() IS DISTINCT FROM 'service_role'");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.commerce_enqueue_verified_payment_webhook(');
    expect(migration).toContain('FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('TO service_role;');
  });

  it('validates bounded provider identity, signed fields and payload hash', () => {
    expect(migration).toContain('Invalid provider event id.');
    expect(migration).toContain('Invalid provider payment id.');
    expect(migration).toContain('Invalid payment event type.');
    expect(migration).toContain("p_currency <> 'VND'");
    expect(migration).toContain("p_payload_hash !~ '^[0-9a-f]{64}$'");
    expect(migration).toContain("p_signed_data_hash !~ '^[0-9a-f]{64}$'");
    expect(migration).toContain("jsonb_typeof(p_payload) <> 'object'");
    expect(migration).toContain('NOT isfinite(p_occurred_at)');
  });

  it('serializes duplicate provider events and rejects changed signed data', () => {
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended(p_provider || ':' || btrim(p_provider_event_id), 140300))");
    expect(migration).toContain('Provider event id was replayed with different signed data.');
    expect(migration).toContain('v_event.signed_data_hash <> p_signed_data_hash');
    expect(migration).toContain('v_event.provider_payment_id <> btrim(p_provider_payment_id)');
    expect(migration).not.toContain('v_event.payload_hash <> p_payload_hash');
    expect(migration).toContain('Webhook inbox and payment event are inconsistent.');
  });

  it('persists inbox and payment event in one transaction before returning', () => {
    const inboxInsert = migration.indexOf('INSERT INTO public.commerce_webhook_inbox');
    const eventInsert = migration.indexOf('INSERT INTO public.commerce_payment_events');
    const result = migration.lastIndexOf('RETURN QUERY SELECT');
    expect(inboxInsert).toBeGreaterThan(0);
    expect(eventInsert).toBeGreaterThan(inboxInsert);
    expect(result).toBeGreaterThan(eventInsert);
    expect(migration).toContain("'pending', '{}'::jsonb, p_payload");
    expect(migration).toContain("p_payload_hash, 'webhook_signature', p_signed_data_hash, NULL");
    expect(migration).toContain("p_event_type, true, 'webhook_signature', p_amount_minor, p_currency");
  });

  it('stores orphan events for later reconciliation and enriches them on replay', () => {
    expect(migration).toContain('v_attempt_id, v_order_id, v_owner_id');
    expect(migration).toContain('IF v_event.payment_attempt_id IS NULL AND v_attempt_id IS NOT NULL THEN');
    expect(migration).toContain('SET payment_attempt_id = v_attempt_id');
  });

  it('hardens the function search path', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
  });
});
