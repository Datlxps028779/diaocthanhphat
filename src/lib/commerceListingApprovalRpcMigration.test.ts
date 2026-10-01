import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014230000_commerce_listing_approval_rpc.sql'),
  'utf8',
);

describe('commerce listing approval RPC migration', () => {
  it('exposes only the explicit free/paid approval contract', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.approve_user_listing_with_fee_decision(');
    expect(migration).toContain('p_fee_mode text');
    expect(migration).toContain('p_idempotency_key text');
    expect(migration).toContain('p_fee_product_code text DEFAULT NULL');
    expect(migration).toContain('p_manual_reason text DEFAULT NULL');
    expect(migration).toContain("v_fee_mode NOT IN ('free', 'paid')");
    expect(migration).toContain('Free approval requires a manual reason.');
    expect(migration).toContain('Paid approval requires a fee product.');
    expect(migration).toContain('Paid approval cannot include a manual free reason.');
  });

  it('checks scoped approval permission and resolves paid pricing server-side', () => {
    expect(migration).toContain("public.has_staff_permission(");
    expect(migration).toContain("'user-listings', 'approve'");
    expect(migration).toContain('public.commerce_resolve_listing_fee_product(p_listing_id, v_product_code)');
    expect(migration).toContain('v_resolved.amount_minor');
    expect(migration).toContain('v_resolved.duration_days');
    expect(migration).toContain('v_resolved.terms_version');
  });

  it('keeps wallet, decision, property and listing mutation atomic', () => {
    expect(migration).toContain('commerce_reserve_listing_fee_for_approval_internal');
    expect(migration).toContain('commerce_listing_approval_fee_decisions');
    expect(migration).toContain('INSERT INTO public.properties');
    expect(migration).toContain('UPDATE public.user_listings');
    expect(migration).toContain("'listing_fee_decision_created'");
    expect(migration).toContain("'listing_approved_free'");
    expect(migration).toContain("'listing_approved_paid'");
  });

  it('keeps the public approval RPC ACL fail-closed after a rerun-safe correction', () => {
    const aclMigration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/20261015010000_commerce_listing_approval_rpc_acl.sql'),
      'utf8',
    );
    expect(aclMigration).toContain('REVOKE ALL ON FUNCTION public.approve_user_listing_with_fee_decision');
    expect(aclMigration).toContain('FROM PUBLIC, anon;');
    expect(aclMigration).toContain('GRANT EXECUTE ON FUNCTION public.approve_user_listing_with_fee_decision');
    expect(aclMigration).toContain('TO authenticated, service_role;');
  });
});
