import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isApprovedListingProperty, isCanonicalLocationCorrectionCandidate, isCanonicalLocationCorrectionResult } from './userListings';

const approvalMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260903000000_atomic_user_listing_approval.sql'),
  'utf8',
);

const aiListingMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260915000000_ai_listing_drafts.sql'),
  'utf8',
);

const identityPreservingApprovalMigration = aiListingMigration;

const canonicalLocationMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260904060000_admin_canonical_location_correction.sql'),
  'utf8',
);

const approvalTab = readFileSync(
  resolve(process.cwd(), 'src/components/admin/tabs/UserListingsApprovalTab.tsx'),
  'utf8',
);

const userListingsApi = readFileSync(
  resolve(process.cwd(), 'src/lib/api/userListings.ts'),
  'utf8',
);

describe('isApprovedListingProperty', () => {
  const approved = {
    property_id: 'property-1',
    title: 'Bán nhà Dĩ An',
    description: 'Mô tả',
    city: 'Bình Dương',
    district: 'Dĩ An',
    listing_type: 'mua_ban',
    price: 2.5,
    price_unit: 'tỷ',
    area_sqm: 80,
  };

  it('accepts the committed approval RPC payload used for optional AI tagging', () => {
    expect(isApprovedListingProperty(approved)).toBe(true);
    expect(isApprovedListingProperty({ ...approved, description: null, district: null, area_sqm: null })).toBe(true);
    expect(isApprovedListingProperty({ ...approved, listing_type: 'can_thue' })).toBe(true);
  });

  it.each([
    null,
    {},
    { ...approved, property_id: '' },
    { ...approved, listing_type: 'unknown' },
    { ...approved, price: '2.5' },
    { ...approved, price: Number.NaN },
    { ...approved, area_sqm: Number.POSITIVE_INFINITY },
    { ...approved, district: 123 },
  ])('rejects malformed RPC output: %o', (value) => {
    expect(isApprovedListingProperty(value)).toBe(false);
  });
});

describe('approval RPC result handling', () => {
  it('treats property_id as the durable success contract even when optional AI fields are malformed', () => {
    const committedButNotTaggable = {
      property_id: 'property-1',
      title: null,
      city: 'Bình Dương',
    };

    expect('property_id' in committedButNotTaggable && typeof committedButNotTaggable.property_id === 'string').toBe(true);
    expect(isApprovedListingProperty(committedButNotTaggable)).toBe(false);
  });
});

describe('canonical location correction guard', () => {
  const candidate = {
    id: '3be55890-6ab2-455a-b3ef-daebd893f15d',
    status: 'approved' as const,
    city: 'Đồng Nai',
    district: null,
    ward: 'Nha Bích',
    area_id: 'd1a0469f-acdc-4262-9f19-617c98e917fd',
    district_id: null,
    ward_id: null,
    neighborhood_slug: null,
    expires_at: '2099-10-24T03:08:03.445Z',
  };

  const corrected = {
    listing_id: '3be55890-6ab2-455a-b3ef-daebd893f15d',
    property_id: '823a968b-ec91-474f-8477-b989f1f1e01a',
    city: 'Bình Phước',
    district: 'Chơn Thành',
    ward: 'Nha Bích',
    area_id: '2e1657e8-d1fc-4d70-9eff-00ab3e3fbbe5',
    district_id: '82d73e51-d92b-4a78-bc1b-4939814acbba',
    ward_id: 'fa9c6614-5ed7-4fcd-bb86-7dca3dd1f3eb',
    status: 'approved' as const,
    expires_at: '2099-10-24T03:08:03.445Z',
  };

  it('accepts only the exact approved, unexpired old snapshot', () => {
    expect(isCanonicalLocationCorrectionCandidate(candidate)).toBe(true);
    expect(isCanonicalLocationCorrectionCandidate({ ...candidate, status: 'pending' })).toBe(false);
    expect(isCanonicalLocationCorrectionCandidate({ ...candidate, city: 'Bình Phước' })).toBe(false);
    expect(isCanonicalLocationCorrectionCandidate({ ...candidate, expires_at: '2000-01-01T00:00:00.000Z' })).toBe(false);
    expect(isCanonicalLocationCorrectionCandidate({ ...candidate, id: 'other-listing' })).toBe(false);
  });

  it('accepts only the fixed RPC result contract', () => {
    expect(isCanonicalLocationCorrectionResult(corrected)).toBe(true);
    expect(isCanonicalLocationCorrectionResult({ ...corrected, property_id: 'other-property' })).toBe(false);
    expect(isCanonicalLocationCorrectionResult({ ...corrected, district_id: null })).toBe(false);
    expect(isCanonicalLocationCorrectionResult({ ...corrected, expires_at: null })).toBe(false);
    expect(isCanonicalLocationCorrectionResult(null)).toBe(false);
  });

  it('keeps the correction RPC fixed-scope and admin-only', () => {
    expect(canonicalLocationMigration).toContain('admin_correct_canonical_location_conflict()');
    expect(canonicalLocationMigration).toContain("IF auth.uid() IS NULL OR NOT public.is_admin() THEN");
    expect(canonicalLocationMigration).toContain('REVOKE ALL ON FUNCTION public.admin_correct_canonical_location_conflict() FROM PUBLIC, anon;');
    expect(canonicalLocationMigration).toContain('GRANT EXECUTE ON FUNCTION public.admin_correct_canonical_location_conflict() TO authenticated;');
    expect(approvalTab).toContain('isCanonicalLocationCorrectionCandidate(listing)');
    expect(userListingsApi).toContain(".rpc('admin_correct_canonical_location_conflict')");
    expect(approvalTab).not.toContain('p_city');
    expect(approvalTab).not.toContain('p_area_id');
  });
});


