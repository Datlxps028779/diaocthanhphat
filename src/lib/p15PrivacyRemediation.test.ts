import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildAgentProfileJsonLd, buildAgentProfileMetadata } from './agentProfileSeo';
import type { PublicAgentProfile } from './supabase';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261005000000_p15_privacy_audit.sql'),
  'utf8',
);
const publicPage = readFileSync(
  resolve(process.cwd(), 'app/nguoi-dang-tin/[slug]/page.tsx'),
  'utf8',
);

const profile: PublicAgentProfile = {
  id: 'profile-1',
  slug: 'nguoi-dang-tin-1',
  display_name: 'Người đăng tin',
  bio: 'Giới thiệu công khai.',
  avatar_url: null,
  public_phone: '0900000000',
  public_zalo: null,
};

describe('P15 privacy remediation', () => {
  it('keeps the public type and SEO payload free of operational fields', () => {
    const metadata = buildAgentProfileMetadata(profile, 1);
    const jsonLd = buildAgentProfileJsonLd(profile);
    const serialized = JSON.stringify({ metadata, jsonLd, profile });
    expect(serialized).not.toContain('account_created_at');
    expect(serialized).not.toContain('last_login_at');
    expect(serialized).not.toContain('is_online');
    expect(serialized).not.toContain('current_status');
    expect(serialized).not.toContain('lead_count');
    expect(serialized).not.toContain('owner_id');
    expect(serialized).not.toContain('session');
    expect(serialized).not.toContain('token');
    expect(serialized).not.toContain('assignment');
    expect(serialized).not.toContain('updated_at');
  });

  it('removes operational labels from the public page source', () => {
    expect(publicPage).not.toContain('Đăng nhập gần nhất');
    expect(publicPage).not.toContain('Trạng thái hiện tại');
    expect(publicPage).not.toContain('account_created_at');
    expect(publicPage).not.toContain('last_login_at');
    expect(publicPage).not.toContain('is_online');
  });

  it('defines a whitelist-only public RPC and a slug-only sitemap projection', () => {
    expect(migration).toContain("'display_name', ap.display_name");
    expect(migration).toContain("'public_zalo', ap.public_zalo");
    expect(migration).not.toContain("'last_login_at'");
    expect(migration).not.toContain("'is_online'");
    expect(migration).not.toContain("'account_created_at'");
    expect(migration).toContain('RETURNS TABLE (slug text)');
    expect(migration).toContain("JOIN public.profiles p");
    expect(migration).toContain("p.role = 'user'");
    expect(migration).toContain("ul.status = 'approved'");
    expect(migration).toContain('pr.is_active = true');
  });

  it('returns safe audit metadata and bounded before/after fields', () => {
    expect(migration).toContain('actor_display_name text');
    expect(migration).toContain('actor_role text');
    expect(migration).toContain("'slug', e.before_state->>'slug'");
    expect(migration).toContain("'status', e.after_state->>'status'");
    expect(migration).not.toContain('auth.users');
    expect(migration).not.toContain('session');
    expect(migration).not.toContain('token');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_agent_profile_audit(uuid)');
  });
});
