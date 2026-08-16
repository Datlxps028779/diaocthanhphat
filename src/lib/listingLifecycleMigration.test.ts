import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const lifecycleMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260903010000_user_listing_lifecycle_audit.sql'),
  'utf8',
);

describe('user-listing lifecycle audit migration', () => {
  it('creates an append-only event table with constrained references and taxonomy', () => {
    expect(lifecycleMigration).toContain('CREATE TABLE IF NOT EXISTS public.user_listing_lifecycle_events');
    expect(lifecycleMigration).toMatch(/listing_id uuid REFERENCES public\.user_listings\(id\) ON DELETE SET NULL/);
    expect(lifecycleMigration).toMatch(/listing_owner_id uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
    expect(lifecycleMigration).toMatch(/property_id uuid REFERENCES public\.properties\(id\) ON DELETE SET NULL/);
    expect(lifecycleMigration).toMatch(/event_type text NOT NULL CHECK \(event_type IN \([\s\S]*'submitted'[\s\S]*'deleted'[\s\S]*\)\)/);
    expect(lifecycleMigration).toContain("actor_role IN ('owner', 'staff', 'admin', 'system')");
    expect(lifecycleMigration).toContain("CHECK (jsonb_typeof(metadata) = 'object')");
  });

  it('indexes listing and owner timelines newest first', () => {
    expect(lifecycleMigration).toContain('idx_user_listing_events_listing_time');
    expect(lifecycleMigration).toContain('user_listing_lifecycle_events(listing_id, occurred_at DESC)');
    expect(lifecycleMigration).toContain('idx_user_listing_events_owner_time');
    expect(lifecycleMigration).toContain('user_listing_lifecycle_events(listing_owner_id, occurred_at DESC)');
  });

  it('allows only authenticated admin/staff reads and no direct browser writes', () => {
    expect(lifecycleMigration).toContain('ALTER TABLE public.user_listing_lifecycle_events ENABLE ROW LEVEL SECURITY;');
    expect(lifecycleMigration).toMatch(/FOR SELECT TO authenticated\s+USING \(public\.is_admin_or_staff\(\)\);/s);
    expect(lifecycleMigration).toContain('REVOKE ALL ON TABLE public.user_listing_lifecycle_events FROM PUBLIC, anon, authenticated;');
    expect(lifecycleMigration).toContain('GRANT SELECT ON TABLE public.user_listing_lifecycle_events TO authenticated;');
    expect(lifecycleMigration).not.toMatch(/GRANT (INSERT|UPDATE|DELETE) ON TABLE public\.user_listing_lifecycle_events/);
  });

  it('uses a fixed-path definer trigger and derives actors at the database boundary', () => {
    expect(lifecycleMigration).toContain('CREATE OR REPLACE FUNCTION public.capture_user_listing_lifecycle_event()');
    expect(lifecycleMigration).toContain('SECURITY DEFINER');
    expect(lifecycleMigration).toContain('SET search_path = public, pg_temp');
    expect(lifecycleMigration).toContain('v_actor_id uuid := auth.uid();');
    expect(lifecycleMigration).toContain("v_actor_role := 'system'");
    expect(lifecycleMigration).toContain('ELSIF public.is_admin() THEN');
    expect(lifecycleMigration).toMatch(/p\.id = v_actor_id AND p\.role = 'staff'/);
    expect(lifecycleMigration).toContain('ELSIF v_actor_id = v_owner_id THEN');
    expect(lifecycleMigration).toContain("RAISE EXCEPTION 'Không xác định được vai trò người thực hiện vòng đời tin đăng'");
    expect(lifecycleMigration).toContain('REVOKE ALL ON FUNCTION public.capture_user_listing_lifecycle_event() FROM PUBLIC, anon, authenticated;');
  });

  it('captures insert, lifecycle update, expiry change and delete without content-edit noise', () => {
    expect(lifecycleMigration).toMatch(/AFTER INSERT OR UPDATE OR DELETE ON public\.user_listings/);
    expect(lifecycleMigration).toContain("v_event_type := 'submitted'");
    expect(lifecycleMigration).toContain("WHEN NEW.status = 'approved' THEN 'approved'");
    expect(lifecycleMigration).toContain("WHEN NEW.status = 'rejected' THEN 'rejected'");
    expect(lifecycleMigration).toContain("WHEN NEW.status = 'expired' THEN 'expired'");
    expect(lifecycleMigration).toContain("WHEN NEW.status = 'pending' AND OLD.status = 'expired' THEN 'renewed'");
    expect(lifecycleMigration).toContain("WHEN NEW.status = 'pending' THEN 'resubmitted'");
    expect(lifecycleMigration).toContain("v_event_type := 'expiry_changed'");
    expect(lifecycleMigration).toMatch(/ELSE\s+RETURN NEW;\s+END IF;/s);
  });

  it('stores controlled snapshots and does not fabricate pre-migration history', () => {
    expect(lifecycleMigration).toContain("v_reason := NULLIF(btrim(NEW.reject_reason), '')");
    expect(lifecycleMigration).toContain("'old_expires_at', OLD.expires_at");
    expect(lifecycleMigration).toContain("'new_expires_at', NEW.expires_at");
    expect(lifecycleMigration).toMatch(/v_listing_id := NULL;[\s\S]*'deleted_listing_id', OLD\.id/);
    expect(lifecycleMigration).not.toMatch(/INSERT INTO public\.user_listing_lifecycle_events[\s\S]*SELECT/i);
  });
});
