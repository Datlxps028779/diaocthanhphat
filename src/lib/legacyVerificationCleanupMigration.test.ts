import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261004000000_clear_orphaned_legacy_verification_projection.sql'), 'utf8');
const dryRun = readFileSync(resolve(process.cwd(), 'supabase/manual_legacy_verification_cleanup_dry_run.sql'), 'utf8');
const postcheck = readFileSync(resolve(process.cwd(), 'supabase/preflight_queries/10-legacy-verification-cleanup-postcheck.sql'), 'utf8');

describe('legacy verification cleanup contract', () => {
  it('updates only the legacy projection behind the internal guard', () => {
    expect(migration).toContain("SELECT set_config('app.property_verification_write', 'true', true);");
    expect(migration).toMatch(/UPDATE public\.properties[\s\S]+SET is_verified = false[\s\S]+WHERE/);
    expect(migration).toContain("p.verification_status = 'unverified'");
    expect(migration).toContain("cardinality(coalesce(p.verification_scope_codes, '{}'::text[])) = 0");
    expect(migration).toContain('p.verified_at IS NULL');
    expect(migration).toContain('p.verified_until IS NULL');
    expect(migration).toContain('NOT EXISTS');
    const updateSet = migration.match(/UPDATE public\.properties[\s\S]+?SET([\s\S]+?)WHERE/i)?.[1] ?? '';
    expect(updateSet.trim()).toBe('is_verified = false');
  });

  it('keeps dry-run and postcheck read-only', () => {
    for (const query of [dryRun, postcheck]) {
      expect(query).toContain('BEGIN TRANSACTION READ ONLY;');
      expect(query.trimEnd()).toMatch(/ROLLBACK;$/);
      expect(query).not.toMatch(/^(?:\s*)(?:INSERT\s+INTO|UPDATE\s+public\.|DELETE\s+FROM|ALTER\s+TABLE|CREATE\s+TABLE|DROP\s+TABLE|GRANT\s|REVOKE\s|SET\s+ROLE|DO\s+\$\$)/im);
    }
  });
});
