import { useState, useEffect } from 'react';
import { BrainCircuit, RefreshCw, Search, ChevronRight, ExternalLink, AlertCircle, CheckCircle, Database } from 'lucide-react';
import type { RagChunk, RagMatch, RagSourceTable } from '../../../lib/supabase';
import {
  adminRefreshRagIndex, adminGetRagStats, adminGetRagRuns, adminGetRagChunks, testRagRetrieval,
  type RagSourceStat,
} from '../../../lib/api';
import type { RagIndexRun } from '../../../lib/supabase';

// Console RAG / Tri thức AI: soi + đồng bộ kho chunk sinh TỪ DỮ LIỆU THẬT, và test
// retrieval. Persona/guardrail vẫn ở tab "Đào tạo AI" — ở đây chỉ lo tầng dữ liệu.

const SOURCE_LABELS: Record<RagSourceTable, string> = {
  properties: 'Bất động sản',
  news: 'Tin tức',
  neighborhoods: 'Khu dân cư',
  areas: 'Khu vực',
  price_stats: 'Dữ liệu giá',
  ai_chat_knowledge: 'Tri thức Q&A',
  admin_docs: 'Tài liệu admin',
};
const SOURCE_ORDER: RagSourceTable[] = ['properties', 'news', 'neighborhoods', 'areas', 'price_stats', 'ai_chat_knowledge', 'admin_docs'];

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function AiRagTab() {
  const [stats, setStats] = useState<RagSourceStat[]>([]);
  const [runs, setRuns] = useState<RagIndexRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [reindexing, setReindexing] = useState<string | null>(null); // 'all' | source_table
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Xem chunk
  const [chunkSource, setChunkSource] = useState<RagSourceTable | ''>('');
  const [chunks, setChunks] = useState<RagChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [openChunk, setOpenChunk] = useState<string | null>(null);

  // Test retrieval
  const [query, setQuery] = useState('');
  const [matches, setMatches] = useState<RagMatch[] | null>(null);
  const [testing, setTesting] = useState(false);

  const load = () => Promise.all([adminGetRagStats(), adminGetRagRuns(8)])
    .then(([s, r]) => { setStats(s); setRuns(r); setLoading(false); });
  useEffect(() => { load(); }, []);

  const loadChunks = (source: RagSourceTable | '') => {
    setChunksLoading(true);
    setOpenChunk(null);
    adminGetRagChunks(source || undefined, 50).then(c => { setChunks(c); setChunksLoading(false); });
  };
  useEffect(() => { loadChunks(chunkSource); }, [chunkSource]);

  const reindex = async (target?: RagSourceTable) => {
    setReindexing(target ?? 'all');
    setMsg(null);
    try {
      const n = await adminRefreshRagIndex(target);
      setMsg({ kind: 'ok', text: `Đã đồng bộ ${target ? SOURCE_LABELS[target] : 'toàn bộ nguồn'}: ${n} chunk.` });
      await load();
      loadChunks(chunkSource);
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    }
    setReindexing(null);
  };

  const runTest = async () => {
    if (!query.trim()) return;
    setTesting(true);
    setMatches(null);
    try {
      setMatches(await testRagRetrieval(query.trim(), 8));
    } catch (e) {
      setMsg({ kind: 'err', text: (e as Error).message });
    }
    setTesting(false);
  };

  const totalChunks = stats.reduce((sum, s) => sum + s.chunk_count, 0);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2"><BrainCircuit className="w-5 h-5 text-red-600" />RAG / Tri thức AI</h2>
          <p className="text-gray-500 text-sm mt-1">Kho tri thức AI đọc được — sinh tự động từ dữ liệu thật (BĐS, tin tức, khu dân cư, giá…). Đồng bộ lại mỗi khi nội dung đổi.</p>
        </div>
        <button onClick={() => reindex()} disabled={reindexing !== null}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors disabled:opacity-40 flex-shrink-0">
          <RefreshCw className={`w-4 h-4 ${reindexing === 'all' ? 'animate-spin' : ''}`} />Đồng bộ tất cả
        </button>
      </div>

      {msg && (
        <div className={`flex items-start gap-2 text-sm rounded-xl p-3 ${msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
          {msg.kind === 'ok' ? <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> : <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
          <span>{msg.text}</span>
        </div>
      )}

      {/* Nguồn dữ liệu AI */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Database className="w-4 h-4 text-gray-500" />
          <h3 className="font-bold text-gray-800 text-sm">Nguồn dữ liệu ({totalChunks} chunk)</h3>
        </div>
        <div className="space-y-2">
          {SOURCE_ORDER.map(src => {
            const stat = stats.find(s => s.source_table === src);
            return (
              <div key={src} className="flex items-center gap-3 border border-gray-100 rounded-xl px-4 py-3">
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-gray-900 text-sm">{SOURCE_LABELS[src]}</span>
                  <p className="text-gray-400 text-xs mt-0.5">
                    {stat ? `${stat.chunk_count} chunk · cập nhật ${fmtDate(stat.last_indexed_at)}` : 'Chưa có chunk'}
                  </p>
                </div>
                <button onClick={() => reindex(src)} disabled={reindexing !== null}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 border border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0">
                  <RefreshCw className={`w-3 h-3 ${reindexing === src ? 'animate-spin' : ''}`} />Đồng bộ
                </button>
              </div>
            );
          })}
        </div>
        {runs.length > 0 && (
          <p className="text-[11px] text-gray-400 mt-3">Lần đồng bộ gần nhất: {fmtDate(runs[0].finished_at)} · {runs[0].status === 'ok' ? 'thành công' : 'lỗi'}</p>
        )}
      </div>

      {/* Test retrieval */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Search className="w-4 h-4 text-gray-500" />
          <h3 className="font-bold text-gray-800 text-sm">Test truy xuất</h3>
        </div>
        <p className="text-gray-500 text-xs mb-3">Nhập câu hỏi như khách hỏi — xem AI kéo lên chunk nào và điểm liên quan (chưa gọi Claude, chỉ soi retrieval).</p>
        <div className="flex gap-2">
          <input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => e.key === 'Enter' && runTest()}
            placeholder="vd: Phú Hồng Thịnh 8 nằm ở đâu, giá bao nhiêu?"
            className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          <button onClick={runTest} disabled={testing || !query.trim()}
            className="flex items-center gap-2 bg-gray-900 hover:bg-black text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40 flex-shrink-0">
            {testing ? <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Search className="w-4 h-4" />}Tìm
          </button>
        </div>
        {matches && (
          <div className="mt-4 space-y-2">
            {matches.length === 0 ? (
              <p className="text-sm text-gray-500 italic">Không tìm thấy chunk liên quan. Câu này AI sẽ nói chưa đủ dữ liệu + mời để lại SĐT.</p>
            ) : matches.map((m, i) => (
              <div key={m.chunk_id} className="border border-gray-100 rounded-xl p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-bold bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">#{i + 1}</span>
                  <span className="text-[10px] font-semibold bg-red-50 text-red-600 px-1.5 py-0.5 rounded">{SOURCE_LABELS[m.source_table] ?? m.source_table}</span>
                  <span className="text-xs font-bold text-gray-800 truncate flex-1">{m.title}</span>
                  <span className="text-[10px] text-gray-400 flex-shrink-0">score {m.score.toFixed(3)}</span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 whitespace-pre-line">{m.content}</p>
                {m.source_url && <a href={m.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:underline mt-1">{m.source_url}<ExternalLink className="w-3 h-3" /></a>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Xem chunk */}
      <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="font-bold text-gray-800 text-sm">Xem chunk</h3>
          <select value={chunkSource} onChange={e => setChunkSource(e.target.value as RagSourceTable | '')}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-red-400">
            <option value="">Tất cả nguồn</option>
            {SOURCE_ORDER.map(src => <option key={src} value={src}>{SOURCE_LABELS[src]}</option>)}
          </select>
        </div>
        {chunksLoading ? (
          <div className="py-8 text-center"><div className="inline-block w-6 h-6 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" /></div>
        ) : chunks.length === 0 ? (
          <p className="text-sm text-gray-500 italic py-4 text-center">Chưa có chunk. Bấm "Đồng bộ" để dựng từ dữ liệu thật.</p>
        ) : (
          <div className="space-y-1.5">
            {chunks.map(c => (
              <div key={c.id} className="border border-gray-100 rounded-xl">
                <button onClick={() => setOpenChunk(openChunk === c.id ? null : c.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
                  <ChevronRight className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${openChunk === c.id ? 'rotate-90' : ''}`} />
                  <span className="text-[10px] font-semibold bg-red-50 text-red-600 px-1.5 py-0.5 rounded flex-shrink-0">{SOURCE_LABELS[c.source_table] ?? c.source_table}</span>
                  <span className="text-xs font-semibold text-gray-800 truncate flex-1">{c.title}</span>
                </button>
                {openChunk === c.id && (
                  <div className="px-3 pb-3 pt-1 border-t border-gray-100">
                    <p className="text-xs text-gray-600 whitespace-pre-line">{c.content}</p>
                    {c.source_url && <a href={c.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[11px] text-red-600 hover:underline mt-2">{c.source_url}<ExternalLink className="w-3 h-3" /></a>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
