import { supabase, type RagChunk, type RagIndexRun, type RagMatch, type RagSourceTable } from '../supabase';

export const RAG_DEFERRED_MESSAGE = 'RAG đang tạm hoãn theo scope hiện tại.';

/**
 * Browser code intentionally has no execution path to refresh_rag_index.
 * Reconnect this adapter to a server boundary when the RAG slice is approved;
 * do not restore a direct browser RPC call.
 */
export function isRagRefreshDeferred(): boolean {
  return true;
}

// ─── RAG (Tri thức AI) ──────────────────────────────────────────────────────
// Kho chunk sinh TỪ DỮ LIỆU THẬT qua RPC refresh_rag_index (thuần SQL, không LLM).
// Bao gồm Product, News, taxonomy danh mục và nội dung CMS public.
// Chat retrieve qua match_rag_chunks. Đọc/ghi đều guard RLS/is_admin ở DB.

// Admin: reindex toàn bộ (target=null) hoặc 1 nguồn. Trả số chunk đã dựng.
export async function adminRefreshRagIndex(target?: RagSourceTable): Promise<number> {
  // Keep the façade and its target argument for callers that will later be
  // rewired to a server boundary. Never reintroduce a browser RPC here.
  void target;
  return 0;
}

// Admin: thống kê chunk theo nguồn (đếm + lần index gần nhất) để hiển thị bảng trạng thái.
export type RagSourceStat = { source_table: string; chunk_count: number; last_indexed_at: string | null };
export async function adminGetRagStats(): Promise<RagSourceStat[]> {
  const { data, error } = await supabase.from('rag_chunks').select('source_table, indexed_at').limit(20000);
  if (error) throw error;
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
  const { data, error } = await supabase
    .from('rag_index_runs')
    .select('*')
    .order('finished_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as RagIndexRun[];
}

// Admin: xem chunk (lọc theo nguồn) để soi nội dung AI đọc được.
export async function adminGetRagChunks(sourceTable?: RagSourceTable, limit = 50): Promise<RagChunk[]> {
  let q = supabase.from('rag_chunks').select('*').order('indexed_at', { ascending: false }).limit(limit);
  if (sourceTable) q = q.eq('source_table', sourceTable);
  const { data, error } = await q;
  if (error) throw error;
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
