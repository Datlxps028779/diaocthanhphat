import { useState, useEffect } from 'react';
import { Bot, Plus, Edit2, Trash2, Save, Info } from 'lucide-react';
import type { AiChatKnowledge } from '../../../lib/supabase';
import {
  adminGetAiChatKnowledge, createAiChatKnowledge, updateAiChatKnowledge, deleteAiChatKnowledge,
  getSiteSettings, upsertSiteSetting,
} from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { SimpleForm } from '../shared/SimpleForm';

// Lời mặc định của Trợ lý BĐS (site_settings group 'ai_chat'). Khớp seed migration
// 20260806000000_ai_chat_training.sql để admin sửa đúng key.
const DEFAULT_MESSAGE_FIELDS: { key: string; label: string; hint?: string }[] = [
  { key: 'ai_greeting', label: 'Lời chào mở đầu' },
  { key: 'ai_examples', label: 'Câu hỏi gợi ý mẫu', hint: 'Mỗi dòng là 1 gợi ý hiển thị dưới ô chat.' },
  { key: 'ai_answer_loan', label: 'Câu trả lời khi khách hỏi về vay/lãi suất' },
  { key: 'ai_answer_legal', label: 'Câu trả lời khi khách hỏi về pháp lý' },
  { key: 'ai_answer_investment', label: 'Câu trả lời khi khách hỏi về đầu tư/lợi nhuận' },
];

const MESSAGE_LABELS: Record<string, string> = {
  ai_greeting: 'Lời chào mở đầu',
  ai_examples: 'Câu hỏi gợi ý mẫu (mỗi dòng 1 câu)',
  ai_answer_loan: 'Câu trả lời khi khách hỏi về vay/lãi suất',
  ai_answer_legal: 'Câu trả lời khi khách hỏi về pháp lý',
  ai_answer_investment: 'Câu trả lời khi khách hỏi về đầu tư/lợi nhuận',
};

