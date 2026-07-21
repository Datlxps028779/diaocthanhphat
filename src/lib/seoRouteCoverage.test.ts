import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { SEO_ROUTE_PATHS } from './api/schemaPro';

// Các route tĩnh (không phải '/', không phải dynamic segment) phải render qua
// loadRouteSeo() để route override trong admin thực sự có hiệu lực. Guard này chặn
// việc quay lại staticPageMetadata hardcoded làm admin override vô tác dụng.
const STATIC_ROUTES = SEO_ROUTE_PATHS.filter(p => p !== '/');

describe('SEO route coverage', () => {
  it('đủ 4 route mới trong allowlist', () => {
    for (const p of ['/so-sanh', '/dinh-gia', '/du-an', '/dau-tu']) {
      expect(SEO_ROUTE_PATHS).toContain(p);
    }
  });

  it.each(STATIC_ROUTES)('page %s dùng loadRouteSeo', (routePath) => {
    const file = resolve(process.cwd(), 'app', routePath.replace(/^\//, ''), 'page.tsx');
    const src = readFileSync(file, 'utf8');
    expect(src).toContain('loadRouteSeo');
    expect(src).not.toContain('staticPageMetadata');
  });
});
