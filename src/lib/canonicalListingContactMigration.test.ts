import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930020000_canonical_listing_contact.sql'),
  'utf8',
);
const maintenanceMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930030000_canonical_contact_backfill_maintenance.sql'),
  'utf8',
);
const revokeHandleNewUserMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930040000_revoke_handle_new_user_execute.sql'),
  'utf8',
);
const preflight = readFileSync(
  resolve(process.cwd(), 'supabase/manual_canonical_contact_visibility_preflight.sql'),
  'utf8',
);
const backfillDryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_canonical_contact_backfill_dry_run.sql'),
  'utf8',
);
const backfillApply = readFileSync(
  resolve(process.cwd(), 'supabase/manual_canonical_contact_backfill_apply.sql'),
  'utf8',
);
const backfillVerify = readFileSync(
  resolve(process.cwd(), 'supabase/manual_canonical_contact_backfill_verify.sql'),
  'utf8',
);

describe('canonical listing contact migration', () => {
  it('requires and canonicalizes Vietnamese account identity', () => {
    expect(migration).toContain('ALTER TABLE public.user_listings ADD COLUMN IF NOT EXISTS contact_zalo text;');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.enforce_profile_identity()');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.handle_new_user()');
    expect(migration).toContain("RAISE EXCEPTION 'Họ tên là bắt buộc'");
    expect(migration).toContain("RAISE EXCEPTION 'Số điện thoại Việt Nam không hợp lệ'");
  });

  it('derives every listing contact field from the owner profile', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.canonicalize_user_listing_contact()');
    expect(migration).toContain('NEW.contact_name := v_display_name;');
    expect(migration).toContain('NEW.contact_phone := v_phone;');
    expect(migration).toContain('NEW.contact_zalo := v_phone;');
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE ON public\.user_listings/);
  });

  it('keeps privileged functions fixed-path and private', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.normalize_vn_phone(text) FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.sync_user_listing_contact(uuid) FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.approve_user_listing(uuid) TO authenticated;');
  });

  it('keeps the preflight runnable before migration', () => {
    expect(preflight).not.toContain('public.normalize_vn_phone(');
    expect(preflight).not.toContain('public.is_valid_vn_phone(');
    expect(preflight).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(preflight).toContain('ROLLBACK;');
  });

  it('keeps the backfill dry-run read-only and scoped to safe rows', () => {
    expect(backfillDryRun).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(backfillDryRun).toContain('ROLLBACK;');
    expect(backfillDryRun).toContain("status = 'approved'");
    expect(backfillDryRun).toContain("'blocked_without_property'");
    expect(backfillDryRun).toContain("'blocked_inactive_property'");
    expect(backfillDryRun).toContain("'blocked_unlinked_property'");
    expect(backfillDryRun).toContain("'write_performed', false");
    expect(backfillDryRun).not.toMatch(/\b(UPDATE|INSERT|DELETE)\s+public\./i);
  });

  it('keeps the backfill apply guarded and transactional', () => {
    expect(backfillApply).toContain('BEGIN;');
    expect(backfillApply).toContain('SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;');
    expect(backfillApply).toContain("PERFORM set_config('app.canonical_contact_backfill', 'true', true);");
    expect(backfillApply).toContain("expected 25 approved/active listing scope rows");
    expect(backfillApply).toContain("expected 25 distinct property scope rows");
    expect(backfillApply).toContain('It is idempotent');
    expect(backfillApply).toContain('COMMIT;');
    expect(backfillApply).toContain("status = 'approved'");
    expect(backfillApply).toContain('p.is_active IS TRUE');
    expect(backfillApply).not.toContain('DELETE FROM');
    expect(backfillApply).not.toContain('is_active = true');
  });

  it('removes direct RPC execution from the auth trigger function', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;');
    expect(revokeHandleNewUserMigration).toContain('REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;');
  });

  it('limits the SQL-editor bypass to an explicit system transaction', () => {
    expect(maintenanceMigration).toContain("session_user IN ('postgres', 'supabase_admin')");
    expect(maintenanceMigration).toContain("current_setting('app.canonical_contact_backfill', true) = 'true'");
    expect(maintenanceMigration).toContain('auth.uid() IS NULL');
    expect(maintenanceMigration).toContain('OR public.is_admin()');
    expect(maintenanceMigration).toContain('REVOKE ALL ON FUNCTION public.assert_user_listing_mutation_scope()');
  });


  it('keeps post-verification read-only and checks zero mismatches', () => {
    expect(backfillVerify).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(backfillVerify).toContain('ROLLBACK;');
    expect(backfillVerify).toContain("'listing_contact_mismatches'");
    expect(backfillVerify).toContain("'property_contact_mismatches'");
    expect(backfillVerify).toContain("'write_performed', false");
    expect(backfillVerify).not.toMatch(/\b(UPDATE|INSERT|DELETE)\s+public\./i);
  });
});
