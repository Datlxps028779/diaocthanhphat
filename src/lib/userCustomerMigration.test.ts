import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260919000000_user_customer_foundation.sql'),
  'utf8',
);

describe('P12 user/customer foundation migration contract', () => {
  it('creates separate customer, activity, assignment, and staff settings tables', () => {
    for (const table of [
      'user_customer_records',
      'user_customer_activities',
      'user_customer_assignments',
      'staff_customer_settings',
    ]) {
      expect(migration).toContain(`CREATE TABLE IF NOT EXISTS public.${table}`);
    }
    expect(migration).toContain("status IN ('new', 'active', 'qualified', 'inactive', 'blocked')");
    expect(migration).toContain("assignment_kind IN ('primary', 'co_assignee')");
    expect(migration).toContain('uq_user_customer_primary_active');
    expect(migration).toContain('uq_user_customer_assignment_active_pair');
  });

  it('backfills only real user profiles and does not phone-link existing CRM data', () => {
    expect(migration).toContain('WHERE p.role = \'user\'');
    expect(migration).toContain('ON CONFLICT (user_id) DO NOTHING');
    expect(migration).not.toContain('regexp_replace(phone');
    expect(migration).not.toContain('INSERT INTO public.lead_assignments');
    expect(migration).not.toContain('INSERT INTO public.chat_assignments');
  });

  it('keeps direct table writes closed and staff visibility assignment-scoped', () => {
    expect(migration).toContain('REVOKE ALL ON TABLE public.user_customer_records FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('REVOKE ALL ON TABLE public.user_customer_activities FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('REVOKE ALL ON TABLE public.user_customer_assignments FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('public.is_admin() OR public.is_customer_member(user_id)');
    expect(migration).toContain('public.is_customer_member(id)');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.is_customer_member(uuid) FROM PUBLIC, anon;');
  });

  it('derives activity authors from auth.uid and restricts assignment mutations to admins', () => {
    expect(migration).toContain('author_id, metadata)');
    expect(migration).toContain('VALUES (p_user_id, p_kind, p_body, auth.uid(),');
    expect(migration).toContain('IF auth.uid() IS NULL OR NOT public.is_admin()');
    expect(migration).toContain('PERFORM public.assert_assignable_customer_staff');
    expect(migration).toContain("p.role = 'staff'");
  });

  it('provides a safe authenticated support projection without internal customer fields', () => {
    expect(migration).toContain('FUNCTION public.get_my_customer_support()');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_my_customer_support() FROM PUBLIC, anon;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_my_customer_support() TO authenticated;');
    expect(migration).toContain('WHERE a.user_id = auth.uid()');
  });

  it('prevents direct lead/chat identity injection until explicit link RPCs exist', () => {
    expect(migration).toContain('ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS user_id uuid');
    expect(migration).toContain('ALTER TABLE public.chat_sessions ADD COLUMN IF NOT EXISTS user_id uuid');
    expect(migration).toContain('AND user_id IS NULL');
    expect(migration).toContain('AND (public.is_admin() OR user_id IS NULL)');
  });
});
