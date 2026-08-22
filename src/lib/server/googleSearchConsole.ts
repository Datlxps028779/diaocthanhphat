import { createSign } from 'crypto';

export const GOOGLE_SEARCH_CONSOLE_SCOPE = 'https://www.googleapis.com/auth/webmasters';
export const GOOGLE_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
export const GOOGLE_SITES_ENDPOINT = 'https://www.googleapis.com/webmasters/v3/sites';
export const GOOGLE_SITEMAP_ENDPOINT = GOOGLE_SITES_ENDPOINT;
export const GOOGLE_INSPECTION_ENDPOINT = 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect';
export const SEARCH_CONSOLE_CANONICAL_ORIGIN = 'https://chonhaviet.com';

type FetchLike = typeof fetch;

type GoogleTokenResponse = {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleApiError = {
  error?: { message?: string; status?: string } | string;
};

type GoogleSiteEntry = {
  siteUrl?: string;
  permissionLevel?: string;
};

type GoogleSitesResponse = {
  siteEntry?: GoogleSiteEntry[];
};

export type SearchConsoleAccessDiagnosis = {
  serviceAccountEmail: string;
  canonicalProperty: { found: boolean; permissionLevel: string | null; sufficient: boolean };
  domainProperty: { found: boolean; permissionLevel: string | null };
  alternateProperties: Array<{ siteUrl: string; permissionLevel: string | null }>;
  status: 'ACCESS_CONFIRMED' | 'CANONICAL_PROPERTY_MISSING' | 'CANONICAL_PERMISSION_INSUFFICIENT';
  message: string;
};

export type SearchConsoleConfig = {
  clientEmail: string;
  privateKey: string;
  siteUrl: string;
  sitemapUrl: string;
};

export type UrlInspectionEvidence = {
  verdict: string | null;
  coverageState: string | null;
  googleCanonical: string | null;
  userCanonical: string | null;
  robotsState: string | null;
  lastCrawlAt: string | null;
  raw: Record<string, unknown>;
};

export class SearchConsoleError extends Error {
  constructor(
    readonly code: 'GOOGLE_NOT_CONFIGURED' | 'GOOGLE_CONFIG_INVALID' | 'GOOGLE_AUTH' | 'GOOGLE_REQUEST' | 'GOOGLE_RESPONSE',
    message: string,
  ) {
    super(message);
    this.name = 'SearchConsoleError';
  }
}

function envValue(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function requireCanonicalSiteUrl(value: string, field: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SearchConsoleError('GOOGLE_CONFIG_INVALID', `${field} phải là URL hợp lệ của https://chonhaviet.com.`);
  }
  if (parsed.origin !== SEARCH_CONSOLE_CANONICAL_ORIGIN || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new SearchConsoleError('GOOGLE_CONFIG_INVALID', `${field} phải là ${SEARCH_CONSOLE_CANONICAL_ORIGIN}/.`);
  }
  return `${parsed.origin}/`;
}

function requireCanonicalSitemapUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new SearchConsoleError('GOOGLE_CONFIG_INVALID', 'GOOGLE_SEARCH_CONSOLE_SITEMAP_URL phải là URL sitemap hợp lệ.');
  }
  if (parsed.origin !== SEARCH_CONSOLE_CANONICAL_ORIGIN || parsed.search || parsed.hash || !parsed.pathname.endsWith('.xml')) {
    throw new SearchConsoleError('GOOGLE_CONFIG_INVALID', 'GOOGLE_SEARCH_CONSOLE_SITEMAP_URL phải là sitemap XML trên https://chonhaviet.com.');
  }
  return parsed.toString();
}

