import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const shadowMeasurement = readFileSync(
  resolve(process.cwd(), 'supabase/manual_seo_landing_shadow_measurement.sql'),
  'utf8',
);

describe('SEO landing shadow measurement contract', () => {
  it('is read-only and does not decide sitemap eligibility', () => {
    expect(shadowMeasurement).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(shadowMeasurement).toContain('ROLLBACK;');
    expect(shadowMeasurement).toContain("'measurement_only' AS decision");
    expect(shadowMeasurement).toContain('No row from this report is automatically added to sitemap');
    expect(shadowMeasurement).not.toMatch(/^\s*(UPDATE|INSERT|DELETE|TRUNCATE)\s+public\./im);
  });

  it('measures the selected taxonomy dimensions and proposed canonical path', () => {
    expect(shadowMeasurement).toContain('p.listing_type');
    expect(shadowMeasurement).toContain('public.areas');
    expect(shadowMeasurement).toContain('public.districts');
    expect(shadowMeasurement).toContain('public.property_types');
    expect(shadowMeasurement).toContain('max(p.updated_at) AS latest_property_updated_at');
    expect(shadowMeasurement).toContain('active_property_count');
    expect(shadowMeasurement).toContain('proposed_canonical_path');
    expect(shadowMeasurement).toContain("'/%s/%s/%s/%s'");
    expect(shadowMeasurement).toContain("'mua-ban'");
    expect(shadowMeasurement).toContain("'cho-thue'");
  });

  it('reports an example threshold without hard-coding it as the final policy', () => {
    expect(shadowMeasurement).toContain('meets_example_min_5_gate');
    expect(shadowMeasurement).toContain('Illustrative only');
    expect(shadowMeasurement).toContain('choosing the real indexability threshold');
  });
});
