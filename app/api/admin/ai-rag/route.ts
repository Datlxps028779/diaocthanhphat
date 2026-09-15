import { NextRequest, NextResponse } from 'next/server';
import { adminClient, requireOwner } from '@/lib/server/requireAdmin';

export const runtime = 'nodejs';

const REFRESHABLE_SOURCES = new Set([
  'properties',
  'news',
  'property_types',
  'news_categories',
  'neighborhoods',
  'areas',
  'price_stats',
  'managed_pages',
  'ai_chat_knowledge',
]);

export async function POST(req: NextRequest) {
  const auth = await requireOwner(req);
  if (!auth.ok) return NextResponse.json({ error: auth.msg }, { status: auth.status });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Payload không hợp lệ.', code: 'INVALID_BODY' }, { status: 400 });
  }
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return NextResponse.json({ error: 'Payload không hợp lệ.', code: 'INVALID_BODY' }, { status: 400 });
  }

  const keys = Object.keys(body);
  if (keys.some(key => key !== 'target')) {
    return NextResponse.json({ error: 'Payload không hợp lệ.', code: 'INVALID_BODY' }, { status: 400 });
  }
  const hasTarget = Object.prototype.hasOwnProperty.call(body, 'target');
  const targetValue = (body as { target?: unknown }).target;
  if (hasTarget && (typeof targetValue !== 'string' || !REFRESHABLE_SOURCES.has(targetValue))) {
    return NextResponse.json({ error: 'Nguồn RAG không hợp lệ.', code: 'INVALID_TARGET' }, { status: 400 });
  }
  const target = hasTarget ? targetValue : null;

  const client = adminClient();
  if (!client) {
    return NextResponse.json({ error: 'Chưa cấu hình quyền đồng bộ RAG trên server.', code: 'SERVER_CONFIG' }, { status: 503 });
  }

  const { data, error } = await client.rpc('refresh_rag_index', target ? { target } : {});
  if (error) {
    console.error('[ai-rag] refresh failed:', error.message);
    return NextResponse.json({ error: 'Không đồng bộ được dữ liệu RAG.', code: 'REFRESH_FAILED' }, { status: 503 });
  }

  return NextResponse.json({ ok: true, target, chunkCount: (data as number) ?? 0 });
}
