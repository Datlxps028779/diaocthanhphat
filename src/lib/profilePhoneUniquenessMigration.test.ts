import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');

const migration = read('supabase/migrations/20261013000000_profiles_normalized_phone_unique.sql');
const audit = read('supabase/manual_auth_identity_phone_audit.sql');
const cleanupDryRun = read('supabase/manual_duplicate_phone_cleanup_dry_run.sql');
const cleanupApply = read('supabase/manual_duplicate_phone_cleanup_apply.sql');
const postVerify = read('supabase/manual_profile_phone_uniqueness_verify.sql');

describe('profile phone uniqueness database boundary', () => {
  it('enforces uniqueness on the normalized phone expression', () => {
    expect(migration).toContain('CREATE UNIQUE INDEX IF NOT EXISTS profiles_normalized_phone_unique');
    expect(migration).toContain('public.normalize_vn_phone(phone)');
    expect(migration).toContain("WHERE NULLIF(public.normalize_vn_phone(phone), '') IS NOT NULL");
  });

  it('fails closed when normalized duplicate groups remain', () => {
    expect(migration).toContain('HAVING count(*) > 1');
    expect(migration).toContain("USING ERRCODE = '23505'");
    expect(migration).toContain('Duplicate normalized profile phones must be resolved first');
  });

  it('does not expose a public phone-availability lookup', () => {
    expect(migration).not.toMatch(/GRANT\s+EXECUTE[\s\S]*\b(?:anon|PUBLIC)\b/i);
    expect(migration).not.toMatch(/is_phone_(?:available|taken)/i);
  });
});

describe('duplicate phone production scripts', () => {
  it('keeps audits read-only and reports no writes', () => {
    for (const sql of [audit, cleanupDryRun]) {
      expect(sql).toContain('BEGIN TRANSACTION READ ONLY');
      expect(sql).toContain("'write_performed', false");
      expect(sql).toContain('ROLLBACK;');
      expect(sql).not.toMatch(/\b(?:INSERT|UPDATE|DELETE)\s+(?:INTO|FROM|public\.|auth\.)/i);
    }
    expect(cleanupDryRun).toContain("'checks', (SELECT to_jsonb(c) FROM checks c)");
  });

  it('pins cleanup to the measured account identities and aborts on drift', () => {
    expect(cleanupApply).toContain('638c8de1-c0f1-414e-95c9-5b1545ceee2e');
    expect(cleanupApply).toContain('6149cd97-47d4-43a2-9e67-1fcc23ea168e');
    expect(cleanupApply).toContain('duplicate phone group changed since dry-run');
    expect(cleanupApply).toContain('losing account gained business dependencies');
    expect(cleanupApply).toContain('DELETE FROM auth.users WHERE id = losing_user_id');
  });

  it('protects agent-profile history during the cascading account delete', () => {
    expect(cleanupDryRun).toContain('nonautomatic_audit_events');
    expect(cleanupDryRun).toContain('slug_aliases');
    expect(cleanupApply).toContain('DISABLE TRIGGER trg_agent_profile_audit');
    expect(cleanupApply).toContain('ENABLE TRIGGER trg_agent_profile_audit');
    expect(cleanupApply).toContain('LOCK TABLE public.agent_profiles IN ACCESS EXCLUSIVE MODE');
  });

  it('verifies cleanup, index readiness and the profile trigger without writing', () => {
    expect(postVerify).toContain('BEGIN TRANSACTION READ ONLY');
    expect(postVerify).toContain('profiles_normalized_phone_unique');
    expect(postVerify).toContain('no_duplicate_normalized_phones');
    expect(postVerify).toContain('profile_identity_trigger_enabled');
    expect(postVerify).toContain("'pass'");
    expect(postVerify).toContain('ROLLBACK;');
  });
});
