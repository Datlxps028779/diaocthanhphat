import { afterEach, describe, expect, it, vi } from 'vitest';

// next/cache and react are stubbed so the loader's cache wiring is observable without
// a Next runtime; the bounded reader itself is exercised through injected fetch.
const unstableCache = vi.fn((fn: unknown) => fn);
const reactCache = vi.fn(<T,>(fn: T) => fn);
const unstableCacheOptions: unknown[] = [];
vi.mock('next/cache', () => ({
  unstable_cache: (fn: unknown, _keys?: unknown, opts?: unknown) => { unstableCacheOptions.push(opts); return unstableCache(fn); },
}));
vi.mock('react', async () => {
  const actual = await vi.importActual<typeof import('react')>('react');
  return { ...actual, cache: <T,>(fn: T) => reactCache(fn) };
});

const { loadLocalitySnapshot, LOCALITY_SNAPSHOT_CACHE_TAG, LOCALITY_SNAPSHOT_REVALIDATE_SECONDS } =
  await import('./localitySnapshot');
const { loadHomeLocationStats } = await import('./homeLocationStats');

type Row = Record<string, unknown>;
const propertyRow = (id: string, extra: Row = {}): Row => ({
  id, title: `Tin ${id}`, area_id: 'a-bd', district_id: 'd-di-an', ward_id: 'w-tdh',
  property_type_id: 'pt-nha-pho', listing_type: 'mua_ban', price: 2, price_unit: 'tỷ',
  price_per_month: null, area_sqm: 100, updated_at: '2026-09-16T00:00:00.000Z', ...extra,
});

function page(rows: Row[], count: number) {
  return new Response(JSON.stringify(rows), {
    headers: { 'content-range': `${rows.length ? `0-${rows.length - 1}` : '*'}/${count}`, 'content-type': 'application/json' },
  });
}

// Taxonomy endpoints answer in the same order the loader requests them.
function taxonomyFetcher(responses: Record<string, Row[]>, propertyPages: Array<() => Promise<Response>>) {
  const queue = [...propertyPages];
  return vi.fn<typeof fetch>().mockImplementation(async input => {
    const url = new URL(String(input));
    for (const [table, rows] of Object.entries(responses)) {
      if (url.pathname.endsWith(`/rest/v1/${table}`)) return page(rows, rows.length);
    }
    const next = queue.shift();
    if (!next) throw new Error('unexpected property request');
    return next();
  });
}

const options = (fetcher: typeof fetch) => ({ fetcher, url: 'https://public.example', anonKey: 'anon-key', pageSize: 500 });

afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('getLocalitySnapshot', () => {
  it('returns rows, complete taxonomy and a real computedAt from a complete anonymous read', async () => {
    const fetcher = taxonomyFetcher(
      {
        areas: [{ id: 'a-bd', slug: 'binh-duong', name: 'Bình Dương', description: 'Giới thiệu tỉnh', admin_note: null, meta_title: null, meta_description: null, image_url: null, focus_keywords: 'bất động sản bình dương' }],
        districts: [{ id: 'd-di-an', area_id: 'a-bd', slug: 'binh-duong-di-an', name: 'Dĩ An' }],
        wards: [{ id: 'w-tdh', district_id: 'd-di-an', slug: 'binh-duong-di-an-tan-dong-hiep', name: 'Tân Đông Hiệp' }],
        property_types: [{ id: 'pt-nha-pho', slug: 'nha-pho', name: 'Nhà phố' }],
      },
      [
        async () => page([propertyRow('a'), propertyRow('b')], 2),
        async () => page([propertyRow('a')], 2),
      ],
    );
    const snapshot = await loadLocalitySnapshot(options(fetcher));
    expect(snapshot.rows.map(r => r.id)).toEqual(['a', 'b']);
    expect(snapshot.areas).toEqual([{ id: 'a-bd', slug: 'binh-duong', name: 'Bình Dương', description: 'Giới thiệu tỉnh', admin_note: null, meta_title: null, meta_description: null, image_url: null, focus_keywords: 'bất động sản bình dương' }]);
    expect(snapshot.districts[0]).toMatchObject({ id: 'd-di-an', area_id: 'a-bd' });
    expect(snapshot.wards[0]).toMatchObject({ id: 'w-tdh', district_id: 'd-di-an' });
    expect(snapshot.propertyTypes).toEqual([{ id: 'pt-nha-pho', slug: 'nha-pho', name: 'Nhà phố' }]);
    expect(Number.isNaN(Date.parse(snapshot.computedAt))).toBe(false);
  });

  it('partitions properties by area so a site-wide total above 5000 does not retire small localities', async () => {
    const areas = ['a-bd', 'a-dn'].map((id, index) => ({
      id, slug: index === 0 ? 'binh-duong' : 'da-nang', name: index === 0 ? 'Bình Dương' : 'Đà Nẵng',
      description: null, admin_note: null, meta_title: null, meta_description: null, focus_keywords: null, image_url: null,
    }));
    const rowsByArea = Object.fromEntries(areas.map(area => [area.id, Array.from({ length: 3000 }, (_, index) => propertyRow(
      `${area.id}-${String(index).padStart(4, '0')}`, { area_id: area.id },
    ))]));
    const fetcher = vi.fn<typeof fetch>(async input => {
      const url = new URL(String(input));
      const table = url.pathname.split('/').pop();
      if (table === 'areas') {
        const limit = Number(url.searchParams.get('limit') ?? 500);
        return page(areas.slice(0, limit), areas.length);
      }
      if (table === 'districts' || table === 'wards' || table === 'property_types') return page([], 0);
      const areaId = url.searchParams.get('area_id')?.replace(/^eq\./, '');
      const allRows = rowsByArea[areaId ?? ''] ?? [];
      const cursor = url.searchParams.get('id')?.replace(/^gt\./, '');
      const start = cursor ? allRows.findIndex(row => String(row.id) > cursor) : 0;
      const from = start < 0 ? allRows.length : start;
      const limit = Number(url.searchParams.get('limit') ?? 500);
      const selected = allRows.slice(from, from + limit);
      return page(selected, allRows.length - from);
    });
    const snapshot = await loadLocalitySnapshot({ ...options(fetcher), pageSize: 500 });
    expect(snapshot.rows).toHaveLength(6000);
    const propertyCalls = fetcher.mock.calls.filter(([url]) => String(url).includes('/public_properties?'));
    expect(propertyCalls.some(([url]) => String(url).includes('area_id=eq.a-bd'))).toBe(true);
    expect(propertyCalls.some(([url]) => String(url).includes('area_id=eq.a-dn'))).toBe(true);
  });

  it('reads the projection, is_active and keyset pagination with no cookies or session', async () => {
    const fetcher = taxonomyFetcher(
      { areas: [], districts: [], wards: [], property_types: [] },
      [async () => page([propertyRow('a')], 1), async () => page([propertyRow('a')], 1)],
    );
    await loadLocalitySnapshot(options(fetcher));
    const propertyCalls = fetcher.mock.calls.filter(([url]) => String(url).includes('public_properties'));
    for (const [url, init] of propertyCalls) {
      const parsed = new URL(String(url));
      expect(parsed.searchParams.get('is_active')).toBe('eq.true');
      expect(parsed.searchParams.get('area_id')).toBe('eq.a-bd');
      expect(parsed.searchParams.get('order')).toBe('id.asc');
      expect(parsed.searchParams.get('select')).toContain('property_type_id');
      expect((init?.headers as Record<string, string>).cookie).toBeUndefined();
      expect(init).toMatchObject({ credentials: 'omit', cache: 'no-store' });
    }
  });

  it('fails closed with no partial data when a property page is malformed', async () => {
    const fetcher = taxonomyFetcher(
      {
        areas: [{ id: 'a-bd', slug: 'binh-duong', name: 'Bình Dương' }],
        districts: [],
        wards: [],
        property_types: [],
      },
      [async () => new Response('secret upstream body', { status: 500 })],
    );
    await expect(loadLocalitySnapshot(options(fetcher))).rejects.toThrow(/^Locality snapshot unavailable$/);
  });

  it('fails closed when taxonomy attribution is incomplete rather than returning partial geography', async () => {
    const fetcher = taxonomyFetcher(
      { areas: [], districts: [{ id: 'd-x', area_id: 'a-missing', slug: 'x', name: 'X' }], wards: [], property_types: [] },
      [async () => page([], 0), async () => page([], 0)],
    );
    // A district whose parent area is absent cannot be used safely.
    await expect(loadLocalitySnapshot(options(fetcher))).rejects.toThrow(/^Locality snapshot unavailable$/);
  });

  it('never leaks private fields into the snapshot rows', async () => {
    const fetcher = taxonomyFetcher(
      { areas: [], districts: [], wards: [], property_types: [] },
      [
        async () => page([propertyRow('a', { owner_id: 'owner-secret', contact_phone: 'phone-secret' })], 1),
        async () => page([propertyRow('a')], 1),
      ],
    );
    const serialized = JSON.stringify(await loadLocalitySnapshot(options(fetcher)));
    for (const secret of ['owner-secret', 'phone-secret', 'owner_id', 'contact_phone']) {
      expect(serialized).not.toContain(secret);
    }
  });

  it('uses a 60s cache with the fixed public snapshot tag', async () => {
    expect(LOCALITY_SNAPSHOT_CACHE_TAG).toBe('public-locality-snapshot');
    expect(LOCALITY_SNAPSHOT_REVALIDATE_SECONDS).toBe(60);
    expect(unstableCacheOptions[0]).toMatchObject({
      revalidate: LOCALITY_SNAPSHOT_REVALIDATE_SECONDS,
      tags: [LOCALITY_SNAPSHOT_CACHE_TAG],
    });
  });
});

describe('loadHomeLocationStats contract preservation', () => {
  it('still returns the original aggregate shape after the reader extraction', async () => {
    const fetcher = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(page([propertyRow('a'), propertyRow('b')], 3))
      .mockResolvedValueOnce(page([propertyRow('c')], 1))
      .mockResolvedValueOnce(page([propertyRow('a')], 3));
    const result = await loadHomeLocationStats({ fetcher, url: 'https://public.example', anonKey: 'k', pageSize: 2 });
    expect(result.totalCount).toBe(3);
    expect(result.areas['a-bd'].count).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
});