// ─── AI Chat Training Tab ───────────────────────────────────────────────────────
export function AiChatTab() {
  const [entries, setEntries] = useState<AiChatKnowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AiChatKnowledge | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  // Lời mặc định
  const [messages, setMessages] = useState<Record<string, string>>({});
  const [savingMessages, setSavingMessages] = useState(false);
  const [messagesSaved, setMessagesSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    const [kb, settings] = await Promise.all([adminGetAiChatKnowledge(), getSiteSettings()]);
    setEntries(kb);
    const m: Record<string, string> = {};
    DEFAULT_MESSAGE_FIELDS.forEach(f => { m[f.key] = settings[f.key] ?? ''; });
    setMessages(m);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const saveMessages = async () => {
    setSavingMessages(true);
    setMessagesSaved(false);
    try {
      for (const f of DEFAULT_MESSAGE_FIELDS) {
        await upsertSiteSetting({
          key: f.key,
          value: messages[f.key] ?? '',
          label: MESSAGE_LABELS[f.key] ?? f.label,
          group_name: 'ai_chat',
          type: 'textarea',
        });
      }
      setMessagesSaved(true);
    } catch (e) {
      console.error('[AdminPanel] Lưu lời mặc định AI chat thất bại:', e);
      alert(`Lưu thất bại: ${(e as { message?: string })?.message ?? 'Lỗi không xác định'}`);
    } finally {
      setSavingMessages(false);
    }
  };

  const e = editing;
  if (creating || editing) {
    return (
      <SimpleForm
        title={e ? 'Sửa câu Hỏi–Đáp' : 'Thêm câu Hỏi–Đáp mới'}
        fields={[
          { name: 'topic', label: 'Chủ đề *', value: e?.topic ?? '', required: true },
          { name: 'keywords', label: 'Từ khóa (phân tách bằng dấu phẩy hoặc xuống dòng) *', value: e?.keywords ?? '', required: true, type: 'textarea', rows: 3 },
          { name: 'answer', label: 'Câu trả lời *', value: e?.answer ?? '', required: true, type: 'textarea', rows: 5 },
          { name: 'priority', label: 'Ưu tiên (số lớn hơn được ưu tiên khớp trước)', value: String(e?.priority ?? 0), type: 'number' },
          { name: 'is_active', label: 'Trạng thái', value: e?.is_active === false ? 'Ẩn' : 'Hiển thị', type: 'select', options: ['Hiển thị', 'Ẩn'] },
        ]}
        onSave={async (data) => {
          const payload = {
            topic: String(data.topic).trim(),
            keywords: String(data.keywords).trim(),
            answer: String(data.answer).trim(),
            priority: parseInt(String(data.priority)) || 0,
            is_active: String(data.is_active) !== 'Ẩn',
          };
          if (creating) await createAiChatKnowledge(payload);
          else if (editing) await updateAiChatKnowledge(editing.id, payload);
          await load(); setEditing(null); setCreating(false);
        }}
        onCancel={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900 space-y-1">
          <p className="font-semibold">Cách "đào tạo" Trợ lý BĐS</p>
          <p className="text-blue-800">Trợ lý khớp câu hỏi của khách theo <b>từ khóa</b> bạn soạn. Câu có <b>ưu tiên</b> cao hơn được chọn trước. Trợ lý chỉ dùng nội dung bạn soạn ở đây + dữ liệu tin đăng thật, không tự bịa số liệu.</p>
        </div>
      </div>

      {/* ─── Phần A: Kho Hỏi–Đáp ─── */}
      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-bold text-gray-900 text-base flex items-center gap-2"><Bot className="w-4 h-4 text-red-600" />Kho câu Hỏi–Đáp</h2>
          <button onClick={() => setCreating(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors">
            <Plus className="w-4 h-4" />Thêm câu Hỏi–Đáp
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        ) : (
          <div className="space-y-2">
            {entries.map(item => (
              <div key={item.id} className={`bg-white rounded-xl border p-4 shadow-sm ${item.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}>
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-gray-900 text-sm">{item.topic}</p>
                      <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Ưu tiên {item.priority}</span>
                      <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${item.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{item.is_active ? 'Đang hiển thị' : 'Đã ẩn'}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1"><b>Từ khóa:</b> {item.keywords}</p>
                    <p className="text-gray-600 text-xs mt-1 line-clamp-3">{item.answer}</p>
                  </div>
                  <div className="flex gap-1 flex-shrink-0">
                    <button onClick={() => setEditing(item)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                    <button onClick={() => setConfirmDelete(item.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
              </div>
            ))}
            {entries.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Chưa có câu Hỏi–Đáp nào. Bấm "Thêm câu Hỏi–Đáp" để bắt đầu.</div>}
          </div>
        )}
      </section>

      {/* ─── Phần B: Lời mặc định ─── */}
      <section className="space-y-3">
        <h2 className="font-bold text-gray-900 text-base">Lời mặc định của Trợ lý</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 max-w-2xl">
          {DEFAULT_MESSAGE_FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{f.label}</label>
              {f.hint && <p className="text-[11px] text-gray-400 mb-1">{f.hint}</p>}
              <textarea
                value={messages[f.key] ?? ''}
                onChange={ev => { setMessages(m => ({ ...m, [f.key]: ev.target.value })); setMessagesSaved(false); }}
                rows={f.key === 'ai_examples' ? 4 : 3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <button onClick={saveMessages} disabled={savingMessages}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2">
              <Save className="w-4 h-4" />{savingMessages ? 'Đang lưu...' : 'Lưu lời mặc định'}
            </button>
            {messagesSaved && <span className="text-sm text-emerald-600 font-medium">Đã lưu</span>}
          </div>
        </div>
      </section>

      {confirmDelete && (
        <ConfirmDialog message="Xóa câu Hỏi–Đáp này?"
          onConfirm={async () => { await deleteAiChatKnowledge(confirmDelete); setConfirmDelete(null); await load(); }}
          onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}
