import { describe, expect, it } from 'vitest';
import {
  agentProfilePath,
  buildAgentProfileItemListJsonLd,
  buildAgentProfileJsonLd,
  buildAgentProfileMetadata,
  isAgentProfileIndexable,
} from './agentProfileSeo';
import type { PublicAgentListing, PublicAgentProfile } from './supabase';

const profile: PublicAgentProfile = {
  id: 'agent-1',
  slug: 'nguyen-van-a',
  display_name: 'Nguyễn Văn A',
  bio: 'Tư vấn nhà đất.',
  avatar_url: null,
  public_phone: '0901234567',
  public_zalo: '0901234567',
};

const listing: PublicAgentListing = {
  id: 'property-1',
  title: 'Nhà phố Dĩ An',
  price: 3.2,
  price_unit: 'tỷ',
  price_label: null,
  price_per_month: null,
  listing_type: 'mua_ban',
  property_type_name: 'Nhà phố',
  property_type_slug: 'nha-pho',
  area_sqm: 80,
  city: 'Bình Dương',
  district: 'Dĩ An',
  legal_status: 'Sổ hồng',
  image_url: null,
  images: [],
  slug: 'nha-pho-di-an',
  public_code: 123,
  neighborhood_slug: null,
  area_slug: 'binh-duong',
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
};

describe('agent profile SEO', () => {
  it('builds a stable encoded profile path', () => {
    expect(agentProfilePath('nguyen-van-a')).toBe('/nguoi-dang-tin/nguyen-van-a');
    expect(agentProfilePath('nguyen-van-a-2')).toBe('/nguoi-dang-tin/nguyen-van-a-2');
  });

  it('only indexes profiles with active approved listing content', () => {
    expect(isAgentProfileIndexable(0)).toBe(false);
    expect(isAgentProfileIndexable(1)).toBe(true);
    expect(buildAgentProfileMetadata(profile, 0).robots).toEqual({ index: false, follow: true });
    expect(buildAgentProfileMetadata(profile, 1).robots).toEqual({ index: true, follow: true });
  });

  it('builds public profile and listing schemas without private fields', () => {
    const profileSchema = buildAgentProfileJsonLd(profile);
    const listSchema = buildAgentProfileItemListJsonLd(profile, [listing]);
    expect(profileSchema['@type']).toBe('ProfilePage');
    expect(JSON.stringify(profileSchema)).not.toContain('user_id');
    expect(JSON.stringify(profileSchema)).not.toContain('email');
    expect(listSchema?.['@type']).toBe('ItemList');
    expect(JSON.stringify(listSchema)).toContain('/mua-ban/binh-duong/di-an/nha-pho-di-an-pr123');
    expect(buildAgentProfileItemListJsonLd(profile, [])).toBeNull();
  });
});
