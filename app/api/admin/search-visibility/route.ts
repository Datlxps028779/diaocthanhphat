import { NextRequest, NextResponse } from 'next/server';
import { callerClient, requireOwner } from '@/lib/server/requireAdmin';
import {
  inspectSearchVisibilityBatch,
  submitSearchVisibilitySitemap,
  syncSearchVisibilityAudit,
  SearchVisibilitySyncError,
} from '@/lib/server/searchVisibilityService';
import { getSearchConsoleConfigurationState } from '@/lib/server/googleSearchConsole';

export const runtime = 'nodejs';

type VisibilityRow = {
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
};

type VisibilityRun = {
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
};

export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const client = callerClient(auth.token);
  const [urls, runs] = await Promise.all([
    client.from('search_visibility_urls')
      .select('source_key,entity_type,canonical_url,eligible,reason_code,reason_detail,evaluated_at,sitemap_status,inspection_status,google_verdict,google_coverage_state,google_canonical,user_canonical,google_robots_state,evidence_observed_at')
      .order('eligible', { ascending: false })
      .order('entity_type')
      .limit(500),
    client.from('search_visibility_runs')
      .select('id,run_type,status,requested_count,processed_count,succeeded_count,failed_count,error_summary,started_at,finished_at')
      .order('started_at', { ascending: false })
      .limit(12),
  ]);
  if (urls.error || runs.error) {
    return NextResponse.json({ error: 'Chưa có dữ liệu audit URL hoặc migration chưa được chạy.' }, { status: 503 });
  }

  const rows = (urls.data ?? []) as VisibilityRow[];
  const byReason: Record<string, number> = {};
  const byEntity: Record<string, { eligible: number; excluded: number }> = {};
  for (const row of rows) {
    byReason[row.reason_code] = (byReason[row.reason_code] ?? 0) + 1;
    const group = byEntity[row.entity_type] ?? { eligible: 0, excluded: 0 };
    if (row.eligible) group.eligible += 1;
    else group.excluded += 1;
    byEntity[row.entity_type] = group;
  }

  return NextResponse.json({
    searchConsole: {
      configurationState: getSearchConsoleConfigurationState(),
    },
    summary: {
      total: rows.length,
      eligible: rows.filter(row => row.eligible).length,
      excluded: rows.filter(row => !row.eligible).length,
      byReason,
      byEntity,
      googleEvidenceCount: rows.filter(row => row.evidence_observed_at).length,
    },
    urls: rows,
    runs: (runs.data ?? []) as VisibilityRun[],
  });
}

type SearchVisibilityAction = 'sync' | 'submit_sitemap' | 'inspect_batch';

function actionFromRequest(body: unknown): SearchVisibilityAction | null {
  if (!body || typeof body !== 'object') return 'sync';
  const action = (body as { action?: unknown }).action;
  if (action === undefined) return 'sync';
  return action === 'sync' || action === 'submit_sitemap' || action === 'inspect_batch' ? action : null;
}

export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const body = await req.json().catch(() => ({}));
  const action = actionFromRequest(body);
  if (!action) return NextResponse.json({ error: 'Thao tác Search Visibility không hợp lệ.', code: 'UNKNOWN' }, { status: 400 });

  try {
    const result = action === 'sync'
      ? await syncSearchVisibilityAudit(auth.userId)
      : action === 'submit_sitemap'
        ? await submitSearchVisibilitySitemap(auth.userId)
        : await inspectSearchVisibilityBatch(auth.userId);
    return NextResponse.json({ ok: true, action, ...result });
  } catch (error) {
    console.error(`[search-visibility] ${action} thất bại:`, error instanceof Error ? error.message : error);
    if (error instanceof SearchVisibilitySyncError) {
      return NextResponse.json({ error: error.message, code: error.code }, { status: 503 });
    }
    return NextResponse.json({ error: 'Không hoàn tất được thao tác Search Visibility. Kiểm tra cấu hình server rồi thử lại.', code: 'UNKNOWN' }, { status: 503 });
  }
}
