import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261014070000_commerce_listing_lifecycle_enforcement.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_listing_lifecycle_dry_run.sql'),
  'utf8',
);
const verify = readFileSync(
  resolve(process.cwd(), 'supabase/manual_commerce_listing_lifecycle_verify.sql'),
  'utf8',
);

const executableSql = (sql: string) => sql
  .replace(/--.*$/gm, '')
  .replace(/'(?:''|[^'])*'/g, "''");

describe('commerce listing lifecycle enforcement migration', () => {
  it('tracks a distinct quota cycle for every listing submission round', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS submission_cycle integer');
    expect(migration).toContain('uq_commerce_quota_listing_cycle');
    expect(migration).toContain('uq_commerce_quota_listing_reserved');
    expect(migration).toContain("status = 'reserved'");
    expect(migration).toContain('max(r.submission_cycle)');
  });

  it('enforces only accounts enrolled by a quota entitlement', () => {
    expect(migration).toContain("e.benefit_kind = 'listing_quota'");
    expect(migration).toContain('commerce_owner_has_quota_history');
    expect(migration).toContain('commerce_reserve_listing_quota_cycle');
    expect(migration).toContain('Insufficient active listing quota.');
  });

  it('reserves, consumes and returns quota from database lifecycle transitions', () => {
    expect(migration).toContain('commerce_consume_listing_quota_cycle');
    expect(migration).toContain('commerce_close_listing_quota_cycle');
    expect(migration).toContain("NEW.status = 'pending'");
    expect(migration).toContain("NEW.status = 'approved'");
    expect(migration).toContain("NEW.status = 'rejected'");
    expect(migration).toContain("NEW.status = 'expired'");
    expect(migration).toContain("TG_OP = 'DELETE'");
    expect(migration).toContain('operation, delta');
    expect(migration).toContain('balance_after, idempotency_key');
  });

  it('binds and activates listing-specific benefits without editorial flags', () => {
    expect(migration).toContain("benefit_kind IN ('listing_duration','sponsored_placement')");
    expect(migration).toContain("status IN ('awaiting_listing_approval','suspended')");
    expect(migration).toContain("SET status = 'active'");
    expect(migration).toContain("SET status = 'suspended'");
    expect(migration).toContain("SET status = 'expired'");
    expect(migration).toContain("SET status = 'revoked'");
    expect(migration).not.toContain('is_hot');
    expect(migration).not.toContain('is_featured');
  });

  it('filters effective entitlements at read time', () => {
    expect(migration).toContain('CREATE OR REPLACE VIEW public.commerce_effective_entitlements');
    expect(migration).toContain("status = 'active'");
    expect(migration).toContain('(e.starts_at IS NULL OR e.starts_at <= clock_timestamp())');
    expect(migration).toContain('(e.ends_at IS NULL OR e.ends_at > clock_timestamp())');
  });

  it('keeps lifecycle preflight and verification read-only', () => {
    for (const sql of [dryRun, verify]) {
      expect(executableSql(sql)).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|DO)\b/i);
    }
    expect(dryRun).toContain("to_jsonb('deferred_until_migration'::text)");
    expect(dryRun).toContain("to_jsonb('deferred_until_verify'::text)");
    expect(dryRun).not.toContain("'deferred_until_migration'::jsonb");
    expect(dryRun).toContain('commerce_listing_lifecycle_preflight');
    expect(dryRun).toContain('listings_with_duplicate_active_reservations');
    expect(verify).toContain('commerce_listing_lifecycle_verify_pass');
    expect(verify).toContain('security_invoker=true');
    expect(verify).toContain('tgtype = 21');
    expect(verify).toContain('tgtype = 11');
  });

  it('keeps lifecycle helpers private and the trigger hardened', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain('trg_commerce_listing_entitlement_lifecycle');
    expect(migration).toContain('AFTER INSERT OR UPDATE ON public.user_listings');
    expect(migration).toContain('trg_commerce_listing_entitlement_delete');
    expect(migration).toContain('BEFORE DELETE ON public.user_listings');
    for (const fn of [
      'commerce_owner_has_quota_history(uuid)',
      'commerce_reserve_listing_quota_cycle(uuid, uuid)',
      'commerce_consume_listing_quota_cycle(uuid, uuid)',
      'commerce_close_listing_quota_cycle(uuid, uuid, text)',
      'sync_commerce_listing_entitlement_lifecycle()',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated;`);
    }
  });
});