describe('identity-preserving user-listing reapproval migration', () => {
  it('reactivates the inactive linked property instead of replacing its identity', () => {
    expect(identityPreservingApprovalMigration).toMatch(
      /UPDATE public\.properties\s+SET[\s\S]+is_active = true[\s\S]+WHERE id = v_listing\.property_id/s,
    );
    expect(identityPreservingApprovalMigration).toMatch(
      /IF v_listing\.property_id IS NULL THEN[\s\S]+INSERT INTO public\.properties/s,
    );
    expect(identityPreservingApprovalMigration).toContain('v_property_id := v_listing.property_id;');
  });

  it('fails closed for active, dangling, or ambiguously shared property links', () => {
    expect(identityPreservingApprovalMigration).toContain('v_prior_property_found := FOUND;');
    expect(identityPreservingApprovalMigration).toMatch(
      /IF NOT v_prior_property_found THEN[\s\S]+RAISE EXCEPTION/s,
    );
    expect(identityPreservingApprovalMigration).toMatch(
      /FROM public\.user_listings other_listing[\s\S]+other_listing\.property_id = v_listing\.property_id[\s\S]+other_listing\.id <> v_listing\.id/s,
    );
  });

  it('preserves durable identity and editorial state on the reactivation update', () => {
    const update = identityPreservingApprovalMigration.match(
      /UPDATE public\.properties\s+SET([\s\S]+?)\s+WHERE id = v_listing\.property_id;/,
    )?.[1] ?? '';

    expect(update).not.toMatch(/\bslug\s*=/);
    expect(update).not.toMatch(/\bpublic_code\s*=/);
    expect(update).not.toMatch(/\bcreated_at\s*=/);
    expect(update).not.toMatch(/\bviews\s*=/);
    expect(update).not.toMatch(/\bis_featured\s*=/);
    expect(update).not.toMatch(/\bis_hot\s*=/);
    expect(update).not.toMatch(/\bis_verified\s*=/);
  });

  it('keeps full source mapping, fixed search path, and existing RPC privileges', () => {
    expect(identityPreservingApprovalMigration).toMatch(/area_id = v_listing\.area_id/);
    expect(identityPreservingApprovalMigration).toMatch(/district_id = v_listing\.district_id/);
    expect(identityPreservingApprovalMigration).toMatch(/neighborhood_slug = v_listing\.neighborhood_slug/);
    expect(identityPreservingApprovalMigration).toMatch(/images = v_listing\.images/);
    expect(identityPreservingApprovalMigration).toMatch(/schema_markup = v_listing\.schema_markup/);
    expect(identityPreservingApprovalMigration).toMatch(/faq = v_listing\.faq/);
    expect(identityPreservingApprovalMigration).toContain('SECURITY DEFINER');
    expect(identityPreservingApprovalMigration).toContain('SET search_path = public, pg_temp');
    expect(identityPreservingApprovalMigration).toContain(
      'REVOKE ALL ON FUNCTION public.approve_user_listing(uuid) FROM PUBLIC, anon;',
    );
    expect(identityPreservingApprovalMigration).toContain(
      'GRANT EXECUTE ON FUNCTION public.approve_user_listing(uuid) TO authenticated;',
    );
  });
});

