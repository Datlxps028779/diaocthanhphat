import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('next/cache', () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock('react', () => ({ cache: (fn: unknown) => fn }));
import { loadLocalitySnapshot } from './localitySnapshot';

const area = { id: 'a', slug: 'binh-duong', name: 'Bình Dương', description: 'Mô tả công khai', admin_note: 'Ghi chú công khai', meta_title: 'Tiêu đề', meta_description: 'Mô tả SEO', focus_keywords: 'nhà đất', image_url: null };
const district = { id: 'd', area_id: 'a', slug: 'binh-duong-di-an', name: 'Dĩ An' };
type Row = Record<string, unknown>;
const response = (rows: Row[], count: number) => new Response(JSON.stringify(rows), { headers: { 'content-range': `${rows.length ? `0-${rows.length - 1}` : '*'}/${count}` } });
function fixture(wards: Row[] = [], override?: (table: string, url: URL, rows: Row[]) => Response | undefined) {
  const tables: Record<string, Row[]> = { areas: [area], districts: [district], wards, property_types: [], public_properties: [] };
  return vi.fn<typeof fetch>(async input => {
    const url = new URL(String(input));
    const table = url.pathname.split('/').pop()!;
    const rows = tables[table].filter(row => String(row.id) > (url.searchParams.get('id')?.slice(3) ?? ''));
    return override?.(table, url, rows) ?? response(rows.slice(0, Number(url.searchParams.get('limit') ?? 1000)), rows.length);
  });
}
const options = (fetcher: typeof fetch) => ({ url: 'https://public.example', anonKey: 'public-test-key', fetcher });
afterEach(() => vi.useRealTimers());

describe('complete locality taxonomy contract', () => {
  it('preserves every public editorial field and reads more than 1000 wards', async () => {
    const wards = Array.from({ length: 1203 }, (_, i) => ({ id: `w${String(i).padStart(4, '0')}`, district_id: 'd', slug: `ward-${i}`, name: `Phường ${i}` }));
    const fetcher = fixture(wards);
    const result = await loadLocalitySnapshot(options(fetcher));
    expect(result.areas).toEqual([area]);
    expect(result.wards).toHaveLength(1203);
    const calls = fetcher.mock.calls.filter(([url]) => String(url).includes('/wards?'));
    expect(calls).toHaveLength(4);
    expect(calls.every(([, init]) => (init?.headers as Record<string, string>).Prefer === 'count=exact')).toBe(true);
    expect(calls.every(([, init]) => init?.credentials === 'omit')).toBe(true);
  });
  it.each(['slug', 'name', 'area_id'])('rejects a missing required district %s instead of coercing null', async field => {
    const fetcher = fixture([], (table) => table === 'districts' ? response([{ ...district, [field]: null }], 1) : undefined);
    await expect(loadLocalitySnapshot(options(fetcher))).rejects.toThrow('Locality snapshot unavailable');
  });
  it('rejects truncated taxonomy rather than treating one page as complete', async () => {
    const fetcher = fixture([], table => table === 'wards' ? response([{ id: 'w', slug: 'ward', name: 'Phường', district_id: 'd' }], 1203) : undefined);
    await expect(loadLocalitySnapshot(options(fetcher))).rejects.toThrow('Locality snapshot unavailable');
  });
  it('rejects counts over the cap without publishing partial data', async () => {
    const fetcher = fixture([], table => table === 'wards' ? response([], 5001) : undefined);
    await expect(loadLocalitySnapshot(options(fetcher))).rejects.toThrow('Locality snapshot unavailable');
  });
  it('rejects changed global taxonomy count at final probe', async () => {
    let reads = 0;
    const fetcher = fixture([], table => table === 'areas' ? response([area], ++reads === 1 ? 1 : 2) : undefined);
    await expect(loadLocalitySnapshot(options(fetcher))).rejects.toThrow('Locality snapshot unavailable');
  });
  it('bounds a taxonomy fetch that does not honor AbortSignal', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>(() => new Promise(() => {}));
    const pending = expect(loadLocalitySnapshot({ ...options(fetcher), timeoutMs: 10 })).rejects.toThrow('Locality snapshot unavailable');
    await vi.advanceTimersByTimeAsync(10);
    await pending;
  });
});
