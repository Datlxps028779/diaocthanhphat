import { useEffect, useMemo, useState } from 'react';
import { CheckCircle, MessageCircle, RefreshCw, Send, Trash2, UserPlus, XCircle } from 'lucide-react';
import type { ChatMessage, ChatSession } from '../../../lib/supabase';
import { assignChatSession, closeChatSession, deleteChatSessions, getChatMessages, getChatSessions, getTeamMembers, sendStaffChatMessage } from '../../../lib/api';
import { assigneesOf, memberLabel, type TeamMember } from '../../../lib/leadAssignment';
import { useAuth } from '../../../lib/auth';

type Filter = 'all' | 'new' | 'active' | 'attention' | 'closed' | 'spam';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'attention', label: 'Cần admin' },
  { key: 'new', label: 'Mới' },
  { key: 'active', label: 'Đang xử lý' },
  { key: 'closed', label: 'Đã đóng' },
  { key: 'spam', label: 'Nghi spam' },
];

// Heuristic client-side: phiên chưa có bất kỳ tín hiệu nghiêm túc nào — không tên,
// không SĐT, không lead, không mô tả nhu cầu, và chưa được tư vấn viên tiếp nhận.
function isLikelySpam(s: ChatSession): boolean {
  const noContact = !s.visitor_name?.trim() && !s.visitor_phone?.trim() && !s.lead_id;
  const noNeed = !s.need_summary?.trim();
  const notEngaged = s.status !== 'active' && !s.admin_attention && (s.chat_assignments?.length ?? 0) === 0;
  return noContact && noNeed && notEngaged;
}

function sessionTitle(session: ChatSession) {
  return session.visitor_name?.trim() || session.leads?.full_name || session.visitor_phone?.trim() || 'Khách từ AI Advisor';
}

function statusLabel(session: ChatSession) {
  if (session.admin_attention && session.status !== 'closed') return 'Cần admin';
  if (session.status === 'active') return 'Đang xử lý';
  if (session.status === 'closed') return 'Đã đóng';
  return 'Mới';
}

function senderLabel(m: ChatMessage) {
  if (m.sender === 'visitor') return 'Khách';
  if (m.sender === 'assistant') return 'Trợ lý AI';
  if (m.sender === 'staff') return 'Tư vấn viên';
  return 'Hệ thống';
}

