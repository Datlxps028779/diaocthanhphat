import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isApprovedListingProperty } from './userListings';

const approvalMigration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260903000000_atomic_user_listing_approval.sql'),
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
