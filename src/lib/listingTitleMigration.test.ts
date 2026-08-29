import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260912000000_listing_title_normalization.sql'),
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
});
