import { supabase, type RagChunk, type RagIndexRun, type RagMatch, type RagSourceTable } from '../supabase';

// ─── RAG (Tri thức AI) ──────────────────────────────────────────────────────
// Kho chunk sinh TỪ DỮ LIỆU THẬT qua RPC refresh_rag_index (thuần SQL, không LLM).
// Chat retrieve qua match_rag_chunks. Đọc/ghi đều guard RLS/is_admin ở DB.

// Admin: reindex toàn bộ (target=null) hoặc 1 nguồn qua server owner-MFA boundary.
export async function adminRefreshRagIndex(target?: RagSourceTable): Promise<number> {
  const { data: { session } } = await supabase.auth.getSession();
  const response = await fetch('/api/admin/ai-rag', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${session?.access_token ?? ''}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(target ? { target } : {}),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(json.error ?? 'Không đồng bộ được dữ liệu RAG.');
  return (json.chunkCount as number) ?? 0;
}

// Admin: thống kê chunk theo nguồn (đếm + lần index gần nhất) để hiển thị bảng trạng thái.
export type RagSourceStat = { source_table: string; chunk_count: number; last_indexed_at: string | null };
export async function adminGetRagStats(): Promise<RagSourceStat[]> {
  const { data } = await supabase.from('rag_chunks').select('source_table, indexed_at').limit(20000);
  const rows = (data ?? []) as { source_table: string; indexed_at: string | null }[];
  const map = new Map<string, RagSourceStat>();
  for (const r of rows) {
    const cur = map.get(r.source_table) ?? { source_table: r.source_table, chunk_count: 0, last_indexed_at: null };
    cur.chunk_count += 1;
    if (r.indexed_at && (!cur.last_indexed_at || r.indexed_at > cur.last_indexed_at)) cur.last_indexed_at = r.indexed_at;
    map.set(r.source_table, cur);
  }
  return Array.from(map.values()).sort((a, b) => a.source_table.localeCompare(b.source_table));
}

// Admin: nhật ký reindex gần đây.
export async function adminGetRagRuns(limit = 10): Promise<RagIndexRun[]> {
  const { data } = await supabase
    .from('rag_index_runs')
    .select('*')
    .order('finished_at', { ascending: false })
    .limit(limit);
  return (data ?? []) as RagIndexRun[];
}

// Admin: xem chunk (lọc theo nguồn) để soi nội dung AI đọc được.
export async function adminGetRagChunks(sourceTable?: RagSourceTable, limit = 50): Promise<RagChunk[]> {
  let q = supabase.from('rag_chunks').select('*').order('indexed_at', { ascending: false }).limit(limit);
  if (sourceTable) q = q.eq('source_table', sourceTable);
  const { data } = await q;
  return (data ?? []) as RagChunk[];
}

// Test retrieval: nhập câu hỏi → xem chunk nào được kéo lên + score (không gọi Claude).
export async function testRagRetrieval(query: string, matchCount = 8): Promise<RagMatch[]> {
  const { data, error } = await supabase.rpc('match_rag_chunks', {
    query,
    match_count: matchCount,
    filter_source_types: null,
    filter_visibility: 'public',
  });
  if (error) throw error;
  return (data ?? []) as RagMatch[];
}
