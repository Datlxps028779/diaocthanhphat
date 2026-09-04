import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260912000000_listing_title_normalization.sql'),
  'utf8',
);
const correction = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260912010000_listing_title_normalization_correction.sql'),
  'utf8',
);
const unitFix = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260912020000_listing_title_normalization_unit_fix.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_listing_title_normalization_dry_run.sql'),
  'utf8',
);
const backfill = readFileSync(
  resolve(process.cwd(), 'supabase/manual_listing_title_normalization_backfill.sql'),
  'utf8',
);
const adminBackfill = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260912030000_admin_backfill_listing_titles.sql'),
  'utf8',
);
const adminBackfillCleanup = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260912040000_drop_admin_backfill_listing_titles.sql'),
  'utf8',
);

describe('listing title normalization migration', () => {
  it('cài normalizer và trigger cho cả hai bảng title', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.normalize_listing_title(');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.normalize_listing_title_row()');
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF title ON public\.user_listings/);
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE OF title ON public\.properties/);
  });

  it('giữ boundary an toàn và không backfill trong migration', () => {
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.normalize_listing_title\(text, text, text, text\)/);
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.normalize_listing_title_row\(\)/);
    expect(migration).not.toMatch(/UPDATE public\.(properties|user_listings)\s+SET title\s*=/i);
    expect(migration).not.toMatch(/\bslug\s*=/i);
  });

  it('SQL giữ mixed alphanumeric và chuẩn hóa dash giống TypeScript', () => {
    expect(migration).toContain('v_case_source');
    expect(migration).toContain('FROM regexp_matches(');
    expect(migration).toContain("' - '");
  });

  it('dry-run chỉ đọc dữ liệu', () => {
    const sql = dryRun.replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/\b(UPDATE|DELETE|INSERT|TRUNCATE)\b/i);
    expect(sql).toContain('proposed_title');
  });

  it('backfill chỉ update title, loại verified và rollback khi invariant sai', () => {
    expect(backfill).toMatch(/UPDATE public\.properties property\s+SET title = candidate\.proposed_title/i);
    expect(backfill).toMatch(/UPDATE public\.user_listings listing\s+SET title = candidate\.proposed_title/i);
    expect(backfill).not.toMatch(/SET[\s\S]{0,80}\bslug\s*=/i);
    expect(backfill).toContain("verification_case.status = 'verified'");
    expect(backfill).toContain('Property slug changed during title backfill');
    expect(backfill).toContain('User listing slug changed during title backfill');
    expect(backfill).toContain('RAISE EXCEPTION');
  });

  it('RPC backfill chỉ cho admin authenticated và chỉ cập nhật title', () => {
    expect(adminBackfill).toContain('CREATE OR REPLACE FUNCTION public.admin_backfill_listing_titles()');
    expect(adminBackfill).toContain('RETURNS TABLE');
    expect(adminBackfill).toContain('SECURITY DEFINER');
    expect(adminBackfill).toContain('SET search_path = public, pg_temp');
    expect(adminBackfill).toContain("IF auth.uid() IS NULL OR NOT public.is_admin() THEN");
    expect(adminBackfill).toContain("verification_case.status = 'verified'");
    expect(adminBackfill).toMatch(/UPDATE public\.properties AS property\s+SET title = candidate\.proposed_title/i);
    expect(adminBackfill).toMatch(/UPDATE public\.user_listings AS listing\s+SET title = candidate\.proposed_title/i);
    expect(adminBackfill).toContain('Property title backfill row count mismatch');
    expect(adminBackfill).toContain('User listing title backfill row count mismatch');
    expect(adminBackfill).toContain('property.slug IS DISTINCT FROM candidate.original_slug');
    expect(adminBackfill).toContain('listing.slug IS DISTINCT FROM candidate.original_slug');
    expect(adminBackfill).toMatch(/REVOKE ALL ON FUNCTION public\.admin_backfill_listing_titles\(\) FROM PUBLIC, anon, authenticated/);
    expect(adminBackfill).toMatch(/GRANT EXECUTE ON FUNCTION public\.admin_backfill_listing_titles\(\) TO authenticated/);
    expect(adminBackfill).not.toMatch(/DISABLE TRIGGER|SET ROLE|service_role/i);
  });

  it('cleanup chỉ xóa RPC backfill one-time và reload schema', () => {
    expect(adminBackfillCleanup).toContain('DROP FUNCTION public.admin_backfill_listing_titles();');
    expect(adminBackfillCleanup).toContain("NOTIFY pgrst, 'reload schema'");
    expect(adminBackfillCleanup).not.toMatch(/DROP FUNCTION public\.(normalize_listing_title|normalize_listing_title_row)/);
  });

  it('corrective migration aligns measured unit, punctuation, and protected-name rules', () => {
    expect(correction).toContain('CREATE OR REPLACE FUNCTION public.normalize_listing_title(');
    expect(correction).toContain("'([0-9]),[[:space:]]+([0-9])'");
    expect(correction).toContain("'([0-9]+)M2'");
    expect(correction).toContain("'([0-9]+)M²'");
    expect(correction).toContain("'([0-9]+)M'");
    expect(correction).toContain("'\\mubnd\\M'");
    expect(correction).toContain("'\\mLong[[:space:]]+Hoà\\M'");
    expect(correction).toContain("'Hàn Quốc'");
    expect(correction).toContain("'Sông Sài Gòn'");
    expect(correction).not.toMatch(/UPDATE public\.(properties|user_listings)\s+SET title\s*=/i);
    expect(correction).toContain('NOTIFY pgrst, \'reload schema\'');
    expect(unitFix).toContain('CREATE OR REPLACE FUNCTION public.normalize_listing_title(');
    expect(unitFix).toContain("'([0-9]+)M2'");
    expect(unitFix).toContain("'([0-9]+)M²'");
    expect(unitFix).toContain("'([0-9]+)M'");
    expect(unitFix).not.toMatch(/UPDATE public\.(properties|user_listings)\s+SET title\s*=/i);
  });
});
