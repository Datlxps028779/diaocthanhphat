import { describe, expect, it, vi } from 'vitest';
import { checkLocalityRequest } from './localityRequest';

const area = { id: 'a', slug: 'binh-duong', name: 'Bình Dương' };
const district = { id: 'd', slug: 'binh-duong-di-an', name: 'Dĩ An', area_id: 'a' };
const type = { id: 't', slug: 'dat-nen', name: 'Đất nền' };
function fixture(count = 2) {
  const requests: string[] = [];
  const fetcher = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push(url.toString());
    if (init?.method === 'HEAD') return new Response(null, { status: 200, headers: { 'content-range': `*/${count}` } });
    const rows = url.pathname.endsWith('/areas') ? [area] : url.pathname.endsWith('/districts') ? [district] : url.pathname.endsWith('/wards') ? [{ id: 'w', district_id: 'd', slug: 'tan-dong-hiep', name: 'Tân Đông Hiệp' }] : [type];
    return new Response(JSON.stringify(rows), { headers: { 'content-range': `0-${rows.length - 1}/${rows.length}` } });
  });
  return { requests, fetcher, url: 'https://example.supabase.co', anonKey: 'public-fixture' };
}

describe('locality HTTP preflight', () => {
  it('validates ward parentage before a streaming page can return 200', async () => {
    const options = fixture();
    expect(await checkLocalityRequest('/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep', options)).toEqual({ status: 'valid', path: '/mua-ban/binh-duong/di-an/phuong-xa/tan-dong-hiep' });
    expect((await checkLocalityRequest('/mua-ban/binh-duong/sai-huyen/phuong-xa/tan-dong-hiep', options)).status).toBe('not-found');
  });
  it('returns not-found for new empty type and sale-price facets', async () => {
    const options = fixture(0);
    expect((await checkLocalityRequest('/mua-ban/binh-duong/loai/dat-nen', options)).status).toBe('not-found');
    expect((await checkLocalityRequest('/mua-ban/binh-duong/gia/tu-1-den-duoi-2-ty/thong-tin', options)).status).toBe('not-found');
    expect(options.requests.some(url => decodeURIComponent(url).includes('price_unit.eq.triệu'))).toBe(true);
  });
  it('keeps report canonical paths and rejects groups without taxonomy members', async () => {
    const options = fixture(20);
    expect(await checkLocalityRequest('/khu-vuc/binh-duong/thong-tin', options)).toEqual({ status: 'valid', path: '/khu-vuc/binh-duong/thong-tin' });
    expect(await checkLocalityRequest('/mua-ban/binh-duong/loai/day-tro', options)).toEqual({ status: 'not-found' });
    expect(options.fetcher.mock.calls.some(([, init]) => init?.method === 'HEAD')).toBe(false);
  });
  it('never converts an upstream error into a geographic 404', async () => {
    const options = fixture();
    options.fetcher.mockRejectedValue(new Error('secret body'));
    expect(await checkLocalityRequest('/khu-vuc/binh-duong', options)).toEqual({ status: 'unavailable' });
  });
  it('rejects report suffix on a product and malformed paths', async () => {
    const options = fixture();
    expect((await checkLocalityRequest('/mua-ban/binh-duong/di-an/dat-pr123/thong-tin', options)).status).toBe('not-found');
    expect((await checkLocalityRequest('/mua-ban/%ZZ', options)).status).toBe('not-found');
    expect((await checkLocalityRequest('/cho-thue/binh-duong/gia/duoi-1-ty', options)).status).toBe('not-found');
  });
  it('fails closed when content-range is not an exact PostgREST range', async () => {
    const options = fixture();
    options.fetcher.mockImplementation(async () => new Response(JSON.stringify([area]), {
      headers: { 'content-range': 'upstream/1' },
    }));
    expect(await checkLocalityRequest('/khu-vuc/binh-duong', options)).toEqual({ status: 'unavailable' });
  });
  it('fails closed when a taxonomy response is truncated', async () => {
    const options = fixture();
    options.fetcher.mockImplementation(async () => new Response(JSON.stringify([area]), { headers: { 'content-range': '0-0/7' } }));
    expect(await checkLocalityRequest('/khu-vuc/binh-duong', options)).toEqual({ status: 'unavailable' });
  });
});
