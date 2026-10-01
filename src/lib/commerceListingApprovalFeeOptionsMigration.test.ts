import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261015000000_commerce_listing_approval_fee_options.sql'),
  'utf8',
);

describe('commerce listing approval fee options migration', () => {
  it('resolves active applicable products and wallet balance server-side', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.commerce_get_listing_approval_fee_options(');
    expect(migration).toContain('commerce_fee_product_rules');
    expect(migration).toContain("p.product_kind = 'listing_basic'");
    expect(migration).toContain('p.amount_minor');
    expect(migration).toContain('p.duration_days');
    expect(migration).toContain('p.terms_version');
    expect(migration).toContain('commerce_wallet_accounts');
  });

  it('enforces the same server-side approval scope and ACL boundary', () => {
    expect(migration).toContain("public.has_staff_permission(");
    expect(migration).toContain("'user-listings', 'approve'");
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.commerce_get_listing_approval_fee_options(uuid)');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.commerce_get_listing_approval_fee_options(uuid)');
  });
});
