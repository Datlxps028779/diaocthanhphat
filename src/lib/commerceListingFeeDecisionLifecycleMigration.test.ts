import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014220000_commerce_listing_fee_decision_lifecycle.sql'),
  'utf8',
);

describe('commerce listing fee decision lifecycle migration', () => {
  it('does not reserve wallet funds while a listing is pending', () => {
    expect(migration).toContain("IF NEW.status = 'pending' THEN");
    expect(migration).toContain('RETURN NEW;');
    expect(migration).not.toContain('commerce_reserve_listing_fee_internal');
  });

  it('requires a decision and enforces paid versus free reservation invariants', () => {
    expect(migration).toContain('commerce_listing_approval_fee_decisions');
    expect(migration).toContain('Listing approval fee decision is required.');
    expect(migration).toContain("v_fee_mode = 'paid'");
    expect(migration).toContain('Paid listing approval has no reserved fee.');
    expect(migration).toContain('Free listing approval must release its reserved fee before approval.');
    expect(migration).toContain('commerce_capture_listing_fee_internal');
  });

  it('keeps reject, expiry and delete release paths', () => {
    expect(migration).toContain("NEW.status IN ('rejected','expired')");
    expect(migration).toContain("'deleted'");
    expect(migration).toContain('commerce_release_listing_fee_internal');
    expect(migration).toContain('trg_commerce_wallet_listing_fee_lifecycle');
    expect(migration).toContain('trg_commerce_wallet_listing_fee_delete');
  });
});
