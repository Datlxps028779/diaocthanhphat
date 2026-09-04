import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260929000000_staff_customer_listing_lead_scope.sql'),
  'utf8',
);
const dryRun = readFileSync(
  resolve(process.cwd(), 'supabase/manual_staff_customer_listing_lead_dry_run.sql'),
  'utf8',
);
const route = readFileSync(resolve(process.cwd(), 'app/api/admin/customers/route.ts'), 'utf8');
const usersTab = readFileSync(resolve(process.cwd(), 'src/components/admin/tabs/UsersTab.tsx'), 'utf8');
const staffTab = readFileSync(resolve(process.cwd(), 'src/components/admin/tabs/StaffTab.tsx'), 'utf8');
const adminAccess = readFileSync(resolve(process.cwd(), 'src/lib/adminAccess.ts'), 'utf8');
const listingModerationMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930000000_admin_only_listing_moderation.sql'),
  'utf8',
);
const aiAutotag = readFileSync(resolve(process.cwd(), 'supabase/functions/ai-autotag/index.ts'), 'utf8');

describe('staff customer listing lead scope', () => {
  it('inherits staff access through customer assignment and property ownership', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.is_customer_listing_lead_member(p_lead_id uuid)');
    expect(migration).toContain('JOIN public.user_listings ul');
    expect(migration).toContain('JOIN public.user_customer_assignments a');
    expect(migration).toContain('a.staff_user_id = auth.uid()');
    expect(migration).toContain('a.ended_at IS NULL');
    expect(migration).toContain('ul.property_id = l.property_id');
    expect(migration).toContain("staff.role = 'staff'");
  });

  it('keeps inherited scope dynamic and separate from explicit lead assignments', () => {
    expect(migration).not.toContain('INSERT INTO lead_assignments');
    expect(migration).toContain('public.is_lead_member(id)');
    expect(migration).toContain('public.is_customer_listing_lead_member(id)');
    expect(migration).toContain('public.is_customer_listing_lead_member(lead_id)');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.is_customer_listing_lead_member(uuid) FROM PUBLIC, anon, authenticated;');
  });

  it('limits staff lead changes to CRM fields and leaves property reassignment to admins', () => {
    expect(migration).toContain("ARRAY['status', 'note', 'follow_up_at']::text[]");
    expect(migration).toContain("IF p_patch ? 'property_id' AND NOT public.is_admin()");
    expect(migration).toContain('trg_lead_crm_update_scope');
    expect(migration).toContain("Chỉ admin được thay đổi property của lead");
  });

  it('keeps customer assignment out of listing moderation authority', () => {
    expect(migration).toContain('Chỉ chủ tài khoản hoặc admin được sửa tin đăng');
    expect(migration).not.toContain('public.is_customer_member(OLD.user_id)');
  });

  it('provides scoped projections for customer and staff responsibility views', () => {
    expect(migration).toContain('FUNCTION public.get_customer_listing_leads(uuid, uuid, integer, integer)');
    expect(migration).toContain('FUNCTION public.get_staff_customer_scope(uuid)');
    expect(migration).toContain('p_user_id uuid');
    expect(route).toContain("client.rpc('get_customer_listing_leads'");
    expect(route).toContain("client.rpc('get_staff_customer_scope')");
    expect(route).toContain('listingLeads');
    expect(route).toContain('staffScopes');
    expect(usersTab).toContain('Lead từ tin đăng');
    expect(staffTab).toContain('listingCount');
    expect(staffTab).toContain('leadCount');
  });

  it('keeps listing moderation admin-only across UI, RPC, policy, and Edge Function boundaries', () => {
    expect(adminAccess).toContain("export const STAFF_TABS: AdminTab[] = ['agent-profiles', 'leads', 'chat-sessions', 'users'];");
    expect(adminAccess).not.toMatch(/STAFF_TABS[^\n]*'user-listings'/);
    expect(listingModerationMigration).toContain('ALTER FUNCTION public.approve_user_listing(uuid) RENAME TO approve_user_listing_legacy;');
    expect(listingModerationMigration).toContain('ALTER FUNCTION public.admin_update_pending_user_listing(uuid, jsonb) RENAME TO admin_update_pending_user_listing_legacy;');
    expect(listingModerationMigration).toContain('NOT public.is_admin()');
    expect(listingModerationMigration).toContain('CREATE POLICY "user_listings_admin_update"');
    expect(listingModerationMigration).toContain('AND public.is_admin()');
    expect(aiAutotag).toContain('verifyAdmin');
    expect(aiAutotag).not.toContain('verifyAdminOrStaff');
  });

  it('keeps the preflight read-only', () => {
    expect(dryRun).toContain('to_regprocedure');
    expect(dryRun).toContain('has_function_privilege');
    expect(dryRun).toContain('pg_policies');
    expect(dryRun).not.toMatch(/\b(INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|TRUNCATE)\b/i);
  });
});
