import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const measurement = readFileSync(
  resolve(process.cwd(), 'supabase/manual_canonical_field_measurement.sql'),
  'utf8',
);
const conflicts = readFileSync(
  resolve(process.cwd(), 'supabase/manual_canonical_field_measurement_conflicts.sql'),
  'utf8',
);
const locationDetail = readFileSync(
  resolve(process.cwd(), 'supabase/manual_canonical_location_conflict_detail.sql'),
  'utf8',
);
const locationCorrection = readFileSync(
  resolve(process.cwd(), 'supabase/manual_canonical_location_conflict_correction.sql'),
  'utf8',
);
const locationCorrectionMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930060000_admin_correct_confirmed_location_conflict.sql'),
  'utf8',
);
const titleDryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_listing_title_normalization_dry_run.sql'),
  'utf8',
);

function assertReadOnlySql(sql: string) {
  expect(sql).toContain('BEGIN TRANSACTION READ ONLY;');
  expect(sql).toContain('ROLLBACK;');
  expect(sql).not.toMatch(/^\s*(UPDATE|INSERT|DELETE)\s+public\./im);
}

describe('canonical field measurement SQL', () => {
  it('keeps the full field measurement read-only and non-authoritative', () => {
    assertReadOnlySql(measurement);
    expect(measurement).toContain("'canonical_field_measurement'");
    expect(measurement).toContain('Candidate count only; no repair winner is inferred.');
    expect(measurement).toContain("'title_text_mismatch'");
    expect(measurement).toContain("'location_structured_id_mismatch'");
  });

  it('keeps the single-result conflict report read-only and manual-review oriented', () => {
    assertReadOnlySql(conflicts);
    expect(conflicts).toContain("'field_conflict'");
    expect(conflicts).toContain('Do not backfill from this row without source evidence');
    expect(conflicts).not.toContain("'property_with_multiple_conflicting_listings'");
  });

  it('keeps location evidence detail read-only and scoped to the measured pair', () => {
    assertReadOnlySql(locationDetail);
    expect(locationDetail).toContain("'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid");
    expect(locationDetail).toContain("'087b078e-a678-49aa-822f-ba26f038012a'::uuid");
    expect(locationDetail).toContain('property_formatted_address');
    expect(locationDetail).toContain('listing_formatted_address');
    expect(locationDetail).toContain('coordinate_conflict');
    expect(locationDetail).toContain('property_coordinate_in_property_ward');
    expect(locationDetail).toContain('property_coordinate_in_listing_ward');
    expect(locationDetail).toContain('Do not update property/listing location');
  });

  it('keeps the location correction behind a fixed-scope authenticated admin RPC', () => {
    expect(locationCorrection).toContain('must not be run from the SQL Editor');
    expect(locationCorrection).toContain('/api/admin/canonical-location-correction');
    expect(locationCorrection).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(locationCorrection).toContain('ROLLBACK;');
    expect(locationCorrection).not.toMatch(/^\s*UPDATE\s+public\./im);

    expect(locationCorrectionMigration).toContain('CREATE OR REPLACE FUNCTION public.admin_correct_confirmed_location_conflict()');
    expect(locationCorrectionMigration).toContain('SECURITY DEFINER');
    expect(locationCorrectionMigration).toContain('IF auth.uid() IS NULL OR NOT public.is_admin()');
    expect(locationCorrectionMigration).toContain("'e05fd411-e6a3-4390-9096-69e3d47605f4'::uuid");
    expect(locationCorrectionMigration).toContain("'087b078e-a678-49aa-822f-ba26f038012a'::uuid");
    expect(locationCorrectionMigration).toContain("SET city = v_property.city");
    expect(locationCorrectionMigration).toContain("district = v_property.district");
    expect(locationCorrectionMigration).toContain("ward = v_property.ward");
    expect(locationCorrectionMigration).toContain('taxonomy_geo_covers_point');
    expect(locationCorrectionMigration).toContain('REVOKE ALL ON FUNCTION public.admin_correct_confirmed_location_conflict() FROM PUBLIC, anon, authenticated;');
    expect(locationCorrectionMigration).toContain('GRANT EXECUTE ON FUNCTION public.admin_correct_confirmed_location_conflict() TO authenticated;');
    expect(locationCorrectionMigration).not.toContain('p_patch');
    expect(locationCorrectionMigration).not.toContain('property_id = v_property.id');
  });

  it('limits the title dry-run to lossless formatting candidates', () => {
    assertReadOnlySql(titleDryRun);
    expect(titleDryRun).toContain("'safe_spacing_candidate'");
    expect(titleDryRun).toContain("'manual_review_missing_title'");
    expect(titleDryRun).toContain("'manual_review_non_current_listing'");
    expect(titleDryRun).toContain("'manual_review_inactive_property'");
    expect(titleDryRun).toContain('proposed_title');
    expect(titleDryRun).toContain('proposed_corrections');
    expect(titleDryRun).toContain('Candidate only. Do not update from this report');
  });
});
