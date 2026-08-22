import { supabase } from '../supabase';

export type SearchVisibilityErrorCode = 'CANONICAL_POLICY' | 'CANONICAL_CONSTRAINT' | 'SOURCE_READ' | 'AUDIT_WRITE' | 'RUN_CREATE' | 'RUN_FINALIZE' | 'SERVER_CONFIG' | 'UNKNOWN';

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

// Chỉ đồng bộ dữ liệu đủ điều kiện từ DB/canonical policy vào audit riêng. Không gọi
// Google, không gửi sitemap và không có hành vi yêu cầu Google index URL.
export async function syncSearchVisibilityAudit(): Promise<{ runId: string; summary: SearchVisibilityAuditSummary }> {
  const response = await fetch('/api/admin/search-visibility', { method: 'POST', headers: await authHeader() });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SearchVisibilityApiError(
      (json.code as SearchVisibilityErrorCode | undefined) ?? 'UNKNOWN',
      json.error ?? 'Không đồng bộ được audit URL.',
    );
  }
  return json as { runId: string; summary: SearchVisibilityAuditSummary };
}
