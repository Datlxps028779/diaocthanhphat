import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014010000_commerce_rpc_foundation.sql'),
  'utf8',
);

describe('commerce RPC foundation migration', () => {
  it('creates server-priced order and atomic quota RPCs', () => {
    expect(migration).toContain('public.commerce_create_order(');
    expect(migration).toContain('public.commerce_reserve_listing_quota(');
    expect(migration).toContain('public.commerce_consume_listing_quota(');
    expect(migration).toContain('public.commerce_release_listing_quota(');
  });

  it('returns an existing idempotent order before checking current package availability', () => {
    const existingOrderLookup = migration.indexOf('FROM public.commerce_orders');
    const packageAvailabilityLookup = migration.indexOf('FROM public.commerce_package_versions');
    expect(existingOrderLookup).toBeGreaterThan(0);
    expect(existingOrderLookup).toBeLessThan(packageAvailabilityLookup);
  });

  it('serializes and rate-limits new orders per owner without blocking idempotent replay', () => {
    const replay = migration.indexOf('IF FOUND THEN');
    const advisory = migration.indexOf('pg_advisory_xact_lock');
    expect(replay).toBeGreaterThan(0);
    expect(replay).toBeLessThan(advisory);
    expect(migration).toContain("created_at > now() - interval '1 hour'");
    expect(migration).toContain('Order creation rate limit exceeded.');
  });

  it('calculates price and tax from the locked package version', () => {
    expect(migration).toContain('FROM public.commerce_package_versions');
    expect(migration).toContain('FOR SHARE');
    expect(migration).toContain('v_subtotal := v_version.unit_amount_minor * p_quantity');
    expect(migration).toContain('v_version.tax_rate_basis_points');
    expect(migration).not.toMatch(/p_(amount|currency|tax|price)/i);
  });

  it('uses owner-scoped idempotency and rejects request reuse with different input', () => {
    expect(migration).toContain('owner_user_id = v_actor');
    expect(migration).toContain('idempotency_key = p_idempotency_key');
    expect(migration).toContain('Idempotency key was already used for another order request.');
    expect(migration).toContain('Idempotency key was already used for another reservation.');
    expect(migration).toContain('p_expires_at IS NOT NULL AND v_reservation.expires_at IS DISTINCT FROM p_expires_at');
  });

  it('locks entitlement, listing, reservation and property rows around quota transitions', () => {
    expect(migration).toContain('FROM public.commerce_entitlements');
    expect(migration).toContain('FROM public.commerce_quota_reservations');
    expect(migration).toContain('FROM public.user_listings');
    expect(migration).toContain('FOR UPDATE OF l, p');
    expect((migration.match(/FOR UPDATE;/g) ?? []).length).toBeGreaterThanOrEqual(7);
  });

  it('uses entitlement-before-reservation lock ordering in every quota mutation', () => {
    const reserve = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.commerce_reserve_listing_quota'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.commerce_consume_listing_quota'),
    );
    const consume = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.commerce_consume_listing_quota'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.commerce_release_listing_quota'),
    );
    const release = migration.slice(migration.indexOf('CREATE OR REPLACE FUNCTION public.commerce_release_listing_quota'));
    for (const fn of [reserve, consume, release]) {
      expect(fn.indexOf('FROM public.commerce_entitlements')).toBeGreaterThan(0);
      expect(fn.indexOf('FROM public.commerce_entitlements')).toBeLessThan(
        fn.indexOf('SELECT * INTO v_reservation\n  FROM public.commerce_quota_reservations'),
      );
    }
  });

  it('deducts availability at reserve, consumes with zero delta, and restores on release', () => {
    expect(migration).toContain("operation = 'consume' AND delta = 0");
    expect(migration).toContain('quantity_remaining = quantity_remaining - p_quantity');
    expect(migration).toContain("'reserve',\n    -p_quantity");
    expect(migration).toContain("'consume',\n    0");
    expect(migration).toContain('quantity_remaining = quantity_remaining + v_reservation.quantity');
  });

  it('rejects expired or revoked entitlements for reserve and consume', () => {
    expect((migration.match(/v_entitlement\.status <> 'active'/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((migration.match(/v_entitlement\.starts_at IS NOT NULL/g) ?? []).length).toBeGreaterThanOrEqual(2);
    expect((migration.match(/v_entitlement\.ends_at IS NOT NULL/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });

  it('returns historical idempotent results before current entitlement validity checks', () => {
    const reserve = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.commerce_reserve_listing_quota'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.commerce_consume_listing_quota'),
    );
    const consume = migration.slice(
      migration.indexOf('CREATE OR REPLACE FUNCTION public.commerce_consume_listing_quota'),
      migration.indexOf('CREATE OR REPLACE FUNCTION public.commerce_release_listing_quota'),
    );
    expect(reserve.indexOf('IF FOUND THEN')).toBeLessThan(reserve.indexOf('Reservation expiry must be in the future.'));
    expect(reserve.indexOf('IF FOUND THEN')).toBeLessThan(reserve.indexOf("IF v_entitlement.status <> 'active'"));
    expect(consume.indexOf('IF FOUND THEN')).toBeLessThan(consume.indexOf("IF v_entitlement.status <> 'active'"));
  });

  it('reconciles an expired reservation only when approval happened before expiry', () => {
    expect(migration).toContain('FROM public.user_listing_lifecycle_events');
    expect(migration).toContain("event_type IN ('submitted', 'approved', 'rejected', 'resubmitted', 'renewed', 'expired')");
    expect(migration).toContain("ORDER BY occurred_at DESC, (to_status = 'approved') DESC, id DESC");
    expect(migration).toContain("v_latest_lifecycle_event_type IS DISTINCT FROM 'approved'");
    expect(migration).toContain('v_approved_at < v_reservation.created_at');
    expect(migration).toContain('v_approved_at > v_reservation.expires_at');
    expect(migration).toContain('Expired reservation was not approved within its validity window.');
  });

  it('never releases quota for an approved listing', () => {
    expect(migration).toContain("IF v_listing_status = 'approved' THEN");
    expect(migration).toContain('Approved listing quota must be consumed, not released.');
  });

  it('validates operation idempotency before mutation and never drops ledger conflicts', () => {
    expect(migration).toContain('Idempotency key was already used for another quota operation.');
    expect(migration).toContain('Reservation was consumed with another idempotency key.');
    expect(migration).toContain('Reservation was released with another idempotency key.');
    expect((migration.match(/ON CONFLICT/g) ?? []).length).toBe(1);
  });

  it('fails closed unless the consumed listing is approved with an active property', () => {
    expect(migration).toContain('JOIN public.properties p ON p.id = l.property_id AND p.is_active = true');
    expect(migration).toContain("AND l.status = 'approved'");
    expect(migration).toContain('Approved listing with active property not found.');
  });

  it('fixes search paths and exposes RPC execution only to authenticated users', () => {
    const functions = [
      'commerce_create_order(uuid, integer, text)',
      'commerce_reserve_listing_quota(uuid, uuid, integer, text, timestamptz)',
      'commerce_consume_listing_quota(uuid, text)',
      'commerce_release_listing_quota(uuid, text)',
    ];
    expect((migration.match(/SECURITY DEFINER/g) ?? []).length).toBe(4);
    expect((migration.match(/SET search_path = public, pg_temp/g) ?? []).length).toBe(4);
    for (const fn of functions) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO authenticated;`);
    }
  });
});
