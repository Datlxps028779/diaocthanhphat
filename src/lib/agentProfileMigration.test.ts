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
    expect(publicReadMigration).toContain('CREATE OR REPLACE FUNCTION public.public_list_indexable_agent_profiles()');
    expect(publicReadMigration).toContain('REVOKE ALL ON FUNCTION public.public_get_agent_profile(text) FROM PUBLIC, anon, authenticated');
    expect(publicReadMigration).toContain('GRANT EXECUTE ON FUNCTION public.public_get_agent_profile(text) TO anon, authenticated');
    expect(publicReadMigration).not.toContain("'user_id'");
    expect(publicReadMigration).not.toContain("'email'");
    expect(publicReadMigration).not.toContain("'role'");
  });

  it('protects owner mutations and keeps the combined save atomic', () => {
    expect(migration).toContain('auth.uid()');
    expect(migration).toContain('CREATE POLICY agent_profiles_update_own');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.save_my_profile_and_agent_profile');
    expect(migration).toContain('UPDATE public.profiles');
    expect(migration).toContain('ON CONFLICT (user_id) DO UPDATE SET');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.save_my_profile_and_agent_profile');
  });
});
