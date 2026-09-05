import { createSign } from 'crypto';

export const GOOGLE_ANALYTICS_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_ANALYTICS_DATA_ENDPOINT = 'https://analyticsdata.googleapis.com/v1beta';

const MIN_DAYS = 7;
const MAX_DAYS = 90;
const DEFAULT_DAYS = 30;
const REPORT_LIMIT = '10';

export const GA4_BEHAVIOR_EVENTS = [
  'search',
  'listing_result_click',
  'listing_view',
  'listing_save',
  'content_share',
  'contact_open',
  'phone_reveal',
  'zalo_click',
  'lead_submit',
] as const;

const FUNNEL_EVENT_NAMES = ['search', 'listing_view', 'contact_open', 'lead_submit'] as const;
const PRIVATE_PATH_PREFIXES = ['/quantrihethong', '/quantrithethong', '/noi-bo'] as const;
const CUSTOM_EVENT_DIMENSIONS: Record<GoogleAnalyticsDimension, string> = {
  listingId: 'customEvent:listingId',
  source: 'customEvent:source',
  channel: 'customEvent:channel',
};
const SAFE_DIMENSION_VALUE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

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

export type GoogleAnalyticsDiagnosticStage = 'configuration' | 'token' | 'property_report';

export type GoogleAnalyticsDiagnostic = {
  ok: boolean;
  configurationState: GoogleAnalyticsConfigurationState;
  stage: GoogleAnalyticsDiagnosticStage;
  propertyId: string | null;
  serviceAccount: string | null;
  message: string;
  errorCode: GoogleAnalyticsError['code'] | null;
};

export type GoogleAnalyticsOverview = {
  activeUsers: number;
  newUsers: number;
  sessions: number;
  pageViews: number;
  engagementRate: number;
};

export type GoogleAnalyticsDailyPoint = GoogleAnalyticsOverview & { date: string };
export type GoogleAnalyticsTopPage = { path: string; pageViews: number; activeUsers: number };
export type GoogleAnalyticsEvent = { name: string; eventCount: number; activeUsers: number };
export type GoogleAnalyticsDimension = 'listingId' | 'source' | 'channel';
export type GoogleAnalyticsDimensionRow = {
  eventName: string;
  eventCount: number;
  activeUsers: number;
  value: string;
};
export type GoogleAnalyticsDimensionBreakdown = {
  status: 'available' | 'empty' | 'unavailable';
  rows: GoogleAnalyticsDimensionRow[];
};
export type GoogleAnalyticsFunnelStep = GoogleAnalyticsEvent & { label: string };
export type GoogleAnalyticsAcquisition = { sourceMedium: string; sessions: number; activeUsers: number; engagementRate: number };
export type GoogleAnalyticsDevice = { category: string; sessions: number; activeUsers: number; pageViews: number };

