import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014150000_commerce_wallet_credit_hardening.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_wallet_credit_hardening_dry_run.sql'),
  'utf8',
);
const verify = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_wallet_credit_hardening_verify.sql'),
  'utf8',
);

const executableSql = (sql: string) => sql
  .replace(/--.*$/gm, '')
  .replace(/'(?:''|[^'])*'/g, "''");

describe('commerce wallet credit hardening migration', () => {
  it('enforces one credit ledger and receipt per top-up intent', () => {
    expect(migration).toContain('uq_commerce_wallet_ledger_topup_intent');
    expect(migration).toContain("WHERE operation = 'topup_credit'");
    expect(migration).toContain('uq_commerce_wallet_receipts_topup_intent');
    expect(migration).toContain("WHERE receipt_kind = 'wallet_topup'");
  });

  it('deduplicates by top-up intent before caller idempotency key', () => {
    expect(migration).toContain("l.operation = 'topup_credit'");
    expect(migration).toContain('l.topup_intent_id = v_intent.id');
    expect(migration).toContain("IF v_intent.status <> 'credited' THEN");
    expect(migration).toContain("IF v_intent.status = 'credited' THEN");
    expect(migration).toContain("'duplicate', true");
  });

  it('validates provider identity before accepting credited replays', () => {
    const creditFunction = migration.split('CREATE OR REPLACE FUNCTION public.commerce_credit_wallet_topup')[1] ?? '';
    const identityCheck = creditFunction.indexOf('v_intent.provider_payment_id IS DISTINCT FROM btrim(p_provider_payment_id)');
    const creditedReplay = creditFunction.indexOf("IF v_intent.status = 'credited' THEN");
    expect(identityCheck).toBeGreaterThan(-1);
    expect(creditedReplay).toBeGreaterThan(identityCheck);
  });

  it('keeps the replacement RPC service-only and hardened', () => {
    const signature = 'commerce_credit_wallet_topup(uuid, bigint, text, text, text, text)';
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon, authenticated;`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`);
  });

  it('keeps preflight and verification scripts read-only', () => {
    for (const sql of [dryRun, verify]) {
      expect(executableSql(sql)).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DO)\b/i);
    }
    expect(dryRun).toContain('commerce_wallet_credit_hardening_preflight_pass');
    expect(verify).toContain('commerce_wallet_credit_hardening_verify_pass');
  });
});
