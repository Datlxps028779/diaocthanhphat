import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014060000_commerce_outbox_delivery.sql'),
  'utf8',
);

describe('commerce outbox delivery migration', () => {
  it('creates durable owner notification and operations alert destinations', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.commerce_notifications');
    expect(migration).toContain('outbox_id uuid NOT NULL UNIQUE');
    expect(migration).toContain("kind text NOT NULL CHECK (kind IN ('payment_succeeded','payment_failed'))");
    expect(migration).toContain('char_length(action_path) BETWEEN 2 AND 501');
    expect(migration).toContain("action_path ~ '^/[A-Za-z0-9/_?=&.-]+$'");
    expect(migration).not.toContain('{1,500}');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.commerce_operations_alerts');
    expect(migration).toContain("code text NOT NULL CHECK (code IN ('payment_failure_ignored','duplicate_settlement'))");
  });

  it('keeps destinations server-write-only and alerts private', () => {
    expect(migration).toContain('ALTER TABLE public.commerce_notifications ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('ALTER TABLE public.commerce_operations_alerts ENABLE ROW LEVEL SECURITY');
    expect(migration).toContain('REVOKE ALL ON TABLE public.commerce_notifications, public.commerce_operations_alerts');
    expect(migration).toContain('commerce_notifications_owner_read');
    expect(migration).toContain('owner_user_id = auth.uid()');
    expect(migration).toContain('GRANT SELECT ON public.commerce_notifications TO authenticated');
    expect(migration).not.toMatch(/GRANT SELECT ON public\.commerce_operations_alerts/i);
  });

  it('claims due and stale outbox rows with skip-locked leases', () => {
    expect(migration).toContain('public.commerce_claim_outbox(');
    expect(migration).toContain("o.status IN ('pending','retry')");
    expect(migration).toContain("o.status = 'processing'");
    expect(migration).toContain('FOR UPDATE SKIP LOCKED');
    expect(migration).toContain('processing_token = gen_random_uuid()');
    expect(migration).toContain("clock_timestamp() + interval '2 minutes'");
  });

  it('maps every emitted commerce topic to a concrete destination', () => {
    expect(migration).toContain("v_outbox.topic = 'commerce.order.paid'");
    expect(migration).toContain("v_outbox.topic = 'commerce.payment.failed'");
    expect(migration).toContain("'commerce.payment.failure_ignored'");
    expect(migration).toContain("'commerce.payment.duplicate_settlement'");
    expect(migration).toContain('INSERT INTO public.commerce_notifications(');
    expect(migration).toContain('INSERT INTO public.commerce_operations_alerts(');
    expect(migration).toContain('Unsupported commerce outbox topic or aggregate.');
  });

  it('persists a destination before atomically marking outbox sent', () => {
    const notificationInsert = migration.indexOf('INSERT INTO public.commerce_notifications(');
    const alertInsert = migration.indexOf('INSERT INTO public.commerce_operations_alerts(');
    const sentUpdate = migration.indexOf("SET status = 'sent'");
    expect(notificationInsert).toBeGreaterThan(0);
    expect(alertInsert).toBeGreaterThan(notificationInsert);
    expect(sentUpdate).toBeGreaterThan(alertInsert);
    expect(migration).toContain('ON CONFLICT ON CONSTRAINT commerce_notifications_outbox_id_key DO UPDATE');
    expect(migration).toContain('ON CONFLICT ON CONSTRAINT commerce_operations_alerts_outbox_id_key DO UPDATE');
    expect(migration).toContain('Outbox destination conflicts with existing delivery.');
  });

  it('bounds delivery retry and dead-letters deterministic failures', () => {
    expect(migration).toContain('p_retryable AND v_outbox.attempts < 8');
    expect(migration).toContain("v_next_status := 'retry'");
    expect(migration).toContain("v_next_status := 'dead_letter'");
    expect(migration).toContain('commerce_outbox_retry_scheduled');
    expect(migration).toContain('commerce_outbox_dead_lettered');
  });

  it('restricts dispatcher RPCs to service role with hardened search paths', () => {
    expect((migration.match(/auth\.role\(\) IS DISTINCT FROM 'service_role'/g) ?? []).length).toBe(3);
    expect((migration.match(/SECURITY DEFINER/g) ?? []).length).toBe(3);
    expect((migration.match(/SET search_path = public, pg_temp/g) ?? []).length).toBe(3);
    for (const signature of [
      'commerce_claim_outbox(integer)',
      'commerce_deliver_outbox(uuid, uuid)',
      'commerce_fail_outbox(uuid, uuid, text, boolean)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`);
    }
  });
});