describe('AI Listing draft migration', () => {
  it('keeps AI SEO output in a pending draft and requires explicit apply or reject', () => {
    expect(aiListingMigration).toContain('ADD COLUMN IF NOT EXISTS ai_seo_draft jsonb');
    expect(aiListingMigration).toContain('admin_apply_user_listing_ai_seo');
    expect(aiListingMigration).toContain('admin_reject_user_listing_ai_seo');
    expect(aiListingMigration).toContain("IF v_listing.ai_seo_draft IS NOT NULL THEN");
    expect(aiListingMigration).toContain('Cần áp dụng hoặc bỏ bản nháp SEO AI trước khi duyệt');
  });

  it('copies approved tags from the user listing and preserves reapproval identity checks', () => {
    expect(aiListingMigration).toMatch(/tags = v_listing\.tags/);
    expect(aiListingMigration).toContain('v_prior_property_found := FOUND;');
    expect(aiListingMigration).toContain('v_property_id := v_listing.property_id;');
    expect(aiListingMigration).toContain('other_listing.property_id = v_listing.property_id');
  });

  it('does not update public properties in the AI generation path', () => {
    const generationSection = aiListingMigration.split('CREATE OR REPLACE FUNCTION public.admin_apply_user_listing_ai_seo')[0];
    expect(generationSection).not.toContain('UPDATE public.properties');
  });
});

describe('atomic user-listing approval migration', () => {
  it('locks lifecycle state before inserting exactly one linked public property', () => {
    expect(approvalMigration).toMatch(/FROM public\.user_listings\s+WHERE id = p_listing_id\s+FOR UPDATE;/s);
    expect(approvalMigration).toMatch(/INSERT INTO public\.properties/s);
    expect(approvalMigration).toMatch(/UPDATE public\.user_listings\s+SET status = 'approved',\s+property_id = v_property_id/s);
    expect(approvalMigration).toMatch(/IF v_listing\.status = 'approved' THEN/s);
    expect(approvalMigration).toMatch(/IF v_listing\.status NOT IN \('pending', 'rejected', 'expired'\) THEN/s);
  });

  it('fails closed for an active prior property and preserves all location fields', () => {
    expect(approvalMigration).toMatch(/FROM public\.properties p\s+WHERE p\.id = v_listing\.property_id\s+FOR UPDATE;/s);
    expect(approvalMigration).toContain("IF COALESCE(v_prior_property_active, false) THEN");
    expect(approvalMigration).toMatch(/area_id, district_id, neighborhood_slug, property_type_id/s);
    expect(approvalMigration).toMatch(/v_listing\.area_id, v_listing\.district_id, v_listing\.neighborhood_slug, v_listing\.property_type_id/s);
    expect(approvalMigration).toMatch(/v_listing\.city, v_listing\.district, v_listing\.ward/s);
  });

  it('has a fixed search path, database-owned time, and authenticated-only execution', () => {
    expect(approvalMigration).toContain('SECURITY DEFINER');
    expect(approvalMigration).toContain('SET search_path = public, pg_temp');
    expect(approvalMigration).toContain('v_now timestamptz := now();');
    expect(approvalMigration).not.toContain('p_now');
    expect(approvalMigration).toContain('REVOKE ALL ON FUNCTION public.approve_user_listing(uuid) FROM PUBLIC, anon;');
    expect(approvalMigration).toContain('GRANT EXECUTE ON FUNCTION public.approve_user_listing(uuid) TO authenticated;');
  });
});
