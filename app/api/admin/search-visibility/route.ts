import { NextRequest, NextResponse } from 'next/server';
import { callerClient, requireOwner } from '@/lib/server/requireAdmin';
import { syncSearchVisibilityAudit } from '@/lib/server/searchVisibilityService';

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

// This action only evaluates existing source records and writes the private audit
// registry. It never calls Google, submits a sitemap, or requests URL indexing.
export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  try {
    const result = await syncSearchVisibilityAudit(auth.userId);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[search-visibility] đồng bộ audit thất bại:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Không đồng bộ được audit URL.' }, { status: 503 });
  }
}
