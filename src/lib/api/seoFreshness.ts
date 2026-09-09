import { supabase } from '../supabase';
import type { FreshnessQueueResponse } from '../server/seoFreshnessObservability';

export type SeoFreshnessApiErrorCode = 'SERVER_CONFIG' | 'QUEUE_READ' | 'UNKNOWN';

export class SeoFreshnessApiError extends Error {
  constructor(readonly code: SeoFreshnessApiErrorCode, message: string) {
    super(message);
    this.name = 'SeoFreshnessApiError';
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const { data: { session } } = await supabase.auth.getSession();
  return {
    Authorization: `Bearer ${session?.access_token ?? ''}`,
    'Content-Type': 'application/json',
  };
}

export async function getSeoFreshnessStatus(): Promise<FreshnessQueueResponse> {
  const response = await fetch('/api/admin/seo-freshness', { headers: await authHeaders() });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new SeoFreshnessApiError(
      (json.code as SeoFreshnessApiErrorCode | undefined) ?? 'UNKNOWN',
      json.error ?? 'Không tải được trạng thái freshness queue.',
    );
  }
  return json as FreshnessQueueResponse;
}
