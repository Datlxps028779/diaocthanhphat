import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261014000000_commerce_foundation.sql'), 'utf8');
const dryRun = readFileSync(resolve(process.cwd(), 'supabase/manual_commerce_foundation_dry_run.sql'), 'utf8');
const verify = readFileSync(resolve(process.cwd(), 'supabase/manual_commerce_foundation_verify.sql'), 'utf8');

const executableSql = (sql: string) => sql
  .replace(/--.*$/gm, '')
  .replace(/'(?:''|[^'])*'/g, "''");

const tables = [
  'commerce_packages', 'commerce_package_versions', 'commerce_orders', 'commerce_order_items',
  'commerce_payment_attempts', 'commerce_payment_events', 'commerce_webhook_inbox',
  'commerce_refunds', 'commerce_invoices', 'commerce_subscriptions', 'commerce_subscription_periods',
  'commerce_entitlements', 'commerce_quota_reservations', 'commerce_quota_ledger',
  'commerce_audit_events', 'commerce_outbox',
];

describe('commerce foundation migration', () => {
  it('creates every versioned commerce and ledger table without package seeds', () => {
    for (const table of tables) expect(migration).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    expect(migration).not.toMatch(/INSERT\s+INTO\s+public\.commerce_packages/i);
  });

  it('stores money as integer minor units, snapshots package terms, and versions billing mode', () => {
    expect(migration).toContain('unit_amount_minor bigint');
    expect(migration).toContain('total_minor bigint');
    expect(migration).toContain('package_snapshot jsonb NOT NULL');
    expect(migration).toContain('terms_version text NOT NULL');
    expect(migration).toContain("billing_mode text NOT NULL DEFAULT 'one_time'");
    expect(migration).toContain('billing_period_days integer');
    expect(migration).toContain("billing_mode = 'subscription'");
    expect(migration).toContain('currency = \'VND\'');
  });

  it('validates package benefit shape before catalog activation', () => {
    expect(migration).toContain('commerce_package_benefits_valid(p_benefits jsonb)');
    expect(migration).toContain("v_kind NOT IN ('listing_quota', 'listing_duration', 'sponsored_placement', 'seller_analytics')");
    expect(migration).toContain("v_kind IN ('listing_duration', 'sponsored_placement')");
    expect(migration).toContain("v_kind = 'listing_duration' AND NOT (v_benefit ? 'durationDays')");
    expect(migration).toContain("v_kind = 'sponsored_placement'");
    expect(migration).toContain('(v_benefit->>\'quantity\')::bigint > 2147483647');
    expect(migration).toContain('CHECK (public.commerce_package_benefits_valid(benefits))');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.commerce_package_benefits_valid(jsonb)');
  });

  it('preserves immutable subscription period history across renewal orders', () => {
    expect(migration).toContain('subscription_id uuid NOT NULL REFERENCES public.commerce_subscriptions');
    expect(migration).toContain('cycle_number integer NOT NULL');
    expect(migration).toContain('order_id uuid NOT NULL REFERENCES public.commerce_orders');
    expect(migration).toContain('UNIQUE (subscription_id, cycle_number)');
    expect(migration).toContain('UNIQUE (order_id)');
    expect(migration).toContain('subscription_period_id uuid REFERENCES public.commerce_subscription_periods');
    expect(migration).toContain('isfinite(period_start)');
    expect(migration).toContain('isfinite(period_end)');
    expect(migration).toContain('isfinite(grace_until)');
    expect(migration).toContain('CONSTRAINT commerce_subscription_periods_grace_exact CHECK');
    expect(migration).toContain("grace_until = period_end + interval '3 days'");
    expect(migration).toContain("status <> 'grace'");
    expect(migration).toContain('grace_until IS NOT NULL');
  });

  it('guards cross-table subscription and entitlement ownership invariants', () => {
    expect(migration).toContain('guard_commerce_order_identity_immutable()');
    expect(migration).toContain('guard_commerce_order_item_identity_immutable()');
    expect(migration).toContain('guard_commerce_subscription_identity_immutable()');
    expect(migration).toContain('guard_commerce_subscription_period_consistency()');
    expect(migration).toContain('s.owner_user_id = o.owner_user_id');
    expect(migration).toContain('oi.package_version_id = s.package_version_id');
    expect(migration).toContain('guard_commerce_entitlement_consistency()');
    expect(migration).toContain('o.owner_user_id = NEW.owner_user_id');
    expect(migration).toContain('sp.order_id = oi.order_id');
    expect(migration).toContain('s.owner_user_id = NEW.owner_user_id');
    expect(migration).toContain('One-time entitlement cannot reference a subscription period.');
    expect(migration).toContain('FOR KEY SHARE OF s, o');
    expect(migration).toContain('FOR KEY SHARE OF oi, o');
    expect(migration).toContain('FOR KEY SHARE OF sp, s, oi');
    expect(migration).toContain('Commerce subscription period identity is immutable.');
    expect(migration).toContain('trg_commerce_order_identity_immutable');
    expect(migration).toContain('trg_commerce_order_item_identity_immutable');
    expect(migration).toContain('trg_commerce_subscription_identity_immutable');
    expect(migration).toContain('trg_commerce_subscription_period_consistency');
    expect(migration).toContain('trg_commerce_entitlement_consistency');
  });

  it('enforces idempotency and provider event uniqueness', () => {
    expect(migration).toContain('UNIQUE (owner_user_id, idempotency_key)');
    expect(migration).toContain('idempotency_key text NOT NULL UNIQUE');
    expect(migration).toContain('UNIQUE (provider, provider_event_id)');
    expect(migration).toContain('UNIQUE (entitlement_id, idempotency_key)');
  });

  it('separates paid entitlements from editorial flags', () => {
    expect(migration).toContain("'sponsored_placement'");
    expect(migration).toContain('sponsored_label text');
    expect(migration).toContain('commerce_entitlements_sponsored_metadata');
    expect(migration).toContain('commerce_entitlements_active_sponsored_window');
    expect(migration).not.toContain('is_hot');
    expect(migration).not.toContain('is_featured');
  });

  it('enables RLS on all commerce tables and grants no client writes', () => {
    for (const table of tables) expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY`);
    expect(migration).toContain('FROM PUBLIC, anon, authenticated');
    expect(migration).not.toMatch(/GRANT\s+(INSERT|UPDATE|DELETE|ALL).*TO\s+(anon|authenticated)/i);
  });

  it('keeps payment payload and internal audit tables private', () => {
    expect(migration).toContain('provider_payment_id text NOT NULL CHECK');
    expect((migration.match(/verification_method text NOT NULL DEFAULT 'webhook_signature'/g) ?? []).length).toBe(2);
    expect((migration.match(/signed_data_hash text CHECK/g) ?? []).length).toBe(2);
    expect((migration.match(/provider_lookup_hash text CHECK/g) ?? []).length).toBe(2);
    expect(migration).toContain('commerce_payment_events_verification_source');
    expect(migration).toContain('commerce_webhook_inbox_verification_source');
    expect(migration).not.toMatch(/GRANT SELECT ON public\.commerce_payment_events/i);
    expect(migration).not.toMatch(/GRANT SELECT ON public\.commerce_webhook_inbox/i);
    expect(migration).not.toMatch(/GRANT SELECT ON public\.commerce_audit_events/i);
    expect(migration).not.toMatch(/GRANT SELECT ON public\.commerce_outbox/i);
  });

  it('keeps preflight and verification scripts read-only', () => {
    expect(executableSql(dryRun)).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
    expect(executableSql(verify)).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
    expect(dryRun).toContain('prerequisites_pass');
    expect(verify).toContain('commerce_foundation_verify_pass');
    expect(verify).toContain("tgenabled <> 'O'");
    expect(verify).toContain('actual_table_name IS DISTINCT FROM table_name');
    expect(verify).toContain('actual_function_name IS DISTINCT FROM function_name');
    expect(verify).toContain('actual_tgtype IS DISTINCT FROM expected_tgtype');
    expect(verify).toContain("isfinite(period_start)");
    expect(verify).toContain("isfinite(period_end)");
    expect(verify).toContain("isfinite(grace_until)");
    expect(verify).toContain("c.conname = 'commerce_subscription_periods_grace_exact'");
    expect(verify).toContain("NOT ILIKE '%grace_until >=%'");
    expect(verify).toContain("NOT ILIKE '%grace_until <=%'");
    expect(verify).toContain('package_benefit_contract_present');
    expect(verify).toContain('commerce_package_benefits_valid');
    expect(verify).toContain('signed_webhook_contract_present');
    expect(verify).toContain('commerce_payment_events_verification_source');
    expect(verify).toContain('commerce_webhook_inbox_verification_source');
    expect(verify).toContain('exact_grace_constraint_present');
  });
});
