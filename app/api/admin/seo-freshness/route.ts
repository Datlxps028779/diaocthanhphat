import { NextRequest, NextResponse } from 'next/server';
import { adminClient, requireOwner } from '@/lib/server/requireAdmin';
import { getFreshnessQueueObservability, sanitizeFreshnessError } from '@/lib/server/seoFreshnessObservability';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  const client = adminClient();
  if (!client) {
    return NextResponse.json({ error: 'Chưa cấu hình quyền đọc freshness queue trên server.', code: 'SERVER_CONFIG' }, { status: 503 });
  }

  try {
    const result = await getFreshnessQueueObservability(client);
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('[seo-freshness] observability read failed:', sanitizeFreshnessError(error) ?? 'unknown error');
    return NextResponse.json({ error: 'Không tải được trạng thái freshness queue.', code: 'QUEUE_READ' }, { status: 503 });
  }
}
