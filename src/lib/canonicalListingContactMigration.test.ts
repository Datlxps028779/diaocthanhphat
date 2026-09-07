import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930020000_canonical_listing_contact.sql'),
  'utf8',
);
const preflight = readFileSync(
  resolve(process.cwd(), 'supabase/manual_canonical_contact_visibility_preflight.sql'),
  'utf8',
);

describe('canonical listing contact migration', () => {
  it('requires and canonicalizes Vietnamese account identity', () => {
    expect(migration).toContain('ALTER TABLE public.user_listings ADD COLUMN IF NOT EXISTS contact_zalo text;');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.enforce_profile_identity()');
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.handle_new_user()');
    expect(migration).toContain("RAISE EXCEPTION 'Họ tên là bắt buộc'");
    expect(migration).toContain("RAISE EXCEPTION 'Số điện thoại Việt Nam không hợp lệ'");
  });

  it('derives every listing contact field from the owner profile', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.canonicalize_user_listing_contact()');
    expect(migration).toContain('NEW.contact_name := v_display_name;');
    expect(migration).toContain('NEW.contact_phone := v_phone;');
    expect(migration).toContain('NEW.contact_zalo := v_phone;');
    expect(migration).toMatch(/BEFORE INSERT OR UPDATE ON public\.user_listings/);
  });

  it('keeps privileged functions fixed-path and private', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain('SET search_path = public, pg_temp');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.normalize_vn_phone(text) FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.sync_user_listing_contact(uuid) FROM PUBLIC, anon, authenticated;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.approve_user_listing(uuid) TO authenticated;');
  });

  it('keeps the preflight runnable before migration', () => {
    expect(preflight).not.toContain('public.normalize_vn_phone(');
    expect(preflight).not.toContain('public.is_valid_vn_phone(');
    expect(preflight).toContain('BEGIN TRANSACTION READ ONLY;');
    expect(preflight).toContain('ROLLBACK;');
  });
});
