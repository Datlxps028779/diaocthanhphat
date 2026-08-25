import { createSign } from 'crypto';

export const GOOGLE_ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_ANALYTICS_DATA_ENDPOINT = 'https://analyticsdata.googleapis.com/v1beta';

const MIN_DAYS = 7;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;

type FetchLike = typeof fetch;

type GoogleTokenResponse = {
  access_token?: string;
  error?: string;
  error_description?: string;
};

type GoogleApiError = {
  error?: { message?: string } | string;
};

type GaMetricValue = { value?: string };
type GaDimensionValue = { value?: string };
type GaReportRow = { dimensionValues?: GaDimensionValue[]; metricValues?: GaMetricValue[] };
type GaReportResponse = { rows?: GaReportRow[] };

export type GoogleAnalyticsConfig = {
  clientEmail: string;
  privateKey: string;
  propertyId: string;
};

export type GoogleAnalyticsConfigurationState = 'not_configured' | 'configured' | 'invalid';

export type GoogleAnalyticsOverview = {
  activeUsers: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  engagementRate: number;
};

export type GoogleAnalyticsDailyPoint = GoogleAnalyticsOverview & { date: string };
export type GoogleAnalyticsTopPage = { path: string; pageViews: number; activeUsers: number };

export type GoogleAnalyticsReport = {
  days: number;
  startDate: string;
  endDate: string;
  overview: GoogleAnalyticsOverview;
  daily: GoogleAnalyticsDailyPoint[];
  topPages: GoogleAnalyticsTopPage[];
};

export class GoogleAnalyticsError extends Error {
  constructor(
    readonly code: 'GOOGLE_NOT_CONFIGURED' | 'GOOGLE_CONFIG_INVALID' | 'GOOGLE_AUTH' | 'GOOGLE_REQUEST' | 'GOOGLE_RESPONSE',
    message: string,
  ) {
    super(message);
    this.name = 'GoogleAnalyticsError';
  }
}

function envValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseMetric(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

function base64Url(value: string): string {
  return Buffer.from(value).toString('base64url');
}

export function normalizeGoogleAnalyticsDays(value: unknown): number {
  const parsed = typeof value === 'string' ? Number(value) : value;
  if (typeof parsed !== 'number' || !Number.isInteger(parsed) || parsed < MIN_DAYS || parsed > MAX_DAYS) {
    return DEFAULT_DAYS;
  }
  return parsed;
}

export function getGoogleAnalyticsConfig(env: NodeJS.ProcessEnv = process.env): GoogleAnalyticsConfig | null {
  const clientEmail = envValue(env.GOOGLE_ANALYTICS_CLIENT_EMAIL);
  const privateKey = envValue(env.GOOGLE_ANALYTICS_PRIVATE_KEY)?.replace(/\\n/g, '\n') ?? null;
  const propertyId = envValue(env.GOOGLE_ANALYTICS_PROPERTY_ID);
  const values = [clientEmail, privateKey, propertyId];

  if (values.every(value => value === null)) return null;
  if (values.some(value => value === null)) {
    throw new GoogleAnalyticsError('GOOGLE_CONFIG_INVALID', 'Thiếu biến môi trường GA4 phía server. Không đưa thông tin xác thực vào trình duyệt hoặc SQL.');
  }
  if (!clientEmail!.endsWith('.gserviceaccount.com') || !privateKey!.includes('BEGIN PRIVATE KEY') || !/^\d+$/.test(propertyId!)) {
    throw new GoogleAnalyticsError('GOOGLE_CONFIG_INVALID', 'Thông tin service account hoặc Google Analytics Property ID không đúng định dạng.');
  }

  return { clientEmail: clientEmail!, privateKey: privateKey!, propertyId: propertyId! };
}

export function getGoogleAnalyticsConfigurationState(): GoogleAnalyticsConfigurationState {
  try {
    return getGoogleAnalyticsConfig() ? 'configured' : 'not_configured';
  } catch (error) {
    if (error instanceof GoogleAnalyticsError) return 'invalid';
    throw error;
  }
}

export function createGoogleAnalyticsAssertion(config: GoogleAnalyticsConfig, now = Math.floor(Date.now() / 1000)): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64Url(JSON.stringify({
    iss: config.clientEmail,
    scope: GOOGLE_ANALYTICS_SCOPE,
    aud: GOOGLE_TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claimSet}`);
  signer.end();
  return `${header}.${claimSet}.${signer.sign(config.privateKey, 'base64url')}`;
}

async function responseError(response: Response, fallback: string): Promise<GoogleAnalyticsError> {
  const body = await response.json().catch(() => ({})) as GoogleApiError;
  const detail = typeof body.error === 'string' ? body.error : body.error?.message;
  const code = response.status === 401 || response.status === 403 ? 'GOOGLE_AUTH' : 'GOOGLE_REQUEST';
  return new GoogleAnalyticsError(code, detail ? `${fallback}: ${detail}` : fallback);
}

export async function getGoogleAnalyticsAccessToken(config: GoogleAnalyticsConfig, fetchImpl: FetchLike = fetch): Promise<string> {
  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: createGoogleAnalyticsAssertion(config),
  });
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const body = await response.json().catch(() => ({})) as GoogleTokenResponse;
  if (!response.ok || !body.access_token) {
    const detail = body.error_description || body.error;
    throw new GoogleAnalyticsError('GOOGLE_AUTH', detail ? `Không xác thực được Google Analytics: ${detail}` : 'Không xác thực được Google Analytics.');
  }
  return body.access_token;
}

function isoDateFromOffset(daysAgo: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

function dateRange(days: number): { startDate: string; endDate: string } {
  return { startDate: isoDateFromOffset(days - 1), endDate: isoDateFromOffset(0) };
}

function metricRow(row: GaReportRow | undefined): GoogleAnalyticsOverview {
  const values = row?.metricValues ?? [];
  return {
    activeUsers: parseMetric(values[0]?.value),
    newUsers: parseMetric(values[1]?.value),
    sessions: parseMetric(values[2]?.value),
    pageViews: parseMetric(values[3]?.value),
    engagementRate: parseMetric(values[4]?.value),
  };
}

function displayDate(value: string | undefined): string {
  if (!value || !/^\d{8}$/.test(value)) return '';
  return `${value.slice(6, 8)}/${value.slice(4, 6)}`;
}

export function normalizeGoogleAnalyticsReport(
  days: number,
  overviewPayload: GaReportResponse,
  dailyPayload: GaReportResponse,
  pagesPayload: GaReportResponse,
): GoogleAnalyticsReport {
  const range = dateRange(days);
  return {
    days,
    ...range,
    overview: metricRow(overviewPayload.rows?.[0]),
    daily: (dailyPayload.rows ?? []).map(row => ({
      date: displayDate(row.dimensionValues?.[0]?.value),
      ...metricRow(row),
    })).filter(row => row.date),
    topPages: (pagesPayload.rows ?? []).map(row => ({
      path: row.dimensionValues?.[0]?.value || '/',
      pageViews: parseMetric(row.metricValues?.[0]?.value),
      activeUsers: parseMetric(row.metricValues?.[1]?.value),
    })).filter(row => row.path.startsWith('/')),
  };
}

async function runReport(config: GoogleAnalyticsConfig, token: string, body: Record<string, unknown>, fetchImpl: FetchLike): Promise<GaReportResponse> {
  const response = await fetchImpl(`${GOOGLE_ANALYTICS_DATA_ENDPOINT}/properties/${config.propertyId}:runReport`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw await responseError(response, 'Google Analytics từ chối yêu cầu báo cáo');
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    throw new GoogleAnalyticsError('GOOGLE_RESPONSE', 'Google Analytics trả về báo cáo không hợp lệ.');
  }
  return payload as GaReportResponse;
}

export async function getGoogleAnalyticsReport(config: GoogleAnalyticsConfig, requestedDays: unknown, fetchImpl: FetchLike = fetch): Promise<GoogleAnalyticsReport> {
  const days = normalizeGoogleAnalyticsDays(requestedDays);
  const range = dateRange(days);
  const dateRanges = [range];
  const metrics = ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'engagementRate'].map(name => ({ name }));
  const token = await getGoogleAnalyticsAccessToken(config, fetchImpl);
  const [overview, daily, pages] = await Promise.all([
    runReport(config, token, { dateRanges, metrics }, fetchImpl),
    runReport(config, token, { dateRanges, dimensions: [{ name: 'date' }], metrics, orderBys: [{ dimension: { dimensionName: 'date' } }] }, fetchImpl),
    runReport(config, token, { dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }], orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: '10' }, fetchImpl),
  ]);
  return normalizeGoogleAnalyticsReport(days, overview, daily, pages);
}
