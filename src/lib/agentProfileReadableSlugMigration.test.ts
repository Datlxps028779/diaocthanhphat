import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261006000000_agent_profile_readable_slugs.sql'),
  'utf8',
);
const randomSlugMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261007000000_agent_profile_random_slug_ids.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_agent_profile_slugs_readable_dry_run.sql'),
  'utf8',
);
const apply = readFileSync(
  resolve(process.cwd(), 'supabase/manual_agent_profile_slugs_readable_apply.sql'),
  'utf8',
);
const oneTimeSlugMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261008000000_agent_profile_slug_one_time_change.sql'),
  'utf8',
);
const nullableSlugHelperMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261009000000_agent_profile_slug_helper_nullable.sql'),
  'utf8',
);
const legacyApply = readFileSync(
  resolve(process.cwd(), 'supabase/manual_agent_profile_slug_vo_thi_my_nhan_apply.sql'),
  'utf8',
);
const accountHub = readFileSync(resolve(process.cwd(), 'src/screens/AccountHubPage.tsx'), 'utf8');

describe('agent profile readable slug migration', () => {
  it('transliterates Vietnamese names and allocates numeric collisions under a lock', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.slugify_agent_profile_name');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.allocate_agent_profile_slug');
    expect(migration).toContain("pg_advisory_xact_lock(hashtextextended('agent-profile-slug:' || v_base, 0))");
    expect(migration).toContain("v_suffix := v_suffix + 1");
  });

  it('generates a stable random-looking ID suffix on the server', () => {
    expect(randomSlugMigration).toContain('CREATE OR REPLACE FUNCTION public.agent_profile_slug_id');
    expect(randomSlugMigration).toContain("substr(md5(p_profile_id::text), 1, 8)");
    expect(randomSlugMigration).toContain("substr(md5(gen_random_uuid()::text), 1, 8)");
    expect(randomSlugMigration).toContain('CREATE OR REPLACE FUNCTION public.agent_profile_slug_for_id');
    expect(dryRun).toContain('public.agent_profile_slug_for_id(NULL, ap.display_name, ap.id)');
    expect(dryRun).not.toContain('vo-thi-my-nhan-id');
  });

  it('preserves aliases for old profile slugs', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.agent_profile_slug_aliases');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.remember_agent_profile_slug_alias');
    expect(migration).toContain('alias_row.old_slug = lower(btrim(p_slug))');
  });

  it('enforces one confirmed slug change and a permanent lock', () => {
    expect(oneTimeSlugMigration).toContain('slug_change_count integer NOT NULL DEFAULT 0');
    expect(oneTimeSlugMigration).toContain('p_confirm_slug_change boolean');
    expect(oneTimeSlugMigration).toContain('Cần xác nhận rõ ràng trước khi đổi slug hồ sơ');
    expect(oneTimeSlugMigration).toContain('Slug hồ sơ đã khóa vĩnh viễn sau lần đổi trước đó');
    expect(oneTimeSlugMigration).toContain('slug_change_count = CASE WHEN v_slug_changed THEN 1');
    expect(nullableSlugHelperMigration).not.toContain('\nSTRICT\n');
    expect(nullableSlugHelperMigration).toContain('COALESCE(NULLIF(btrim(p_requested_slug), \'\'), p_display_name)');
    expect(oneTimeSlugMigration).toContain('REVOKE INSERT, UPDATE, DELETE ON TABLE public.agent_profiles FROM authenticated');
    expect(oneTimeSlugMigration).toContain('slug_change_count integer,');
    expect(dryRun).toContain('LOCKED_NO_CHANGE');
    expect(apply).toContain('plan.slug_change_count = 0');
  });
  it('applies the readable slug policy to all profile creation paths', () => {
    expect(migration).toContain('public.allocate_agent_profile_slug(NULL, v_display_name)');
    expect(migration).toContain('public.allocate_agent_profile_slug(p_slug, v_name)');
    expect(accountHub).toContain("import { buildAgentProfileSlug } from '../lib/slug';");
    expect(accountHub).toContain("buildAgentProfileSlug(agentNameVal || 'nguoi-dang-tin')");
    expect(accountHub).not.toContain('buildUniqueSlug(agentNameVal');
  });

  it('requires dry-run safety and an explicit admin audit actor before apply', () => {
    expect(dryRun).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/im);
    expect(dryRun).toContain('SAFE_TO_UPDATE');
    expect(dryRun).toContain('UNSAFE_CURRENT_SLUG_COLLISION');
    expect(apply).toContain("app.agent_profile_audit_actor");
    expect(apply).toContain('Audit actor phải là profile admin hợp lệ');
    expect(apply).toContain('BEGIN;');
    expect(apply).toContain('COMMIT;');
    expect(legacyApply).toContain('đã được thay thế');
    expect(legacyApply).not.toMatch(/^\s*(INSERT|UPDATE|DELETE)\b/im);
  });
});
