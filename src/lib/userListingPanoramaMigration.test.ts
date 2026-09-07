import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const stagingMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260906000000_user_listing_panoramas.sql'),
  'utf8',
);
const moderationMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930000000_admin_only_listing_moderation.sql'),
  'utf8',
);
const promotionMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930010000_user_listing_panoramas_approval_promotion.sql'),
  'utf8',
);
const approvalAmbiguityFixMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260906010000_fix_user_listing_panoramas_approval_ambiguity.sql'),
  'utf8',
);
const canonicalPathFixMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260906020000_allow_promoted_user_listing_panorama_paths.sql'),
  'utf8',
);
const ingestLockMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260906030000_lock_user_listing_panorama_ingest.sql'),
  'utf8',
);

describe('user listing panoramas migration', () => {
  it('keeps user uploads in a separate staging relation', () => {
    expect(stagingMigration).toContain('CREATE TABLE IF NOT EXISTS public.user_listing_panoramas');
    expect(stagingMigration).toContain('owner_user_id uuid NOT NULL REFERENCES auth.users(id)');
    expect(stagingMigration).toContain('user_listing_id uuid NULL REFERENCES public.user_listings(id) ON DELETE CASCADE');
    expect(stagingMigration).toContain('storage_path text NOT NULL UNIQUE');
    expect(stagingMigration).toContain("mime_type IN ('image/jpeg', 'image/webp')");
    expect(stagingMigration).toContain('width::numeric / NULLIF(height, 0) BETWEEN 1.8 AND 2.2');
    expect(stagingMigration).not.toContain('ALTER TABLE public.property_panoramas');
  });

  it('enforces owner-scoped table and storage policies', () => {
    expect(stagingMigration).toContain('owner_user_id = auth.uid()');
    expect(stagingMigration).toContain('CREATE POLICY user_listing_panoramas_admin_select');
    expect(stagingMigration).toContain('CREATE POLICY user_listing_panoramas_admin_update');
    expect(stagingMigration).toContain('CREATE POLICY user_listing_panoramas_admin_delete');
    expect(stagingMigration).toContain("name ~ ('^user-listings/' || auth.uid()::text || '/[0-9a-fA-F-]{36}/[^/]+[.](jpe?g|webp)$')");
    expect(stagingMigration).not.toContain('property_360_user_public');
  });

  it('validates attach ownership, draft binding, listing lifecycle, and limit', () => {
    expect(stagingMigration).toContain('CREATE OR REPLACE FUNCTION public.attach_user_listing_panoramas');
    expect(stagingMigration).toContain('IF v_expected > 20 THEN');
    expect(stagingMigration).toMatch(/FROM public\.user_listings l[\s\S]+l\.user_id = v_user_id[\s\S]+FOR UPDATE;/);
    expect(stagingMigration).toContain('p.owner_user_id = v_user_id');
    expect(stagingMigration).toContain('p.user_listing_id IS NULL OR p.user_listing_id = p_listing_id');
    expect(stagingMigration).toContain('p.user_listing_id = p_listing_id OR p.draft_id = p_draft_id');
    expect(stagingMigration).toContain('NOT (id = ANY(COALESCE(p_panorama_ids, ARRAY[]::uuid[])))');
  });

  it('promotes staging rows into canonical property panoramas during approval', () => {
    expect(stagingMigration).toContain('INSERT INTO public.property_panoramas');
    expect(stagingMigration).toContain('FROM public.user_listing_panoramas p');
    expect(stagingMigration).toContain('p.user_listing_id = v_listing.id');
    expect(stagingMigration).toContain("SET status = 'approved', property_id = v_property_id");
    expect(moderationMigration).toContain('ALTER FUNCTION public.approve_user_listing(uuid) RENAME TO approve_user_listing_legacy');
    expect(moderationMigration).toContain('RETURN QUERY SELECT * FROM public.approve_user_listing_legacy(p_listing_id);');
    expect(promotionMigration).toContain('CREATE OR REPLACE FUNCTION public.approve_user_listing(');
    expect(promotionMigration).toContain('IF auth.uid() IS NULL OR NOT public.is_admin() THEN');
    expect(promotionMigration).toContain('FROM public.approve_user_listing_legacy(p_listing_id)');
    expect(promotionMigration).toContain('DELETE FROM public.property_panoramas');
    expect(promotionMigration).toContain('INSERT INTO public.property_panoramas');
    expect(promotionMigration).toContain('p.user_listing_id = p_listing_id');
    expect(promotionMigration).toContain('CREATE POLICY property_360_admin_user_listing_insert ON storage.objects');
  });

  it('moves user metadata writes behind the validated server boundary', () => {
    expect(ingestLockMigration).toContain('REVOKE INSERT, UPDATE ON public.user_listing_panoramas FROM authenticated;');
    expect(ingestLockMigration).toContain('CREATE OR REPLACE FUNCTION public.update_user_listing_panorama(');
    expect(ingestLockMigration).toContain('IF NOT v_is_admin AND v_owner_user_id <> auth.uid() THEN');
    expect(ingestLockMigration).toContain("v_listing_status NOT IN ('pending', 'rejected', 'expired')");
    expect(ingestLockMigration).toContain('GRANT EXECUTE ON FUNCTION public.update_user_listing_panorama(uuid, text, integer, boolean) TO authenticated;');
    expect(ingestLockMigration).toContain("DROP POLICY IF EXISTS property_360_user_insert ON storage.objects;");
    expect(ingestLockMigration).toContain("DROP POLICY IF EXISTS property_360_user_update ON storage.objects;");
  });

  it('keeps the approval delete predicate unambiguous and accepts promoted staging paths', () => {
    expect(approvalAmbiguityFixMigration).toContain('DELETE FROM public.property_panoramas AS pp');
    expect(approvalAmbiguityFixMigration).toContain('WHERE pp.property_id = v_result.property_id;');
    expect(canonicalPathFixMigration).toContain('DROP CONSTRAINT IF EXISTS property_panoramas_path_check');
    expect(canonicalPathFixMigration).toContain("storage_path LIKE property_id::text || '/%'");
    expect(canonicalPathFixMigration).toContain("storage_path ~ '^user-listings/[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[^/]+[.](jpe?g|webp)$'");
  });
});
