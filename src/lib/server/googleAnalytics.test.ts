import { generateKeyPairSync } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  GOOGLE_ANALYTICS_DATA_ENDPOINT,
  GOOGLE_ANALYTICS_SCOPE,
  GOOGLE_TOKEN_ENDPOINT,
  createGoogleAnalyticsAssertion,
  getGoogleAnalyticsConfig,
  getGoogleAnalyticsReport,
  normalizeGoogleAnalyticsDays,
  normalizeGoogleAnalyticsReport,
  type GoogleAnalyticsConfig,
} from './googleAnalytics';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const config: GoogleAnalyticsConfig = {
  clientEmail: 'analytics@chonhaviet.iam.gserviceaccount.com',
  privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
  propertyId: '123456789',
};

function response(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function decodeClaim(assertion: string): Record<string, unknown> {
  return JSON.parse(Buffer.from(assertion.split('.')[1], 'base64url').toString());
}

describe('googleAnalytics', () => {
  it('only accepts complete server-only service-account configuration and numeric property IDs', () => {
    expect(getGoogleAnalyticsConfig({} as NodeJS.ProcessEnv)).toBeNull();
    expect(() => getGoogleAnalyticsConfig({
      GOOGLE_ANALYTICS_CLIENT_EMAIL: config.clientEmail,
      GOOGLE_ANALYTICS_PRIVATE_KEY: config.privateKey,
      GOOGLE_ANALYTICS_PROPERTY_ID: 'not-a-property',
    } as unknown as NodeJS.ProcessEnv)).toThrow('Property ID');
  });

  it('creates a service-account assertion scoped exclusively to GA4 read access', () => {
    const claim = decodeClaim(createGoogleAnalyticsAssertion(config, 1_700_000_000));
    expect(claim).toMatchObject({ iss: config.clientEmail, scope: GOOGLE_ANALYTICS_SCOPE, aud: GOOGLE_TOKEN_ENDPOINT, iat: 1_700_000_000, exp: 1_700_003_600 });
  });

  it('bounds unknown report ranges to the safe default', () => {
    expect(normalizeGoogleAnalyticsDays(7)).toBe(7);
    expect(normalizeGoogleAnalyticsDays('90')).toBe(90);
    expect(normalizeGoogleAnalyticsDays(6)).toBe(30);
    expect(normalizeGoogleAnalyticsDays(91)).toBe(30);
    expect(normalizeGoogleAnalyticsDays('abc')).toBe(30);
  });

  it('normalizes GA4 report rows without inferring missing values', () => {
    const report = normalizeGoogleAnalyticsReport(30,
      { rows: [{ metricValues: [{ value: '20' }, { value: '11' }, { value: '32' }, { value: '55' }, { value: '0.625' }] }] },
      { rows: [{ dimensionValues: [{ value: '20260825' }], metricValues: [{ value: '2' }, { value: '1' }, { value: '3' }, { value: '5' }, { value: '0.5' }] }] },
      { rows: [{ dimensionValues: [{ value: '/tin-tuc' }], metricValues: [{ value: '12' }, { value: '7' }] }, { dimensionValues: [{ value: 'https://external.example/' }], metricValues: [{ value: '9' }, { value: '4' }] }] },
    );
    expect(report.overview).toEqual({ activeUsers: 20, newUsers: 11, sessions: 32, pageViews: 55, engagementRate: 0.625 });
    expect(report.daily).toEqual([{ date: '25/08', activeUsers: 2, newUsers: 1, sessions: 3, pageViews: 5, engagementRate: 0.5 }]);
    expect(report.topPages).toEqual([{ path: '/tin-tuc', pageViews: 12, activeUsers: 7 }]);
  });

  it('calls only the GA4 Data API with bounded page rows and never exposes the access token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(response({ access_token: 'secret-token' }))
      .mockResolvedValueOnce(response({ rows: [] }))
      .mockResolvedValueOnce(response({ rows: [] }))
      .mockResolvedValueOnce(response({ rows: [] }));

    const report = await getGoogleAnalyticsReport(config, 30, fetchMock);

    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const [, init] of fetchMock.mock.calls.slice(1)) {
      expect(init).toMatchObject({ method: 'POST', headers: { Authorization: 'Bearer secret-token' } });
    }
    expect(fetchMock.mock.calls[1][0]).toBe(`${GOOGLE_ANALYTICS_DATA_ENDPOINT}/properties/${config.propertyId}:runReport`);
    expect(JSON.parse(fetchMock.mock.calls[3][1].body)).toMatchObject({ limit: '10', dimensions: [{ name: 'pagePath' }] });
    expect(JSON.stringify(report)).not.toContain('secret-token');
  });
});
