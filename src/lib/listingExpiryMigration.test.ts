import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const expiryOwnershipMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260903020000_harden_listing_expiry_ownership.sql'),
  'utf8',
);

describe('listing expiry ownership migration', () => {
  it('hardens both internal lifecycle functions at the database boundary', () => {
    expect(expiryOwnershipMigration).toContain('CREATE OR REPLACE FUNCTION public.expire_due_listings()');
    expect(expiryOwnershipMigration).toContain('CREATE OR REPLACE FUNCTION public.hide_property_when_listing_unpublished()');
    expect(expiryOwnershipMigration).toMatch(/CREATE OR REPLACE FUNCTION public\.expire_due_listings\(\)[\s\S]*?SECURITY DEFINER\s+SET search_path = public, pg_temp/);
    expect(expiryOwnershipMigration).toMatch(/CREATE OR REPLACE FUNCTION public\.hide_property_when_listing_unpublished\(\)[\s\S]*?SECURITY DEFINER\s+SET search_path = public, pg_temp/);
  });

  it('keeps expiry deterministic and limited to approved due listings', () => {
    expect(expiryOwnershipMigration).toMatch(/UPDATE public\.user_listings\s+SET status = 'expired'/s);
    expect(expiryOwnershipMigration).toContain("WHERE status = 'approved'");
    expect(expiryOwnershipMigration).toContain('AND expires_at IS NOT NULL');
    expect(expiryOwnershipMigration).toContain('AND expires_at <= now()');
    expect(expiryOwnershipMigration).toMatch(/RETURNING 1[\s\S]*SELECT count\(\*\) INTO v_expired_count FROM due;/);
  });

  it('hides only the property linked by the changed or deleted listing', () => {
    expect(expiryOwnershipMigration).toMatch(/TG_OP = 'DELETE'[\s\S]*OLD\.property_id IS NOT NULL/);
    expect(expiryOwnershipMigration).toMatch(/OLD\.status = 'approved'[\s\S]*NEW\.status <> 'approved'/);
    expect(expiryOwnershipMigration.match(/UPDATE public\.properties/g)).toHaveLength(2);
    expect(expiryOwnershipMigration.match(/WHERE id = OLD\.property_id;/g)).toHaveLength(2);
    expect(expiryOwnershipMigration).not.toMatch(/UPDATE public\.properties\s+SET is_active = false\s+WHERE id <>/);
  });

  it('revokes browser execution while leaving cron scheduling untouched', () => {
    expect(expiryOwnershipMigration).toMatch(/REVOKE ALL ON FUNCTION public\.expire_due_listings\(\)\s+FROM PUBLIC, anon, authenticated;/);
    expect(expiryOwnershipMigration).toMatch(/REVOKE ALL ON FUNCTION public\.hide_property_when_listing_unpublished\(\)\s+FROM PUBLIC, anon, authenticated;/);
    expect(expiryOwnershipMigration).not.toMatch(/GRANT EXECUTE[^;]+(anon|authenticated)/);
    expect(expiryOwnershipMigration).not.toContain('cron.schedule');
    expect(expiryOwnershipMigration).not.toContain('cron.unschedule');
  });

  it('does not backfill data or manufacture lifecycle events', () => {
    expect(expiryOwnershipMigration).not.toMatch(/INSERT INTO public\.user_listing_lifecycle_events/i);
    expect(expiryOwnershipMigration).not.toMatch(/UPDATE public\.user_listings[\s\S]+WHERE status = 'approved' AND expires_at IS NULL/i);
  });
});
