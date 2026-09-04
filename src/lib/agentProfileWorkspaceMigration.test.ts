import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261001000000_agent_profile_workspace.sql'),
  'utf8',
);

describe('agent profile workspace migration', () => {
  it('adds directory metrics and bounded workspace RPCs', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_agent_profile_directory(');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.update_agent_profile(');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_agent_profile_audit(');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain('p_limit < 1 OR p_limit > 100');
    expect(migration).toContain('p_offset < 0 OR p_offset > 100000');
  });

  it('limits directory, updates and audit to authenticated scoped roles', () => {
    expect(migration).toContain("IF auth.uid() IS NULL OR NOT public.is_admin_or_staff() THEN");
    expect(migration).toContain('(public.is_admin() OR ap.user_id = auth.uid())');
    expect(migration).toContain('(v_is_admin OR user_id = auth.uid())');
    expect(migration).toContain("IF NOT v_is_admin AND p_patch ? 'status' THEN");
    expect(migration).toMatch(/REVOKE ALL ON FUNCTION public\.(get_agent_profile_directory|update_agent_profile|get_agent_profile_audit)/g);
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_agent_profile_directory(text, text, integer, integer) TO authenticated');
  });

  it('whitelists profile patch keys and records immutable change events', () => {
    expect(migration).toContain("key NOT IN ('slug', 'display_name', 'bio', 'avatar_url', 'public_phone', 'public_zalo', 'status')");
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS public.agent_profile_audit_events');
    expect(migration).toContain('CREATE TRIGGER trg_agent_profile_audit');
    expect(migration).toContain('before_state jsonb');
    expect(migration).toContain('after_state jsonb');
    expect(migration).not.toMatch(/DISABLE TRIGGER|SET ROLE|service_role/i);
  });

  it('prevents non-customer identities from remaining public', () => {
    expect(migration).toContain("SET status = 'disabled', updated_at = now()");
    expect(migration).toContain('JOIN public.profiles p ON p.id = ap.user_id AND p.role = \'user\'');
    expect(migration).toContain("AND ap.status = 'published'");
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.public_get_agent_profile_listings(p_slug text)');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.public_list_indexable_agent_profiles()');
  });
});
