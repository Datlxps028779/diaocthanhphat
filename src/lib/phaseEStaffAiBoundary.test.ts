import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_phase_e_staff_permission_dry_run.sql'),
  'utf8',
);
const permissionSource = readFileSync(
  resolve(process.cwd(), 'src/lib/staffPermissions.ts'),
  'utf8',
);
const authSource = readFileSync(
  resolve(process.cwd(), 'src/lib/server/requireAdmin.ts'),
  'utf8',
);
const aiAutotag = readFileSync(
  resolve(process.cwd(), 'supabase/functions/ai-autotag/index.ts'),
  'utf8',
);
const aiAnalytics = readFileSync(
  resolve(process.cwd(), 'supabase/functions/ai-analytics/index.ts'),
  'utf8',
);

const forbiddenSqlMutation = /\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE)\b/i;

describe('Phase E staff and AI boundary contract', () => {
  it('keeps the Phase E preflight read-only and metadata-based', () => {
    expect(dryRun).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(dryRun).toContain('pg_policies');
    expect(dryRun).toContain('has_function_privilege');
    expect(dryRun).toContain('has_table_privilege');
    expect(dryRun).toContain('non_staff_or_missing_profile_rows');
    expect(dryRun).not.toMatch(forbiddenSqlMutation);
  });

  it('keeps permissions action-granular and geographic', () => {
    expect(permissionSource).toContain("| 'publish'");
    expect(permissionSource).toContain("| 'approve'");
    expect(permissionSource).toContain("| 'manage_media'");
    expect(permissionSource).toContain("| 'manage_seo'");
    expect(permissionSource).toContain("'global' | 'area' | 'district' | 'ward' | 'neighborhood'");
    expect(authSource).toContain("client.rpc('has_staff_permission'");
  });

  it('keeps sensitive AI functions owner-only', () => {
    expect(aiAutotag).toContain('verifyAdmin(req, createClient)');
    expect(aiAutotag).not.toContain('verifyAdminOrStaff(req, createClient)');
    expect(aiAnalytics).toContain('verifyAdmin(req, createClient)');
    expect(aiAnalytics).not.toContain('verifyAdminOrStaff(req, createClient)');
  });

  it('keeps AI autotag output as a draft with provenance', () => {
    expect(aiAutotag).toContain('status: "draft"');
    expect(aiAutotag).toContain('ai_seo_draft: draft');
    expect(aiAutotag).toContain('.eq("status", "pending")');
    expect(aiAutotag).not.toContain('is_published');
  });
});