export function getSearchConsoleConfig(env: NodeJS.ProcessEnv = process.env): SearchConsoleConfig | null {
  const clientEmail = envValue(env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL);
  const privateKey = envValue(env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY)?.replace(/\\n/g, '\n') ?? null;
  const siteUrl = envValue(env.GOOGLE_SEARCH_CONSOLE_SITE_URL);
  const sitemapUrl = envValue(env.GOOGLE_SEARCH_CONSOLE_SITEMAP_URL);
  const values = [clientEmail, privateKey, siteUrl, sitemapUrl];

  if (values.every(value => value === null)) return null;
  if (values.some(value => value === null)) {
    throw new SearchConsoleError('GOOGLE_CONFIG_INVALID', 'Thiếu biến môi trường Search Console phía server. Không đưa thông tin xác thực vào trình duyệt hoặc SQL.');
  }
  if (!clientEmail!.endsWith('.gserviceaccount.com') || !privateKey!.includes('BEGIN PRIVATE KEY')) {
    throw new SearchConsoleError('GOOGLE_CONFIG_INVALID', 'Thông tin service account Search Console không đúng định dạng.');
  }

  return {
    clientEmail: clientEmail!,
    privateKey: privateKey!,
    siteUrl: requireCanonicalSiteUrl(siteUrl!, 'GOOGLE_SEARCH_CONSOLE_SITE_URL'),
    sitemapUrl: requireCanonicalSitemapUrl(sitemapUrl!),
  };
}

export function getSearchConsoleConfigurationState(): 'not_configured' | 'configured' | 'invalid' {
  try {
    return getSearchConsoleConfig() ? 'configured' : 'not_configured';
  } catch (error) {
    if (error instanceof SearchConsoleError) return 'invalid';
    throw error;
  }
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString('base64url');
}

