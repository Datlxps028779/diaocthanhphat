import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014130000_commerce_wallet_rpc.sql'),
  'utf8',
);

describe('commerce wallet RPC migration', () => {
  it('creates server-priced fixed/custom top-up intents', () => {
    expect(migration).toContain('commerce_create_wallet_topup_intent(');
    expect(migration).toContain('commerce_wallet_topup_config');
    expect(migration).toContain('commerce_wallet_topup_options');
    expect(migration).toContain('custom_min_minor');
    expect(migration).toContain('custom_max_minor');
    expect(migration).toContain('custom_step_minor');
    expect(migration).toContain("p_custom_amount_minor % v_config.custom_step_minor");
  });

  it('keeps provider attachment and wallet credit service-only', () => {
    expect(migration).toContain('commerce_attach_wallet_topup_payment(');
    expect(migration).toContain('commerce_credit_wallet_topup(');
    expect((migration.match(/auth\.role\(\) IS DISTINCT FROM 'service_role'/g) ?? []).length).toBe(2);
    expect(migration).toContain('p_observed_amount_minor');
    expect(migration).toContain("p_observed_currency <> 'VND'");
    expect(migration).toContain('Provider payment amount does not match top-up intent.');
  });

  it('credits wallet, ledger and receipt atomically under row locks', () => {
    expect(migration).toContain('FOR UPDATE');
    expect(migration).toContain('available_minor = w.available_minor + v_intent.requested_amount_minor');
    expect(migration).toContain("'topup_credit'");
    expect(migration).toContain('commerce_wallet_ledger');
    expect(migration).toContain('commerce_wallet_receipts');
    expect(migration).toContain('wallet_topup');
    expect(migration).toContain('ON CONFLICT (owner_user_id, idempotency_key) DO NOTHING');
  });

  it('exposes only sanitized catalog and owner snapshot', () => {
    expect(migration).toContain('commerce_get_wallet_catalog()');
    expect(migration).toContain('commerce_get_my_wallet_snapshot()');
    expect(migration).toContain('owner_user_id = v_actor');
    expect(migration).not.toContain('provider_metadata');
    expect(migration).not.toContain('payload_hash');
  });

  it('hardens ACL by caller role', () => {
    for (const signature of [
      'commerce_create_wallet_topup_intent(text, bigint, text)',
      'commerce_get_my_wallet_snapshot()',
    ]) {
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO authenticated;`);
    }
    for (const signature of [
      'commerce_attach_wallet_topup_payment(uuid, text, text)',
      'commerce_credit_wallet_topup(uuid, bigint, text, text, text, text)',
    ]) {
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${signature} TO service_role;`);
    }
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commerce_get_wallet_catalog() TO anon, authenticated;');
  });
});
