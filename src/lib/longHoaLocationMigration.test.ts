import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261005000000_admin_backfill_long_hoa_location.sql'), 'utf8');
const dryRun = readFileSync(resolve(process.cwd(), 'supabase/manual_long_hoa_location_backfill_dry_run.sql'), 'utf8');
const postcheck = readFileSync(resolve(process.cwd(), 'supabase/preflight_queries/13-long-hoa-location-backfill-postcheck.sql'), 'utf8');

describe('Long Hòa location correction contract', () => {
  it('keeps the correction fixed, admin-only, and limited to location fields', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.admin_backfill_long_hoa_location()');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('IF auth.uid() IS NULL OR NOT public.is_admin()');
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.admin_backfill_long_hoa_location() TO authenticated;");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.admin_backfill_long_hoa_location() FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain("SET district = 'Cần Giờ'");
    expect(migration).toContain("district_id = 'acf04041-b171-4f2f-ab4c-0ba288968775'::uuid");
    expect(migration).toContain("ward_id = 'd50fcc80-798b-4fce-a162-7f9ee00cf18e'::uuid");
    expect(migration).toContain("v_listing.property_id IS DISTINCT FROM v_property.id");
    expect(migration).toContain("v_property.latitude IS NOT NULL");
    expect(migration).toContain("v_listing.latitude IS NOT NULL");
    expect(migration).toContain('FOR UPDATE');
    expect(dryRun).toContain('target_count=');
    expect(dryRun).toContain("identity_mapping_matches");
  });

  it('keeps the postcheck read-only and verifies both fixed targets', () => {
    expect(postcheck).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(postcheck.trimEnd()).toMatch(/ROLLBACK;$/);
    expect(postcheck).toContain("'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid");
    expect(postcheck).toContain("'087b078e-a678-49aa-822f-ba26f038012a'::uuid");
    expect(postcheck).toContain("'target_count=%s; pass_count=%s; fail_count=%s; status=%s'");
    expect(postcheck).not.toMatch(/^(?:\s*)(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE|GRANT\s|REVOKE\s|SET\s+ROLE|DO\s+\$\$)/im);
  });
});
