import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const groupedMeasurement = readFileSync(
  resolve(process.cwd(), 'supabase/manual_seo_landing_grouped_shadow_measurement.sql'),
  'utf8',
);

describe('SEO landing grouped type measurement contract', () => {
  it('remains read-only and measurement-only', () => {
    expect(groupedMeasurement).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(groupedMeasurement).toContain('ROLLBACK;');
    expect(groupedMeasurement).toContain("'measurement_only' AS decision");
    expect(groupedMeasurement).not.toMatch(/^\s*(UPDATE|INSERT|DELETE|TRUNCATE)\s+public\./im);
  });

  it('uses explicit nha/dat mappings and reports unmapped types', () => {
    expect(groupedMeasurement).toContain("WHEN 'nha-pho' THEN 'nha'");
    expect(groupedMeasurement).toContain("WHEN 'dat-nen' THEN 'dat'");
    expect(groupedMeasurement).toContain("WHEN 'dat-mau-dat-sao' THEN 'dat'");
    expect(groupedMeasurement).toContain("'unmapped_property_type'");
    expect(groupedMeasurement).toContain('do not silently classify it into nha/dat');
    expect(groupedMeasurement).toContain('proposed_canonical_path');
    expect(groupedMeasurement).toContain('meets_example_min_5_group_gate');
  });
});
