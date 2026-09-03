import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261001000000_public_lead_boundary.sql'),
  'utf8',
);
const cleanupMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261002000000_remove_public_lead_insert_policies.sql'),
  'utf8',
);
const route = readFileSync(resolve(process.cwd(), 'app/api/public/leads/route.ts'), 'utf8');
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_public_lead_boundary_dry_run.sql'),
  'utf8',
);

describe('public lead boundary migration', () => {
  it('routes public writes through a validated security-definer RPC', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.public_submit_lead');
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain("public_rate_limit_allow('lead_insert', 12, 60)");
    expect(migration).toContain("REVOKE INSERT ON TABLE public.leads FROM anon, authenticated");
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.public_submit_lead(uuid, text, text, text, text, uuid, text, text, timestamptz) TO anon, authenticated');
    expect(migration).toContain("p_source NOT IN (");
    expect(migration).toContain("p_follow_up_at IS NOT NULL AND p_source IS DISTINCT FROM 'property_callback'");
  });

  it('keeps authenticated customer identity while excluding staff and admin', () => {
    expect(migration).toContain('public.is_user_customer_account(v_actor)');
    expect(migration).toContain('v_user_id');
    expect(migration).toContain('user_id\n  ) VALUES');
  });

  it('links phone-reveal leads only for authenticated customer accounts', () => {
    expect(migration).toContain('v_user_id := CASE');
    expect(migration).toContain('public.is_user_customer_account(auth.uid())');
    expect(migration).toContain("'property_phone_reveal',\n      v_user_id");
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.public_reveal_property_phone(uuid, text, text, text) TO anon, authenticated');
  });

  it('removes any legacy public lead insert policy', () => {
    expect(cleanupMigration).toContain('DROP POLICY IF EXISTS "public_insert_leads" ON public.leads');
    expect(cleanupMigration).toContain("'public' = ANY(roles)");
    expect(cleanupMigration).toContain("'anon' = ANY(roles)");
    expect(cleanupMigration).toContain("'authenticated' = ANY(roles)");
    expect(cleanupMigration).toContain("REVOKE INSERT ON TABLE public.leads FROM anon, authenticated");
  });

  it('makes the route call the RPC and bounds webhook waiting time', () => {
    expect(route).toContain("client.rpc('public_submit_lead'");
    expect(route).toContain('new AbortController()');
    expect(route).toContain('setTimeout(() => controller.abort(), 5000)');
    expect(route).toContain('signal: controller.signal');
    expect(route).not.toContain("client.from('leads').insert");
  });

  it('keeps the production preflight read-only', () => {
    expect(dryRun).toContain('to_regprocedure');
    expect(dryRun).toContain('has_table_privilege');
    expect(dryRun).toContain('has_function_privilege');
    expect(dryRun).not.toMatch(/^\s*(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/im);
  });
});
