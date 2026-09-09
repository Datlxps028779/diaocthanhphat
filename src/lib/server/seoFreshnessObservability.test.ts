import { describe, expect, it } from 'vitest';
import {
  buildFreshnessQueueResponse,
  emptyFreshnessCounts,
  getFreshnessQueueObservability,
  sanitizeFreshnessError,
} from './seoFreshnessObservability';

describe('SEO freshness observability', () => {
  it('fills missing status counts and selects oldest pending/next retry deterministically', () => {
    const result = buildFreshnessQueueResponse({
      counts: { succeeded: 24 },
      pending: [{ status: 'pending', path: '/b', created_at: '2026-09-09T09:02:00Z', attempt_count: 0, max_attempts: 5, next_attempt_at: '2026-09-09T09:02:00Z' }, { status: 'pending', path: '/a', created_at: '2026-09-09T09:01:00Z', attempt_count: 0, max_attempts: 5, next_attempt_at: '2026-09-09T09:01:00Z' }],
      retryable: [{ status: 'failed', path: '/retry-later', created_at: '2026-09-09T09:00:00Z', attempt_count: 1, max_attempts: 5, next_attempt_at: '2026-09-09T10:00:00Z' }, { status: 'failed', path: '/retry-now', created_at: '2026-09-09T09:05:00Z', attempt_count: 1, max_attempts: 5, next_attempt_at: '2026-09-09T09:30:00Z' }],
    });

    expect(result.summary.counts).toEqual({ ...emptyFreshnessCounts(), succeeded: 24 });
    expect(result.summary.total).toBe(24);
    expect(result.summary.oldestPending?.path).toBe('/a');
    expect(result.summary.nextRetry?.path).toBe('/retry-now');
  });

  it('redacts credentials and bounds operational errors', () => {
    const value = sanitizeFreshnessError('Authorization: Bearer abc123 service_role_key=super-secret; ' + 'x'.repeat(800));

    expect(value).not.toContain('abc123');
    expect(value).not.toContain('super-secret');
    expect(value).toHaveLength(500);
  });

  it('limits and sanitizes failed/dead-letter alerts', () => {
    const alerts = Array.from({ length: 25 }, (_, index) => ({
      status: index % 2 ? 'failed' : 'dead_letter',
      path: `/path-${index}`,
      created_at: `2026-09-09T09:${String(index).padStart(2, '0')}:00Z`,
      attempt_count: 5,
      max_attempts: 5,
      next_attempt_at: null,
      last_error: `secret=hidden-${index}`,
    }));

    const result = buildFreshnessQueueResponse({ alerts });

    expect(result.alerts).toHaveLength(20);
    expect(result.alerts[0].last_error).toBe('secret: [redacted]');
  });

  it('reads only server-side queue fields and returns a narrow summary', async () => {
    const rows = [
      { status: 'pending', path: '/pending', attempt_count: 0, max_attempts: 5, next_attempt_at: '2026-09-09T09:00:00Z', last_error: null, created_at: '2026-09-09T09:00:00Z', processed_at: null },
      { status: 'failed', path: '/failed', attempt_count: 2, max_attempts: 5, next_attempt_at: '2026-09-09T09:10:00Z', last_error: 'timeout', created_at: '2026-09-09T08:00:00Z', processed_at: null },
    ];
    const calls: Array<{ table: string; select: string }> = [];
    const client = {
      from(table: string) {
        return {
          select(select: string) {
            calls.push({ table, select });
            const state = { status: '', in: [] as string[], order: '', limit: 0 };
            const builder = {
              eq(_field: string, value: string) { state.status = value; return builder; },
              in(_field: string, values: string[]) { state.in = values; return builder; },
              not() { return builder; },
              order(field: string) { state.order = field; return builder; },
              limit(value: number) { state.limit = value; return Promise.resolve({ data: state.status === 'pending' ? [rows[0]] : state.status === 'failed' ? [rows[1]] : state.in.length ? [rows[1]] : [{ processed_at: null }], error: null, count: select === 'id' ? (state.status === 'succeeded' ? 24 : 0) : null }); },
            };
            return builder;
          },
        };
      },
    };

    const result = await getFreshnessQueueObservability(client as never);

    expect(result.summary.oldestPending?.path).toBe('/pending');
    expect(result.alerts[0].path).toBe('/failed');
    expect(calls.every(call => !call.select.includes('dedupe_key'))).toBe(true);
  });
});
