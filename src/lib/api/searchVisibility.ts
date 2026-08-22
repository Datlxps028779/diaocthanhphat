import { supabase } from '../supabase';

export type SearchVisibilityErrorCode = 'CANONICAL_POLICY' | 'CANONICAL_CONSTRAINT' | 'SOURCE_READ' | 'AUDIT_WRITE' | 'RUN_CREATE' | 'RUN_FINALIZE' | 'SERVER_CONFIG' | 'GOOGLE_NOT_CONFIGURED' | 'GOOGLE_CONFIG_INVALID' | 'GOOGLE_AUTH' | 'GOOGLE_REQUEST' | 'GOOGLE_RESPONSE' | 'GOOGLE_DEFERRED' | 'UNKNOWN';

export class SearchVisibilityApiError extends Error {
  constructor(readonly code: SearchVisibilityErrorCode, message: string) {
    super(message);
    this.name = 'SearchVisibilityApiError';
  }
}

export interface SearchVisibilityUrlAudit {
  source_key: string;
  entity_type: string;
  canonical_url: string | null;
  eligible: boolean;
  reason_code: string;
  reason_detail: string | null;
  evaluated_at: string;
  sitemap_status: string;
  inspection_status: string;
  google_verdict: string | null;
  google_coverage_state: string | null;
  google_canonical: string | null;
  user_canonical: string | null;
  google_robots_state: string | null;
  evidence_observed_at: string | null;
}

export interface SearchVisibilityAuditSummary {
  total: number;
  eligible: number;
  excluded: number;
  byReason: Record<string, number>;
  byEntity: Record<string, { eligible: number; excluded: number }>;
  googleEvidenceCount: number;
}

export interface SearchVisibilityRun {
  id: string;
  run_type: string;
  status: string;
  requested_count: number;
  processed_count: number;
  succeeded_count: number;
  failed_count: number;
  error_summary: string | null;
  started_at: string;
  finished_at: string | null;
}

export interface SearchVisibilityAuditResponse {
  searchConsole: { configurationState: 'not_configured' | 'configured' | 'invalid' };
  summary: SearchVisibilityAuditSummary;
  urls: SearchVisibilityUrlAudit[];
  runs: SearchVisibilityRun[];
}

async function authHeader(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ''}`,
    'Content-Type': 'application/json',
  };
}

async function readResponse(response: Response): Promise<SearchVisibilityAuditResponse> {
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SearchVisibilityApiError(
      (json.code as SearchVisibilityErrorCode | undefined) ?? 'UNKNOWN',
      json.error ?? 'Không tải được audit URL.',
    );
  }
  return json as SearchVisibilityAuditResponse;
}

export async function getSearchVisibilityAudit(): Promise<SearchVisibilityAuditResponse> {
  return readResponse(await fetch('/api/admin/search-visibility', { headers: await authHeader() }));
}

export type SearchVisibilityAction = 'sync' | 'diagnose_access' | 'submit_sitemap' | 'inspect_batch';

export interface SearchConsoleAccessDiagnosis {
  serviceAccountEmail: string;
  canonicalProperty: { found: boolean; permissionLevel: string | null; sufficient: boolean };
  domainProperty: { found: boolean; permissionLevel: string | null };
  alternateProperties: Array<{ siteUrl: string; permissionLevel: string | null }>;
  status: 'ACCESS_CONFIRMED' | 'CANONICAL_PROPERTY_MISSING' | 'CANONICAL_PERMISSION_INSUFFICIENT';
  message: string;
}

export interface SearchVisibilityActionResult {
  runId: string;
  requestedCount?: number;
  processedCount?: number;
  succeededCount?: number;
  failedCount?: number;
  summary?: SearchVisibilityAuditSummary;
}

async function runSearchVisibilityAction<T extends SearchVisibilityActionResult | SearchConsoleAccessDiagnosis>(action: SearchVisibilityAction): Promise<T> {
  const response = await fetch('/api/admin/search-visibility', {
    method: 'POST',
    headers: await authHeader(),
    body: JSON.stringify({ action }),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SearchVisibilityApiError(
      (json.code as SearchVisibilityErrorCode | undefined) ?? 'UNKNOWN',
      json.error ?? 'Không hoàn tất được thao tác Search Visibility.',
    );
  }
  return json as T;
}

// Chỉ đồng bộ dữ liệu đủ điều kiện từ DB/canonical policy vào audit riêng.
export async function syncSearchVisibilityAudit(): Promise<SearchVisibilityActionResult> {
  return runSearchVisibilityAction('sync');
}

// Diagnostic chỉ đọc property matching của service account hiện cấu hình; không gửi sitemap.
export async function diagnoseSearchConsoleAccess(): Promise<SearchConsoleAccessDiagnosis> {
  return runSearchVisibilityAction<SearchConsoleAccessDiagnosis>('diagnose_access');
}

// Search Console chỉ chạy sau thao tác owner rõ ràng; API trả xác nhận nhận sitemap,
// không phải lời hứa Google sẽ crawl hoặc index từng URL.
export async function submitSearchVisibilitySitemap(): Promise<SearchVisibilityActionResult> {
  return runSearchVisibilityAction('submit_sitemap');
}

// Google URL Inspection là batch tối đa năm URL eligible, không phải live URL test.
export async function inspectSearchVisibilityBatch(): Promise<SearchVisibilityActionResult> {
  return runSearchVisibilityAction('inspect_batch');
}
