import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260903070000_owner_listing_crm.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_my_listing_leads_dry_run.sql'),
  'utf8',
);
const leadsApi = readFileSync(resolve(process.cwd(), 'src/lib/api/leads.ts'), 'utf8');
const accountHub = readFileSync(resolve(process.cwd(), 'src/screens/AccountHubPage.tsx'), 'utf8');

describe('owner listing CRM migration', () => {
  it('scopes lead rows through property ownership and authenticated user identity', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_my_listing_leads(');
    expect(migration).toContain('auth.uid() IS NULL');
    expect(migration).toContain("p.role = 'user'");
    expect(migration).toContain('JOIN public.user_listings ul');
    expect(migration).toContain('ul.property_id = l.property_id');
    expect(migration).toContain('ul.user_id = auth.uid()');
    expect(migration).not.toMatch(/\bl\.user_id\s*=\s*auth\.uid\(\)/);
  });

  it('bounds filters and pagination inside the RPC', () => {
    expect(migration).toContain('p_source text DEFAULT NULL');
    expect(migration).toContain('p_status text DEFAULT NULL');
    expect(migration).toContain('p_limit integer DEFAULT 50');
    expect(migration).toContain('p_offset integer DEFAULT 0');
    expect(migration).toContain('p_limit > 100');
    expect(migration).toContain('p_offset > 100000');
    expect(migration).toContain('property_phone_reveal');
    expect(migration).toContain('property_callback');
  });

  it('keeps sensitive tables private and grants only the owner RPCs', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_my_listing_leads(uuid, text, text, integer, integer) FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_my_listing_lead_stats() FROM PUBLIC, anon, authenticated');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_my_listing_leads(uuid, text, text, integer, integer) TO authenticated');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_my_listing_lead_stats() TO authenticated');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(leadsApi).toContain("supabase.rpc('get_my_listing_leads'");
    expect(leadsApi).toContain("supabase.rpc('get_my_listing_lead_stats'");
  });

  it('aggregates stats with the same owner scope and event table', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_my_listing_lead_stats()');
    expect(migration).toContain('WITH owned_listings AS');
    expect(migration).toContain('COUNT(DISTINCT e.id)');
    expect(migration).toContain("l.source = 'property_callback'");
    expect(migration).toContain('LEFT JOIN public.property_phone_reveal_events e');
    expect(migration).toContain('ORDER BY p.title ASC, p.id ASC');
  });

  it('keeps the user inbox inside the existing account hub', () => {
    expect(accountHub).toContain("'leads'");
    expect(accountHub).toContain("label: 'Khách quan tâm'");
    expect(accountHub).toContain('<MyListingLeadsPage />');
  });

  it('keeps the preflight read-only', () => {
    expect(dryRun).toContain('to_regprocedure');
    expect(dryRun).toContain('has_table_privilege');
    expect(dryRun).toContain('has_function_privilege');
    expect(dryRun).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  });
});
