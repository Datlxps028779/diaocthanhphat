import type { SupabaseClient } from '@supabase/supabase-js';

export const FRESHNESS_STATUSES = ['pending', 'processing', 'succeeded', 'failed', 'dead_letter'] as const;

export type FreshnessStatus = (typeof FRESHNESS_STATUSES)[number];

export type FreshnessJobObservation = {
  status: FreshnessStatus;
  path: string;
  attempt_count: number;
  max_attempts: number;
  next_attempt_at: string | null;
  last_error: string | null;
  created_at: string;
  processed_at: string | null;
};

export type FreshnessQueueJob = Omit<FreshnessJobObservation, 'last_error'> & { last_error: string | null };

export type FreshnessQueueCounts = Record<FreshnessStatus, number>;

export type FreshnessQueueResponse = {
  summary: {
    counts: FreshnessQueueCounts;
    total: number;
    oldestPending: FreshnessQueueJob | null;
    nextRetry: FreshnessQueueJob | null;
    latestSucceededAt: string | null;
  };
  alerts: FreshnessQueueJob[];
  generatedAt: string;
};

export type FreshnessDatabase = Pick<SupabaseClient, 'from'>;

type QueryResult<T> = {
  data: T[] | null;
  error: { message: string } | null;
  count?: number | null;
};

const JOB_FIELDS = 'status,path,attempt_count,max_attempts,next_attempt_at,last_error,created_at,processed_at';
const MAX_ERROR_LENGTH = 500;
const MAX_ALERTS = 20;

function asStatus(value: unknown): FreshnessStatus | null {
  return typeof value === 'string' && (FRESHNESS_STATUSES as readonly string[]).includes(value)
    ? value as FreshnessStatus
    : null;
}

function asJob(value: unknown): FreshnessJobObservation | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const status = asStatus(row.status);
  if (!status || typeof row.path !== 'string' || typeof row.created_at !== 'string') return null;
  return {
    status,
    path: row.path,
    attempt_count: typeof row.attempt_count === 'number' ? row.attempt_count : 0,
    max_attempts: typeof row.max_attempts === 'number' ? row.max_attempts : 0,
    next_attempt_at: typeof row.next_attempt_at === 'string' ? row.next_attempt_at : null,
    last_error: typeof row.last_error === 'string' ? row.last_error : null,
    created_at: row.created_at,
    processed_at: typeof row.processed_at === 'string' ? row.processed_at : null,
  };
}

export function sanitizeFreshnessError(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  let text = value instanceof Error ? value.message : String(value);
  text = text
    .replace(/Bearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/((?:authorization|cookie|token|secret|password|private[_ -]?key|service[_ -]?role[_ -]?key)[\w -]*)\s*[:=]\s*[^\s,;]+/gi, '$1: [redacted]')
    .trim();
  return text ? text.slice(0, MAX_ERROR_LENGTH) : null;
}

export function toPublicFreshnessJob(value: unknown): FreshnessQueueJob | null {
  const job = asJob(value);
  if (!job) return null;
  return { ...job, last_error: sanitizeFreshnessError(job.last_error) };
}

export function emptyFreshnessCounts(): FreshnessQueueCounts {
  return { pending: 0, processing: 0, succeeded: 0, failed: 0, dead_letter: 0 };
}

function timestamp(value: string | null): number {
  if (!value) return Number.POSITIVE_INFINITY;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
}

function oldestFirst(a: FreshnessQueueJob, b: FreshnessQueueJob): number {
  return timestamp(a.created_at) - timestamp(b.created_at) || a.path.localeCompare(b.path);
}

function retryFirst(a: FreshnessQueueJob, b: FreshnessQueueJob): number {
  return timestamp(a.next_attempt_at) - timestamp(b.next_attempt_at) || oldestFirst(a, b);
}

export function buildFreshnessQueueResponse(input: {
  counts?: Partial<FreshnessQueueCounts>;
  pending?: unknown[];
  retryable?: unknown[];
  alerts?: unknown[];
  latestSucceededAt?: string | null;
  generatedAt?: string;
}): FreshnessQueueResponse {
  const counts = { ...emptyFreshnessCounts(), ...input.counts };
  const pending = input.pending?.map(toPublicFreshnessJob).filter((job): job is FreshnessQueueJob => !!job).sort(oldestFirst) ?? [];
  const retryable = input.retryable?.map(toPublicFreshnessJob).filter((job): job is FreshnessQueueJob => !!job).sort(retryFirst) ?? [];
  const alerts = input.alerts?.map(toPublicFreshnessJob).filter((job): job is FreshnessQueueJob => !!job).slice(0, MAX_ALERTS) ?? [];
  return {
    summary: {
      counts,
      total: FRESHNESS_STATUSES.reduce((sum, status) => sum + (counts[status] ?? 0), 0),
      oldestPending: pending[0] ?? null,
      nextRetry: retryable[0] ?? null,
      latestSucceededAt: input.latestSucceededAt ?? null,
    },
    alerts,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
  };
}

async function readRows(client: FreshnessDatabase, status: FreshnessStatus, limit: number): Promise<FreshnessJobObservation[]> {
  const result = await client.from('seo_freshness_jobs')
    .select(JOB_FIELDS)
    .eq('status', status)
    .order(status === 'pending' ? 'created_at' : 'next_attempt_at', { ascending: true })
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(limit) as QueryResult<FreshnessJobObservation>;
  if (result.error) throw new Error(result.error.message);
  return result.data ?? [];
}

export async function getFreshnessQueueObservability(client: FreshnessDatabase): Promise<FreshnessQueueResponse> {
  const countResults = await Promise.all(FRESHNESS_STATUSES.map(async status => {
    const result = await client.from('seo_freshness_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', status) as QueryResult<never>;
    if (result.error) throw new Error(result.error.message);
    return [status, result.count ?? 0] as const;
  }));
  const counts = Object.fromEntries(countResults) as FreshnessQueueCounts;
  const [pending, retryable, alerts, latest] = await Promise.all([
    readRows(client, 'pending', 1),
    readRows(client, 'failed', 1),
    client.from('seo_freshness_jobs')
      .select(JOB_FIELDS)
      .in('status', ['failed', 'dead_letter'])
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(MAX_ALERTS) as unknown as Promise<QueryResult<FreshnessJobObservation>>,
    client.from('seo_freshness_jobs')
      .select('processed_at')
      .eq('status', 'succeeded')
      .not('processed_at', 'is', null)
      .order('processed_at', { ascending: false })
      .limit(1) as unknown as Promise<QueryResult<{ processed_at: string | null }>>,
  ]);
  if (alerts.error || latest.error) throw new Error(alerts.error?.message ?? latest.error?.message ?? 'Không đọc được freshness queue.');
  return buildFreshnessQueueResponse({
    counts,
    pending,
    retryable,
    alerts: alerts.data ?? [],
    latestSucceededAt: latest.data?.[0]?.processed_at ?? null,
  });
}