export function createServiceAccountAssertion(config: SearchConsoleConfig, now = Math.floor(Date.now() / 1000)): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64Url(JSON.stringify({
    iss: config.clientEmail,
    scope: GOOGLE_SEARCH_CONSOLE_SCOPE,
    aud: GOOGLE_TOKEN_ENDPOINT,
    iat: now,
    exp: now + 3600,
  }));
  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claimSet}`);
  signer.end();
  return `${header}.${claimSet}.${signer.sign(config.privateKey, 'base64url')}`;
}

async function responseError(response: Response, fallback: string): Promise<SearchConsoleError> {
  const body = await response.json().catch(() => ({})) as GoogleApiError;
  const detail = typeof body.error === 'string' ? body.error : body.error?.message;
  const code = response.status === 401 || response.status === 403 ? 'GOOGLE_AUTH' : 'GOOGLE_REQUEST';
  return new SearchConsoleError(code, detail ? `${fallback}: ${detail}` : fallback);
}

export async function getSearchConsoleAccessToken(config: SearchConsoleConfig, fetchImpl: FetchLike = fetch): Promise<string> {
  const form = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion: createServiceAccountAssertion(config),
  });
  const response = await fetchImpl(GOOGLE_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const body = await response.json().catch(() => ({})) as GoogleTokenResponse;
  if (!response.ok || !body.access_token) {
    const detail = body.error_description || body.error;
    throw new SearchConsoleError('GOOGLE_AUTH', detail ? `Không xác thực được Google Search Console: ${detail}` : 'Không xác thực được Google Search Console.');
  }
  return body.access_token;
}

async function authorizedRequest(url: string, init: RequestInit, config: SearchConsoleConfig, fetchImpl: FetchLike): Promise<Response> {
  const token = await getSearchConsoleAccessToken(config, fetchImpl);
  const response = await fetchImpl(url, {
    ...init,
    headers: { ...init.headers, Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw await responseError(response, 'Google Search Console từ chối yêu cầu');
  return response;
}

export async function submitSearchConsoleSitemap(config: SearchConsoleConfig, fetchImpl: FetchLike = fetch): Promise<void> {
  const endpoint = `${GOOGLE_SITEMAP_ENDPOINT}/${encodeURIComponent(config.siteUrl)}/sitemaps/${encodeURIComponent(config.sitemapUrl)}`;
  await authorizedRequest(endpoint, { method: 'PUT' }, config, fetchImpl);
}

function permissionLevel(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function hasSufficientSitePermission(value: string | null): boolean {
  return value === 'siteFullUser' || value === 'siteOwner';
}

function diagnosisMessage(status: SearchConsoleAccessDiagnosis['status']): string {
  if (status === 'ACCESS_CONFIRMED') {
    return 'Service account có quyền đầy đủ trên URL-prefix property https://chonhaviet.com/. Có thể thử gửi sitemap lại một lần.';
  }
  if (status === 'CANONICAL_PERMISSION_INSUFFICIENT') {
    return 'Service account nhìn thấy URL-prefix property https://chonhaviet.com/ nhưng quyền hiện tại chưa đủ. Verified owner cần nâng quyền lên Full user hoặc Owner tại đúng property này.';
  }
  return 'Service account không nhìn thấy URL-prefix property https://chonhaviet.com/. Verified owner cần thêm đúng email service account vào Settings → Users and permissions của property này với quyền Full user.';
}

export function diagnoseSearchConsoleAccessEntries(config: SearchConsoleConfig, entries: GoogleSiteEntry[]): SearchConsoleAccessDiagnosis {
  const canonical = entries.find(entry => entry.siteUrl === config.siteUrl);
  const canonicalPermission = permissionLevel(canonical?.permissionLevel);
  const domain = entries.find(entry => entry.siteUrl === 'sc-domain:chonhaviet.com');
  const alternateProperties = entries
    .filter(entry => entry.siteUrl === 'http://chonhaviet.com/' || entry.siteUrl === 'http://www.chonhaviet.com/' || entry.siteUrl === 'https://www.chonhaviet.com/')
    .map(entry => ({ siteUrl: entry.siteUrl!, permissionLevel: permissionLevel(entry.permissionLevel) }));
  const status = !canonical
    ? 'CANONICAL_PROPERTY_MISSING'
    : hasSufficientSitePermission(canonicalPermission)
      ? 'ACCESS_CONFIRMED'
      : 'CANONICAL_PERMISSION_INSUFFICIENT';

  return {
    serviceAccountEmail: config.clientEmail,
    canonicalProperty: { found: !!canonical, permissionLevel: canonicalPermission, sufficient: hasSufficientSitePermission(canonicalPermission) },
    domainProperty: { found: !!domain, permissionLevel: permissionLevel(domain?.permissionLevel) },
    alternateProperties,
    status,
    message: diagnosisMessage(status),
  };
}

// Read-only diagnostic: lists only matching chonhaviet properties visible to the configured
// service account. It never sends a sitemap or inspects a URL.
export async function diagnoseSearchConsoleAccess(config: SearchConsoleConfig, fetchImpl: FetchLike = fetch): Promise<SearchConsoleAccessDiagnosis> {
  const response = await authorizedRequest(GOOGLE_SITES_ENDPOINT, { method: 'GET' }, config, fetchImpl);
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    throw new SearchConsoleError('GOOGLE_RESPONSE', 'Google Search Console trả về danh sách property không hợp lệ.');
  }
  const entries = Array.isArray((payload as GoogleSitesResponse).siteEntry)
    ? (payload as GoogleSitesResponse).siteEntry!
    : [];
  return diagnoseSearchConsoleAccessEntries(config, entries);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

export function normalizeUrlInspectionEvidence(payload: Record<string, unknown>): UrlInspectionEvidence {
  const result = payload.inspectionResult;
  const indexStatus = result && typeof result === 'object'
    ? (result as Record<string, unknown>).indexStatusResult
    : null;
  const fields = indexStatus && typeof indexStatus === 'object' ? indexStatus as Record<string, unknown> : {};
  return {
    verdict: stringOrNull(fields.verdict),
    coverageState: stringOrNull(fields.coverageState),
    googleCanonical: stringOrNull(fields.googleCanonical),
    userCanonical: stringOrNull(fields.userCanonical),
    robotsState: stringOrNull(fields.robotsTxtState),
    lastCrawlAt: stringOrNull(fields.lastCrawlTime),
    raw: payload,
  };
}

export async function inspectSearchConsoleUrl(config: SearchConsoleConfig, inspectionUrl: string, fetchImpl: FetchLike = fetch): Promise<UrlInspectionEvidence> {
  const parsed = new URL(inspectionUrl);
  if (parsed.origin !== SEARCH_CONSOLE_CANONICAL_ORIGIN || parsed.search || parsed.hash) {
    throw new SearchConsoleError('GOOGLE_CONFIG_INVALID', 'Chỉ được kiểm tra URL canonical công khai trên https://chonhaviet.com.');
  }
  const response = await authorizedRequest(GOOGLE_INSPECTION_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ inspectionUrl, siteUrl: config.siteUrl, languageCode: 'vi-VN' }),
  }, config, fetchImpl);
  const payload = await response.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    throw new SearchConsoleError('GOOGLE_RESPONSE', 'Google Search Console trả về dữ liệu URL Inspection không hợp lệ.');
  }
  return normalizeUrlInspectionEvidence(payload as Record<string, unknown>);
}