export function ChatSessionsTab() {
  const { user } = useAuth();
  const [filter, setFilter] = useState<Filter>('all');
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const selected = useMemo(() => sessions.find(s => s.id === selectedId) ?? sessions[0] ?? null, [sessions, selectedId]);

  const loadSessions = async () => {
    setLoading(true); setError('');
    try {
      const rows = await getChatSessions(filter === 'spam' ? 'all' : filter);
      const visible = filter === 'spam' ? rows.filter(isLikelySpam) : rows;
      setSessions(visible);
      setSelectedIds(prev => new Set([...prev].filter(id => visible.some(r => r.id === id))));
      if (visible.length > 0 && !visible.some(r => r.id === selectedId)) setSelectedId(visible[0].id);
      if (visible.length === 0) setSelectedId(null);
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Không tải được phiên chat.');
    } finally { setLoading(false); }
  };

  useEffect(() => { loadSessions(); }, [filter]);
  useEffect(() => { getTeamMembers().then(setRoster).catch(() => setRoster([])); }, []);

  useEffect(() => {
    if (!selected?.id) { setMessages([]); return; }
    let alive = true;
    const loadMessages = async () => {
      try {
        const rows = await getChatMessages(selected.id);
        if (alive) setMessages(rows);
      } catch { if (alive) setMessages([]); }
    };
    loadMessages();
    const t = setInterval(loadMessages, 10_000);
    return () => { alive = false; clearInterval(t); };
  }, [selected?.id]);

  const assign = async (userId: string) => {
    if (!selected) return;
    setBusy(true);
    try {
      await assignChatSession(selected.id, userId, user?.id ?? null);
      await loadSessions();
    } finally { setBusy(false); }
  };

  const send = async () => {
    const text = message.trim();
    if (!selected || !user?.id || !text) return;
    setBusy(true);
    try {
      await sendStaffChatMessage(selected.id, text, user.id);
      setMessage('');
      setMessages(await getChatMessages(selected.id));
      await loadSessions();
    } finally { setBusy(false); }
  };

  const close = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await closeChatSession(selected.id);
      await loadSessions();
    } finally { setBusy(false); }
  };

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const allSelected = sessions.length > 0 && selectedIds.size === sessions.length;
  const toggleSelectAll = () => {
    setSelectedIds(allSelected ? new Set() : new Set(sessions.map(s => s.id)));
  };

  const deleteSelected = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`Xóa vĩnh viễn ${selectedIds.size} phiên chat đã chọn? Hành động này không thể hoàn tác.`)) return;
    setBusy(true); setError('');
    try {
      await deleteChatSessions([...selectedIds]);
      setSelectedIds(new Set());
      await loadSessions();
    } catch (e) {
      setError((e as { message?: string })?.message ?? 'Không xóa được phiên chat.');
    } finally { setBusy(false); }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[360px,1fr] gap-4 min-h-[calc(100vh-9rem)]">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[520px]">
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <h2 className="font-black text-gray-900 flex items-center gap-2"><MessageCircle className="w-4 h-4 text-red-600" />Phiên chat</h2>
              <p className="text-xs text-gray-500 mt-1">AI Advisor chuyển khách cho tư vấn viên theo capacity.</p>
            </div>
            <button onClick={loadSessions} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-50 rounded-lg" title="Làm mới">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilter(f.key)}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold ${filter === f.key ? 'bg-red-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-red-50 hover:text-red-600'}`}>
                {f.label}
              </button>
            ))}
          </div>
          {sessions.length > 0 && (
            <div className="flex items-center justify-between gap-2 mt-3">
              <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded border-gray-300 text-red-600 focus:ring-red-400" />
                Chọn tất cả{selectedIds.size > 0 ? ` (${selectedIds.size})` : ''}
              </label>
              {selectedIds.size > 0 && (
                <button onClick={deleteSelected} disabled={busy}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1">
                  <Trash2 className="w-3.5 h-3.5" />Xóa ({selectedIds.size})
                </button>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {error && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{error}</div>}
          {loading && <div className="text-sm text-gray-400 p-4 text-center">Đang tải phiên chat…</div>}
          {!loading && sessions.length === 0 && <div className="text-sm text-gray-400 p-4 text-center">Chưa có phiên chat.</div>}
          {sessions.map(s => {
            const assignees = assigneesOf({ lead_assignments: s.chat_assignments }, roster);
            return (
              <div key={s.id}
                className={`flex items-start gap-2 rounded-xl border p-3 transition-colors ${selected?.id === s.id ? 'border-red-200 bg-red-50/60' : 'border-gray-100 hover:bg-gray-50'} ${selectedIds.has(s.id) ? 'ring-1 ring-red-300' : ''}`}>
                <input type="checkbox" checked={selectedIds.has(s.id)} onChange={() => toggleSelect(s.id)}
                  className="mt-0.5 rounded border-gray-300 text-red-600 focus:ring-red-400 flex-shrink-0" aria-label="Chọn phiên chat" />
                <button onClick={() => setSelectedId(s.id)} className="flex-1 min-w-0 text-left">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-bold text-sm text-gray-900 truncate">{sessionTitle(s)}</p>
                      <p className="text-xs text-gray-500 truncate mt-0.5">{s.need_summary || s.last_message || 'Chưa có mô tả nhu cầu'}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0 ${s.admin_attention ? 'bg-red-100 text-red-700' : s.status === 'active' ? 'bg-blue-100 text-blue-700' : s.status === 'closed' ? 'bg-gray-100 text-gray-500' : 'bg-amber-100 text-amber-700'}`}>
                      {statusLabel(s)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-2 text-[11px] text-gray-400">
                    <span className="truncate">{assignees.length ? assignees.map(a => a.label).join(' · ') : 'Chưa gán NV'}</span>
                    <span>{new Date(s.last_message_at).toLocaleString('vi-VN')}</span>
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden flex flex-col min-h-[520px]">
        {selected ? (
          <>
            <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-4">
              <div>
                <h3 className="font-black text-gray-900">{sessionTitle(selected)}</h3>
                <p className="text-xs text-gray-500 mt-1">{selected.visitor_phone || selected.leads?.phone || 'Chưa có SĐT'} · {selected.properties?.title || 'Chưa gắn BĐS cụ thể'}</p>
                {selected.need_summary && <p className="text-xs text-gray-600 mt-2 bg-gray-50 rounded-lg px-2.5 py-1.5">{selected.need_summary}</p>}
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <select disabled={busy || roster.length === 0} onChange={e => e.target.value && assign(e.target.value)} value=""
                  className="text-xs rounded-lg border border-gray-200 px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-red-400">
                  <option value="">Gán NV…</option>
                  {roster.map(m => <option key={m.id} value={m.id}>{memberLabel(m)}</option>)}
                </select>
                <button disabled={busy || selected.status === 'closed'} onClick={close}
                  className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-50 flex items-center gap-1">
                  <CheckCircle className="w-3.5 h-3.5" />Đóng phiên
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50/40">
              {messages.length === 0 && <div className="text-sm text-gray-400 text-center py-10">Chưa có tin nhắn.</div>}
              {messages.map(m => (
                <div key={m.id} className={`flex ${m.sender === 'visitor' ? 'justify-start' : m.sender === 'staff' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm shadow-sm ${m.sender === 'visitor' ? 'bg-white text-gray-800 border border-gray-100' : m.sender === 'staff' ? 'bg-red-600 text-white' : m.sender === 'assistant' ? 'bg-blue-50 text-blue-800 border border-blue-100' : 'bg-gray-100 text-gray-500'}`}>
                    <p className="text-[10px] font-bold opacity-70 mb-1">{senderLabel(m)} · {new Date(m.created_at).toLocaleString('vi-VN')}</p>
                    <p className="whitespace-pre-wrap">{m.body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-3 border-t border-gray-100 flex gap-2">
              <textarea value={message} onChange={e => setMessage(e.target.value)} disabled={busy || selected.status === 'closed'}
                placeholder={selected.status === 'closed' ? 'Phiên đã đóng' : 'Nhập phản hồi cho khách…'}
                className="flex-1 min-h-[44px] max-h-28 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 disabled:bg-gray-50" />
              <button onClick={send} disabled={busy || !message.trim() || selected.status === 'closed'}
                className="w-11 h-11 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white flex items-center justify-center">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-2">
            <XCircle className="w-8 h-8" />
            <p>Chọn một phiên chat để xem transcript.</p>
            <p className="text-xs flex items-center gap-1"><UserPlus className="w-3 h-3" />Phiên mới sẽ tự chia cho nhân viên còn capacity.</p>
          </div>
        )}
      </div>
    </div>
  );
}
