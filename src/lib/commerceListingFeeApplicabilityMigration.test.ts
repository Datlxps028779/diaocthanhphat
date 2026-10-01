import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014200000_commerce_listing_fee_applicability.sql'),
  'utf8',
);

describe('commerce listing fee applicability migration', () => {
  it('stores deterministic listing and property-type applicability rules', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.commerce_fee_product_rules');
    expect(migration).toContain("listing_type IN ('mua_ban', 'cho_thue', 'can_mua', 'can_thue')");
    expect(migration).toContain('property_type_id uuid REFERENCES public.property_types(id) ON DELETE RESTRICT');
    expect(migration).toContain('priority integer NOT NULL DEFAULT 100');
    expect(migration).toContain('uq_commerce_fee_product_rules_broad_priority');
    expect(migration).toContain('uq_commerce_fee_product_rules_specific_priority');
  });

  it('resolves only active, valid listing-basic products by server-owned rules', () => {
    expect(migration).toContain('public.commerce_resolve_listing_fee_product');
    expect(migration).toContain("p.product_kind = 'listing_basic'");
    expect(migration).toContain('p.is_active = true');
    expect(migration).toContain('r.is_active = true');
    expect(migration).toContain('(r.property_type_id IS NOT NULL) DESC');
    expect(migration).toContain('r.priority DESC');
    expect(migration).toContain('p.version DESC');
    expect(migration).toContain("RAISE EXCEPTION 'No applicable active listing fee product was found.'");
  });

  it('gates admin rule management and records before/after audit state', () => {
    expect(migration).toContain("has_staff_permission('commerce-wallet', 'view')");
    expect(migration).toContain("has_staff_permission('commerce-wallet', 'edit')");
    expect(migration).toContain('Fee product rule identity is immutable; create a new rule instead.');
    expect(migration).toContain('commerce_fee_product_rule_created');
    expect(migration).toContain('commerce_fee_product_rule_updated');
    expect(migration).toContain('before_state, after_state');
    expect(migration).toContain('SET search_path = public, pg_temp');
  });

  it('does not expose direct rule table grants or public resolver execution', () => {
    expect(migration).toContain('ALTER TABLE public.commerce_fee_product_rules ENABLE ROW LEVEL SECURITY;');
    expect(migration).toContain('REVOKE ALL ON TABLE public.commerce_fee_product_rules FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.commerce_resolve_listing_fee_product(uuid, text) FROM PUBLIC, anon, authenticated;');
    expect(migration).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)\s+ON\s+TABLE\s+public\.commerce_fee_product_rules/i);
  });
});