export type GoogleAnalyticsReport = {
  days: number;
  startDate: string;
  endDate: string;
  overview: GoogleAnalyticsOverview;
  daily: GoogleAnalyticsDailyPoint[];
  topPages: GoogleAnalyticsTopPage[];
  funnel: GoogleAnalyticsFunnelStep[];
  topEvents: GoogleAnalyticsEvent[];
  dimensionBreakdowns: Record<GoogleAnalyticsDimension, GoogleAnalyticsDimensionBreakdown>;
  acquisition: GoogleAnalyticsAcquisition[];
  devices: GoogleAnalyticsDevice[];
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

function aggregateSimpleRows(rows: GaReportRow[], keyIndex: number, metricIndexes: [number, number, number]): Array<{ key: string; first: number; second: number; third: number }> {
  const groups = new Map<string, GaReportRow[]>();
  for (const row of rows) {
    const key = dimensionValue(row, keyIndex);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups].map(([key, group]) => ({
    key,
    first: group.reduce((sum, row) => sum + parseMetric(row.metricValues?.[metricIndexes[0]]?.value), 0),
    second: group.reduce((sum, row) => sum + parseMetric(row.metricValues?.[metricIndexes[1]]?.value), 0),
    third: group.reduce((sum, row) => sum + parseMetric(row.metricValues?.[metricIndexes[2]]?.value), 0),
  }));
}

function aggregateAcquisition(rows: GaReportRow[]): GoogleAnalyticsAcquisition[] {
  const groups = new Map<string, GaReportRow[]>();
  for (const row of rows) {
    const key = dimensionValue(row, 0, '(không xác định)');
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }
  return [...groups].map(([sourceMedium, group]) => {
    const sessions = group.reduce((sum, row) => sum + parseMetric(row.metricValues?.[0]?.value), 0);
    const activeUsers = group.reduce((sum, row) => sum + parseMetric(row.metricValues?.[1]?.value), 0);
    const weightedEngagement = group.reduce((sum, row) => sum + parseMetric(row.metricValues?.[2]?.value) * parseMetric(row.metricValues?.[0]?.value), 0);
    return { sourceMedium, sessions, activeUsers, engagementRate: sessions > 0 ? weightedEngagement / sessions : 0 };
  });
}

function aggregateDevices(rows: GaReportRow[]): GoogleAnalyticsDevice[] {
  return aggregateSimpleRows(rows, 0, [0, 1, 2]).map(row => ({ category: row.key, sessions: row.first, activeUsers: row.second, pageViews: row.third }));
}

function displayDate(value: string | undefined): string {
  if (!value || !/^\d{8}$/.test(value)) return '';
  return `${value.slice(6, 8)}/${value.slice(4, 6)}`;
}

function dimensionValue(row: GaReportRow, index = 0, fallback = ''): string {
  return row.dimensionValues?.[index]?.value || fallback;
}

function normalizeDimensionBreakdown(payload: GaReportResponse | undefined): GoogleAnalyticsDimensionBreakdown {
  if (!payload) return { status: 'unavailable', rows: [] };
  const groups = new Map<string, GoogleAnalyticsDimensionRow>();
  for (const row of payload.rows ?? []) {
    const eventName = dimensionValue(row, 0);
    const value = dimensionValue(row, 1).trim();
    if (!GA4_BEHAVIOR_EVENTS.includes(eventName as typeof GA4_BEHAVIOR_EVENTS[number]) || !SAFE_DIMENSION_VALUE.test(value)) continue;
    const key = `${eventName}|${value}`;
    const current = groups.get(key);
    const normalized = {
      eventName,
      eventCount: parseMetric(row.metricValues?.[0]?.value),
      activeUsers: parseMetric(row.metricValues?.[1]?.value),
      value,
    };
    groups.set(key, current ? {
      ...current,
      eventCount: current.eventCount + normalized.eventCount,
      activeUsers: current.activeUsers + normalized.activeUsers,
    } : normalized);
  }
  const rows = [...groups.values()].sort((a, b) => b.eventCount - a.eventCount || a.value.localeCompare(b.value));
  return { status: rows.length > 0 ? 'available' : 'empty', rows };
}

function unavailableDimensionBreakdown(): GoogleAnalyticsDimensionBreakdown {
  return { status: 'unavailable', rows: [] };
}

function dimensionBreakdowns(
  payloads: Partial<Record<GoogleAnalyticsDimension, GaReportResponse | undefined>>,
): Record<GoogleAnalyticsDimension, GoogleAnalyticsDimensionBreakdown> {
  return {
    listingId: payloads.listingId ? normalizeDimensionBreakdown(payloads.listingId) : unavailableDimensionBreakdown(),
    source: payloads.source ? normalizeDimensionBreakdown(payloads.source) : unavailableDimensionBreakdown(),
    channel: payloads.channel ? normalizeDimensionBreakdown(payloads.channel) : unavailableDimensionBreakdown(),
  };
}

export function publicPagePathFilter(): Record<string, unknown> {
  return {
    andGroup: {
      expressions: PRIVATE_PATH_PREFIXES.map(prefix => ({
        notExpression: {
          filter: {
            fieldName: 'pagePath',
            stringFilter: { matchType: 'BEGINS_WITH', value: prefix },
          },
        },
      })),
    },
  };
}

function behaviorEventFilter(): Record<string, unknown> {
  return {
    filter: {
      fieldName: 'eventName',
      inListFilter: { values: [...GA4_BEHAVIOR_EVENTS] },
    },
  };
}

function funnelLabel(name: string): string {
  switch (name) {
    case 'search': return 'Tìm kiếm';
    case 'listing_view': return 'Xem tin';
    case 'contact_open': return 'Mở liên hệ';
    case 'lead_submit': return 'Gửi lead';
    default: return name;
  }
}

export function normalizeGoogleAnalyticsReport(
  days: number,
  overviewPayload: GaReportResponse,
  dailyPayload: GaReportResponse,
  pagesPayload: GaReportResponse,
  eventsPayload: GaReportResponse = {},
  acquisitionPayload: GaReportResponse = {},
  devicesPayload: GaReportResponse = {},
  dimensionPayloads: Partial<Record<GoogleAnalyticsDimension, GaReportResponse | undefined>> = {},
): GoogleAnalyticsReport {
  const range = dateRange(days);
  const eventGroups = new Map<string, GaReportRow[]>();
  for (const row of eventsPayload.rows ?? []) {
    const name = dimensionValue(row, 0);
    if (!name) continue;
    eventGroups.set(name, [...(eventGroups.get(name) ?? []), row]);
  }
  const topEvents = [...eventGroups].map(([name, rows]) => ({
    name,
    eventCount: rows.reduce((sum, row) => sum + parseMetric(row.metricValues?.[0]?.value), 0),
    activeUsers: rows.reduce((sum, row) => sum + parseMetric(row.metricValues?.[1]?.value), 0),
  })).sort((a, b) => b.eventCount - a.eventCount);
  const eventByName = new Map(topEvents.map(event => [event.name, event]));

  return {
    days,
    ...range,
    overview: metricRow(overviewPayload.rows?.[0]),
    daily: (dailyPayload.rows ?? []).map(row => ({
      date: displayDate(row.dimensionValues?.[0]?.value),
      ...metricRow(row),
    })).filter(row => row.date),
    topPages: (pagesPayload.rows ?? []).map(row => ({
      path: dimensionValue(row, 0, '/'),
      pageViews: parseMetric(row.metricValues?.[0]?.value),
      activeUsers: parseMetric(row.metricValues?.[1]?.value),
    })).filter(row => row.path.startsWith('/')),
    funnel: FUNNEL_EVENT_NAMES.map(name => {
      const event = eventByName.get(name);
      return { name, label: funnelLabel(name), eventCount: event?.eventCount ?? 0, activeUsers: event?.activeUsers ?? 0 };
    }),
    topEvents,
    dimensionBreakdowns: dimensionBreakdowns(dimensionPayloads),
    acquisition: aggregateAcquisition(acquisitionPayload.rows ?? []),
    devices: aggregateDevices(devicesPayload.rows ?? []),
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

async function runOptionalDimensionReport(
  config: GoogleAnalyticsConfig,
  token: string,
  dateRanges: Array<{ startDate: string; endDate: string }>,
  dimension: GoogleAnalyticsDimension,
  publicPathDimensionFilter: Record<string, unknown>,
  fetchImpl: FetchLike,
): Promise<GaReportResponse | undefined> {
  try {
    return await runReport(config, token, {
      dateRanges,
      dimensions: [{ name: 'eventName' }, { name: CUSTOM_EVENT_DIMENSIONS[dimension] }],
      metrics: [{ name: 'eventCount' }, { name: 'activeUsers' }],
      dimensionFilter: { andGroup: { expressions: [behaviorEventFilter(), publicPathDimensionFilter] } },
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: '100000',
    }, fetchImpl);
  } catch {
    return undefined;
  }
}

export async function diagnoseGoogleAnalytics(config: GoogleAnalyticsConfig, fetchImpl: FetchLike = fetch): Promise<GoogleAnalyticsDiagnostic> {
  const base = {
    configurationState: 'configured' as const,
    propertyId: config.propertyId,
    serviceAccount: config.clientEmail,
  };
  let token: string;
  try {
    token = await getGoogleAnalyticsAccessToken(config, fetchImpl);
  } catch (error) {
    const gaError = error instanceof GoogleAnalyticsError ? error : null;
    return {
      ...base,
      ok: false,
      stage: 'token',
      message: gaError?.message ?? 'Không lấy được OAuth access token từ Google.',
      errorCode: gaError?.code ?? 'GOOGLE_AUTH',
    };
  }

  try {
    await runReport(config, token, {
      dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
      metrics: [{ name: 'activeUsers' }],
      limit: '1',
    }, fetchImpl);
    return {
      ...base,
      ok: true,
      stage: 'property_report',
      message: 'Service account đã xác thực và đọc được GA4 Property bằng Google Analytics Data API.',
      errorCode: null,
    };
  } catch (error) {
    const gaError = error instanceof GoogleAnalyticsError ? error : null;
    return {
      ...base,
      ok: false,
      stage: 'property_report',
      message: gaError?.message ?? 'Google đã cấp token nhưng từ chối đọc Property.',
      errorCode: gaError?.code ?? 'GOOGLE_REQUEST',
    };
  }
}

export async function getGoogleAnalyticsReport(config: GoogleAnalyticsConfig, requestedDays: unknown, fetchImpl: FetchLike = fetch): Promise<GoogleAnalyticsReport> {
  const days = normalizeGoogleAnalyticsDays(requestedDays);
  const range = dateRange(days);
  const dateRanges = [range];
  const overviewMetrics = ['activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'engagementRate'].map(name => ({ name }));
  const token = await getGoogleAnalyticsAccessToken(config, fetchImpl);
  const publicPathDimensionFilter = publicPagePathFilter();
  const [overview, daily, pages, events, acquisition, devices] = await Promise.all([
    runReport(config, token, { dateRanges, metrics: overviewMetrics }, fetchImpl),
    runReport(config, token, { dateRanges, dimensions: [{ name: 'date' }], metrics: overviewMetrics, orderBys: [{ dimension: { dimensionName: 'date' } }] }, fetchImpl),
    runReport(config, token, { dateRanges, dimensions: [{ name: 'pagePath' }], metrics: [{ name: 'screenPageViews' }, { name: 'activeUsers' }], dimensionFilter: publicPathDimensionFilter, orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }], limit: REPORT_LIMIT }, fetchImpl),
    runReport(config, token, { dateRanges, dimensions: [{ name: 'eventName' }, { name: 'pagePath' }], metrics: [{ name: 'eventCount' }, { name: 'activeUsers' }], dimensionFilter: { andGroup: { expressions: [behaviorEventFilter(), publicPathDimensionFilter] } }, orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }], limit: '100000' }, fetchImpl),
    runReport(config, token, { dateRanges, dimensions: [{ name: 'sessionSourceMedium' }], metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'engagementRate' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: REPORT_LIMIT }, fetchImpl),
    runReport(config, token, { dateRanges, dimensions: [{ name: 'deviceCategory' }], metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }], orderBys: [{ metric: { metricName: 'sessions' }, desc: true }], limit: REPORT_LIMIT }, fetchImpl),
  ]);
  const dimensionPayloads: Partial<Record<GoogleAnalyticsDimension, GaReportResponse | undefined>> = {};
  await Promise.all((Object.keys(CUSTOM_EVENT_DIMENSIONS) as GoogleAnalyticsDimension[]).map(async dimension => {
    dimensionPayloads[dimension] = await runOptionalDimensionReport(config, token, dateRanges, dimension, publicPathDimensionFilter, fetchImpl);
  }));
  return normalizeGoogleAnalyticsReport(days, overview, daily, pages, events, acquisition, devices, dimensionPayloads);
}
