import { describe, it, expect } from 'vitest';
import { buildRouteMetadata, buildRouteJsonLd, type RouteFallback } from './routeSeo';
import type { SeoRouteOverride } from './supabase';

function fallback(overrides: Partial<RouteFallback> = {}): RouteFallback {
  return {
    title: 'Mua bán bất động sản',
    description: 'Danh sách bất động sản mua bán tại Bình Dương.',
    path: '/mua-ban',
    routeType: 'CollectionPage',
    ...overrides,
  };
}

function override(overrides: Partial<SeoRouteOverride> = {}): SeoRouteOverride {
  return {
    id: 'r1',
    path: '/mua-ban',
    meta_title: null,
    meta_description: null,
    focus_keywords: null,
    canonical_path: null,
    robots_index: null,
    robots_follow: null,
    schema_markup: null,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as SeoRouteOverride;
}

describe('buildRouteMetadata', () => {
  it('dùng fallback khi không có override', () => {
    const m = buildRouteMetadata({ path: '/mua-ban', fallback: fallback(), override: null });
    expect(m.title).toBe('Mua bán bất động sản');
    expect(m.alternates?.canonical).toBe('/mua-ban');
    expect((m.robots as { index?: boolean })?.index).toBe(true);
    expect((m.robots as { follow?: boolean })?.follow).toBe(true);
  });

  it('override meta_title/description ghi đè fallback', () => {
    const m = buildRouteMetadata({
      path: '/mua-ban',
      fallback: fallback(),
      override: override({ meta_title: 'Tiêu đề tùy chỉnh', meta_description: 'Mô tả tùy chỉnh' }),
    });
    expect(m.title).toBe('Tiêu đề tùy chỉnh');
    expect(m.description).toBe('Mô tả tùy chỉnh');
  });

  it('robots_index=false được tôn trọng (noindex)', () => {
    const m = buildRouteMetadata({
      path: '/mua-ban',
      fallback: fallback(),
      override: override({ robots_index: false, robots_follow: false }),
    });
    expect((m.robots as { index?: boolean })?.index).toBe(false);
    expect((m.robots as { follow?: boolean })?.follow).toBe(false);
  });

  it('canonical_path override thay cho path', () => {
    const m = buildRouteMetadata({
      path: '/mua-ban',
      fallback: fallback(),
      override: override({ canonical_path: '/mua-ban-chinh' }),
    });
    expect(m.alternates?.canonical).toContain('/mua-ban-chinh');
  });
});

describe('buildRouteJsonLd', () => {
  it('không override → auto schema CollectionPage từ fallback', () => {
    const schemas = buildRouteJsonLd({ path: '/mua-ban', fallback: fallback(), override: null });
    expect(schemas.length).toBeGreaterThanOrEqual(1);
    expect(schemas[0]['@type']).toBe('CollectionPage');
    expect(schemas[0].name).toBe('Mua bán bất động sản');
    expect(schemas[0].url).toBe('/mua-ban');
  });

  it('có breadcrumb → thêm BreadcrumbList', () => {
    const schemas = buildRouteJsonLd({
      path: '/mua-ban',
      fallback: fallback({ breadcrumb: [{ name: 'Trang chủ', path: '/' }, { name: 'Mua bán', path: '/mua-ban' }] }),
      override: null,
    });
    const types = schemas.map(s => s['@type']);
    expect(types).toContain('BreadcrumbList');
  });

  it('schema_markup tùy chỉnh chỉ merge field bổ sung, KHÔNG ghi đè khóa locked', () => {
    const schemas = buildRouteJsonLd({
      path: '/mua-ban',
      fallback: fallback(),
      override: override({
        schema_markup: {
          '@context': 'https://schema.org',
          '@type': 'CollectionPage',
          url: 'https://evil.example/override',
          keywords: 'bổ sung',
        } as never,
      }),
    });
    // url là khóa locked → giữ giá trị base, không cho override ghi đè
    expect(schemas[0].url).toBe('/mua-ban');
    // field bổ sung không phải locked → được merge vào
    expect(schemas[0].keywords).toBe('bổ sung');
  });

  it('schema_markup sai kiểu (không phải object) không làm throw', () => {
    expect(() => buildRouteJsonLd({
      path: '/mua-ban',
      fallback: fallback(),
      override: override({ schema_markup: 'not-an-object' as never }),
    })).not.toThrow();
  });
});
