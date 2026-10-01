import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014160000_commerce_wallet_topup_checkout.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_wallet_topup_checkout_dry_run.sql'),
  'utf8',
);
const verify = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_wallet_topup_checkout_verify.sql'),
  'utf8',
);

const executableSql = (sql: string) => sql
  .replace(/--.*$/gm, '')
  .replace(/'(?:''|[^'])*'/g, "''");

describe('commerce wallet top-up checkout migration', () => {
  it('creates a wallet-specific durable checkout without weakening order payments', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.commerce_wallet_topup_checkouts');
    expect(migration).toContain('topup_intent_id uuid NOT NULL UNIQUE');
    expect(migration).toContain('amount_minor bigint NOT NULL');
    expect(migration).toContain("currency text NOT NULL DEFAULT 'VND'");
    expect(migration).not.toMatch(/ALTER TABLE public\.commerce_payment_attempts[\s\S]*order_id/i);
  });

  it('allocates payOS order codes from the existing global payment sequence', () => {
    expect(migration).toContain("pg_get_serial_sequence('public.commerce_payment_attempts', 'provider_order_code')");
    expect(migration).toContain('provider_order_code BETWEEN 1 AND 9007199254740991');
    expect(migration).not.toMatch(/CREATE SEQUENCE/i);
  });

  it('starts from the locked owner intent and never accepts client amount or currency', () => {
    const start = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.commerce_start_wallet_topup_checkout'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.commerce_claim_wallet_topup_checkout'),
    );
    expect(start).toContain('i.owner_user_id = v_actor');
    expect(start).toContain('FOR UPDATE');
    expect(start).toContain('v_intent.requested_amount_minor');
    expect(start).not.toMatch(/p_(amount|currency|provider_order_code)/i);
  });

  it('claims one provider call and protects attach/recovery with the claim token', () => {
    expect(migration).toContain('commerce_claim_wallet_topup_checkout');
    expect(migration).toContain("claim_expires_at > v_now");
    expect(migration).toContain("clock_timestamp() + interval '60 seconds'");
    expect(migration).toContain('commerce_attach_wallet_topup_checkout');
    expect(migration).toContain('commerce_recover_wallet_topup_checkout');
    expect((migration.match(/claim_token IS DISTINCT FROM p_claim_token/g) ?? []).length).toBe(2);
  });

  it('keeps production preflight and verification read-only', () => {
    for (const sql of [dryRun, verify]) {
      expect(executableSql(sql)).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DO)\b/i);
    }
    expect(dryRun).toContain('commerce_wallet_topup_checkout_preflight_pass');
    expect(verify).toContain('commerce_wallet_topup_checkout_verify_pass');
  });

  it('keeps owner creation authenticated and provider mutations service-only', () => {
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commerce_start_wallet_topup_checkout(uuid, text, text) TO authenticated;');
    for (const signature of [
      'commerce_claim_wallet_topup_checkout(uuid, text)',
      'commerce_attach_wallet_topup_checkout(uuid, text, text, text, timestamptz)',
      'commerce_recover_wallet_topup_checkout(uuid, text, text, text)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`);
    }
    expect((migration.match(/SECURITY DEFINER/g) ?? []).length).toBe(4);
    expect((migration.match(/SET search_path = public, pg_temp/g) ?? []).length).toBe(4);
  });
});
