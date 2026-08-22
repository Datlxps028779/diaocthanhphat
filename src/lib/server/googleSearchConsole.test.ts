import { generateKeyPairSync } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_INSPECTION_ENDPOINT,
  GOOGLE_SITEMAP_ENDPOINT,
  GOOGLE_SITES_ENDPOINT,
  diagnoseSearchConsoleAccess,
  diagnoseSearchConsoleAccessEntries,
  getSearchConsoleConfig,
  inspectSearchConsoleUrl,
  normalizeUrlInspectionEvidence,
  submitSearchConsoleSitemap,
  type SearchConsoleConfig,
} from './googleSearchConsole';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config: SearchConsoleConfig = {
  clientEmail: 'search-console@chonhaviet.iam.gserviceaccount.com',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  siteUrl: 'https://chonhaviet.com/',
  sitemapUrl: 'https://chonhaviet.com/sitemap.xml',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

describe('googleSearchConsole', () => {
  it('keeps all credential configuration server-only and canonical', () => {
    expect(getSearchConsoleConfig({} as unknown as NodeJS.ProcessEnv)).toBeNull();
    expect(() => getSearchConsoleConfig({
      GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL: config.clientEmail,
      GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY: config.privateKey,
      GOOGLE_SEARCH_CONSOLE_SITE_URL: 'https://preview.vercel.app/',
      GOOGLE_SEARCH_CONSOLE_SITEMAP_URL: config.sitemapUrl,
    } as unknown as NodeJS.ProcessEnv)).toThrow('https://chonhaviet.com');
  });

  it('submits only the configured sitemap with the documented idempotent PUT request', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ access_token: 'secret-token' }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    await submitSearchConsoleSitemap(config, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [endpoint, init] = fetchMock.mock.calls[1];
    expect(endpoint).toBe(`${GOOGLE_SITEMAP_ENDPOINT}/${encodeURIComponent(config.siteUrl)}/sitemaps/${encodeURIComponent(config.sitemapUrl)}`);
    expect(init).toMatchObject({ method: 'PUT', headers: { Authorization: 'Bearer secret-token' } });
    expect(init.body).toBeUndefined();
  });

  it('diagnoses only the configured service account property access without submitting a sitemap', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ access_token: 'secret-token' }))
      .mockResolvedValueOnce(response({ siteEntry: [
        { siteUrl: 'https://chonhaviet.com/', permissionLevel: 'siteFullUser' },
        { siteUrl: 'https://www.chonhaviet.com/', permissionLevel: 'siteOwner' },
        { siteUrl: 'https://unrelated.example/', permissionLevel: 'siteOwner' },
      ] }));

    const diagnosis = await diagnoseSearchConsoleAccess(config, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(GOOGLE_SITES_ENDPOINT);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ method: 'GET', headers: { Authorization: 'Bearer secret-token' } });
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('sitemap.xml');
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain(GOOGLE_INSPECTION_ENDPOINT);
    expect(diagnosis).toMatchObject({
      serviceAccountEmail: config.clientEmail,
      status: 'ACCESS_CONFIRMED',
      canonicalProperty: { found: true, permissionLevel: 'siteFullUser', sufficient: true },
      alternateProperties: [{ siteUrl: 'https://www.chonhaviet.com/', permissionLevel: 'siteOwner' }],
    });
    expect(JSON.stringify(diagnosis)).not.toContain('secret-token');
  });

  it('distinguishes missing, domain-only, and insufficient canonical property permissions', () => {
    const domainOnly = diagnoseSearchConsoleAccessEntries(config, [{ siteUrl: 'sc-domain:chonhaviet.com', permissionLevel: 'siteOwner' }]);
    expect(domainOnly).toMatchObject({
      status: 'CANONICAL_PROPERTY_MISSING',
      canonicalProperty: { found: false, sufficient: false },
      domainProperty: { found: true, permissionLevel: 'siteOwner' },
    });

    const insufficient = diagnoseSearchConsoleAccessEntries(config, [{ siteUrl: config.siteUrl, permissionLevel: 'siteRestrictedUser' }]);
    expect(insufficient).toMatchObject({
      status: 'CANONICAL_PERMISSION_INSUFFICIENT',
      canonicalProperty: { found: true, permissionLevel: 'siteRestrictedUser', sufficient: false },
    });

    const owner = diagnoseSearchConsoleAccessEntries(config, [{ siteUrl: config.siteUrl, permissionLevel: 'siteOwner' }]);
    expect(owner.canonicalProperty.sufficient).toBe(true);
    expect(owner.status).toBe('ACCESS_CONFIRMED');
  });

  it('uses a fixed Search Console property and normalizes only Google index evidence', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ access_token: 'secret-token' }))
      .mockResolvedValueOnce(response({
        inspectionResult: {
          indexStatusResult: {
            verdict: 'PASS', coverageState: 'Submitted and indexed', googleCanonical: 'https://chonhaviet.com/tin-tuc/bai',
            userCanonical: 'https://chonhaviet.com/tin-tuc/bai', robotsTxtState: 'ALLOWED', lastCrawlTime: '2026-08-20T00:00:00Z',
          },
        },
      }));

    const evidence = await inspectSearchConsoleUrl(config, 'https://chonhaviet.com/tin-tuc/bai', fetchMock);

    expect(fetchMock.mock.calls[1][0]).toBe(GOOGLE_INSPECTION_ENDPOINT);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
      inspectionUrl: 'https://chonhaviet.com/tin-tuc/bai', siteUrl: config.siteUrl, languageCode: 'vi-VN',
    });
    expect(evidence).toMatchObject({ verdict: 'PASS', coverageState: 'Submitted and indexed', robotsState: 'ALLOWED' });
  });

  it('rejects preview, query-string, and fragment inspection URLs before Google is called', async () => {
    const fetchMock = vi.fn();
    await expect(inspectSearchConsoleUrl(config, 'https://preview.vercel.app/tin-tuc/bai', fetchMock)).rejects.toThrow('canonical');
    await expect(inspectSearchConsoleUrl(config, 'https://chonhaviet.com/tin-tuc/bai?x=1', fetchMock)).rejects.toThrow('canonical');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('preserves a missing Google verdict as missing evidence rather than inferring not-indexed', () => {
    const evidence = normalizeUrlInspectionEvidence({ inspectionResult: { indexStatusResult: {} } });
    expect(evidence).toMatchObject({ verdict: null, coverageState: null, googleCanonical: null });
  });
});
