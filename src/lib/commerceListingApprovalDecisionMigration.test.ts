import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014210000_commerce_listing_approval_decisions.sql'),
  'utf8',
);

describe('commerce listing approval fee decisions migration', () => {
  it('stores free and paid decisions as immutable approval-cycle snapshots', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.commerce_listing_approval_fee_decisions');
    expect(migration).toContain("fee_mode text NOT NULL CHECK (fee_mode IN ('free', 'paid'))");
    expect(migration).toContain('approval_cycle integer NOT NULL CHECK (approval_cycle > 0)');
    expect(migration).toContain('UNIQUE (user_listing_id, approval_cycle)');
    expect(migration).toContain('UNIQUE (owner_user_id, idempotency_key)');
    expect(migration).toContain('fee_product_version');
    expect(migration).toContain('amount_minor');
    expect(migration).toContain('duration_days');
    expect(migration).toContain('terms_version');
  });

  it('requires a manual reason for free and a complete product snapshot for paid', () => {
    expect(migration).toContain("fee_mode = 'free'");
    expect(migration).toContain("fee_mode = 'paid'");
    expect(migration).toContain('char_length(btrim(COALESCE(manual_reason, \'\'))) BETWEEN 1 AND 1000');
    expect(migration).toContain('fee_product_id IS NOT NULL');
    expect(migration).toContain('amount_minor IS NOT NULL');
    expect(migration).toContain('duration_days IS NOT NULL');
    expect(migration).toContain('manual_reason IS NULL');
  });

  it('prevents mutation and direct client access', () => {
    expect(migration).toContain('guard_commerce_listing_approval_fee_decision_append_only');
    expect(migration).toContain('BEFORE UPDATE OR DELETE');
    expect(migration).toContain('ALTER TABLE public.commerce_listing_approval_fee_decisions ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('REVOKE ALL ON TABLE public.commerce_listing_approval_fee_decisions FROM PUBLIC, anon, authenticated;');
    expect(migration).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE\s+public\.commerce_listing_approval_fee_decisions/i);
  });
});
