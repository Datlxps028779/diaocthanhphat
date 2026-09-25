import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const layout = readFileSync(resolve(process.cwd(), 'src/components/Layout.tsx'), 'utf8');

describe('authenticated header menu', () => {
  it('uses public user metadata for the account identity', () => {
    expect(layout).toContain('user.user_metadata?.display_name');
    expect(layout).toContain('user.user_metadata?.full_name');
    expect(layout).toContain('user.user_metadata?.avatar_url');
  });

  it('links only to real account management routes', () => {
    expect(layout).toContain('Quản lý bất động sản');
    expect(layout).toContain("pageToHref({ name: 'my-listings' })");
    expect(layout).toContain('Tài khoản của tôi');
    expect(layout).toContain("pageToHref({ name: 'account' })");
    expect(layout).not.toContain('Quản lý tuyển dụng');
  });

  it('keeps accessible menu and logout semantics', () => {
    expect(layout).toContain('aria-haspopup="menu"');
    expect(layout).toContain('role="menu"');
    expect(layout).toContain('role="menuitem"');
    expect(layout).toContain('Đăng xuất');
  });
});
