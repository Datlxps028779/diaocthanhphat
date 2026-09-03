import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260918000000_agent_profiles.sql'),
  'utf8',
);

const hardeningMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260918010000_agent_profiles_privilege_hardening.sql'),
  'utf8',
);

const minimumPrivilegesMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260918020000_agent_profiles_minimum_privileges.sql'),
  'utf8',
);

const publicReadMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260901000000_public_agent_profile_read.sql'),
  'utf8',
);

const queryIndexMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260922020000_agent_profile_query_index.sql'),
  'utf8',
);

const defaultPublicMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260923000000_agent_profiles_default_public.sql'),
  'utf8',
);

const roleTransitionMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260928000000_sync_agent_profile_on_role_change.sql'),
  'utf8',
);

const activityMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260924000000_public_agent_profile_activity.sql'),
  'utf8',
);

const activityDryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_public_agent_profile_activity_dry_run.sql'),
  'utf8',
);

describe('agent profile migration', () => {
  it('keeps public identity separate from internal roles and supports explicit states', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.agent_profiles');
    expect(migration).toContain("status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'disabled'))");
    expect(migration).toContain("user_id uuid NOT NULL UNIQUE REFERENCES public.profiles(id)");
    expect(migration).not.toContain("role IN ('agent'");
  });

  it('uses an approved user listing and active property for public mapping', () => {
    expect(migration).toContain("ul.status = 'approved'");
    expect(migration).toContain('ul.property_id = p_property_id');
    expect(migration).toContain('pr.is_active = true');
    expect(migration).toContain("WHERE ap.status = 'published'");
  });

  it('returns only explicitly public identity fields', () => {
    expect(migration).toContain('RETURNS TABLE (');
    expect(migration).toContain('public_phone text');
    expect(migration).toContain('public_zalo text');
    expect(migration).not.toContain('email');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.public_get_property_agent(uuid) FROM PUBLIC');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.public_get_property_agent(uuid) TO anon, authenticated');
  });

  it('protects direct table access from public roles', () => {
    expect(hardeningMigration).toContain('REVOKE ALL ON TABLE public.agent_profiles FROM PUBLIC, anon');
    expect(hardeningMigration).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_profiles TO authenticated');
  });

  it('removes excess authenticated table privileges', () => {
    expect(minimumPrivilegesMigration).toContain('REVOKE ALL ON TABLE public.agent_profiles FROM PUBLIC, anon, authenticated');
    expect(minimumPrivilegesMigration).toContain('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.agent_profiles TO authenticated');
  });

  it('exposes only gated public profile and listing RPCs', () => {
    expect(publicReadMigration).toContain('CREATE OR REPLACE FUNCTION public.public_get_agent_profile(p_slug text)');
    expect(publicReadMigration).toContain("ap.status = 'published'");
    expect(publicReadMigration).toContain("ul.status = 'approved'");
    expect(publicReadMigration).toContain('pr.is_active = true');
    expect(publicReadMigration).toContain('LIMIT 100');
    expect(publicReadMigration).not.toContain("'images'");
    expect(publicReadMigration).toContain('CREATE OR REPLACE FUNCTION public.public_list_indexable_agent_profiles()');
    expect(publicReadMigration).toContain('REVOKE ALL ON FUNCTION public.public_get_agent_profile(text) FROM PUBLIC, anon, authenticated');
    expect(publicReadMigration).toContain('GRANT EXECUTE ON FUNCTION public.public_get_agent_profile(text) TO anon, authenticated');
    expect(publicReadMigration).not.toContain("'user_id'");
    expect(publicReadMigration).not.toContain("'email'");
    expect(publicReadMigration).not.toContain("'role'");
    expect(queryIndexMigration).toContain('user_listings_public_agent_idx');
    expect(queryIndexMigration).toContain("WHERE status = 'approved'");
  });

  it('protects owner mutations and keeps the combined save atomic', () => {
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('CREATE POLICY agent_profiles_update_own');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.save_my_profile_and_agent_profile');
    expect(migration).toContain('UPDATE public.profiles');
    expect(migration).toContain('ON CONFLICT (user_id) DO UPDATE SET');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.save_my_profile_and_agent_profile');
  });

  it('provisions every registered user publicly without linking legacy properties', () => {
    expect(defaultPublicMigration).toContain('trg_profiles_provision_agent_profile');
    expect(defaultPublicMigration).toContain("'published'");
    expect(defaultPublicMigration).toContain('substr(md5(NEW.id::text), 1, 16)');
    expect(defaultPublicMigration).toContain('WHERE p.role = \'user\'');
    expect(defaultPublicMigration).toContain('ON CONFLICT DO NOTHING');
    expect(defaultPublicMigration).toContain('public_phone = COALESCE');
    expect(defaultPublicMigration).not.toContain('contact_phone');
    expect(defaultPublicMigration).not.toContain('contact_name');
  });

  it('provisions a public profile when a staff account becomes a user', () => {
    expect(roleTransitionMigration).toContain('AFTER INSERT OR UPDATE OF role ON public.profiles');
    expect(roleTransitionMigration).toContain("IF NEW.role <> 'user' THEN");
    expect(roleTransitionMigration).toContain('ON CONFLICT DO NOTHING');
    expect(roleTransitionMigration).toContain('NEW.id, v_slug, v_display_name');
    expect(roleTransitionMigration).toContain("WHERE p.role = 'user'");
    expect(roleTransitionMigration).toContain('NOT EXISTS (');
    expect(roleTransitionMigration).not.toContain('user_listings');
    expect(roleTransitionMigration).not.toContain('contact_phone');
    expect(roleTransitionMigration).toContain('REVOKE ALL ON FUNCTION public.provision_agent_profile_from_profile()');
  });

  it('does not accept client status as a visibility decision', () => {
    expect(defaultPublicMigration).toContain("status = CASE WHEN agent_profiles.status = 'disabled' THEN 'disabled' ELSE 'published' END");
    expect(defaultPublicMigration).toContain("p_status text DEFAULT 'published'");
  });

  it('keeps public activity safe and presence user-scoped', () => {
    expect(activityMigration).toContain('ADD COLUMN IF NOT EXISTS last_seen_at timestamptz');
    expect(activityMigration).toContain('CREATE OR REPLACE FUNCTION public.touch_my_presence()');
    expect(activityMigration).toContain('v_actor uuid := auth.uid()');
    expect(activityMigration).toContain('GRANT EXECUTE ON FUNCTION public.touch_my_presence() TO authenticated');
    expect(activityMigration).toContain("'account_created_at', p.created_at");
    expect(activityMigration).toContain("'last_login_at', au.last_sign_in_at");
    expect(activityMigration).toContain("'is_online', COALESCE(p.last_seen_at > now() - interval '5 minutes', false)");
    expect(activityMigration).toContain("'property_type_name', listing.property_type_name");
    expect(activityMigration).toContain("LEFT JOIN public.property_types pt ON pt.id = pr.property_type_id");
    expect(activityMigration).not.toContain("'email'");
    expect(activityMigration).not.toContain("'user_id'");
  });

  it('keeps the activity dry-run executable before the new column and functions exist', () => {
    expect(activityDryRun).toContain("to_jsonb(p)->>'last_seen_at'");
    expect(activityDryRun).toContain("to_regprocedure('public.touch_my_presence()')");
    expect(activityDryRun).not.toContain('p.last_seen_at');
    expect(activityDryRun).not.toContain("has_function_privilege('anon', 'public.touch_my_presence()'");
  });
});
