import { useState, useEffect } from 'react';
import { Bot, Plus, Edit2, Trash2, Save, Info, MessageSquare, BookOpen, ShieldCheck, FlaskConical } from 'lucide-react';
import type { AiChatKnowledge, AiChatKnowledgeType } from '../../../lib/supabase';
import {
  adminGetAiChatKnowledge, createAiChatKnowledge, updateAiChatKnowledge, deleteAiChatKnowledge,
  getSiteSettings, upsertSiteSetting,
} from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { SimpleForm } from '../shared/SimpleForm';

const TYPE_LABELS: Record<AiChatKnowledgeType, string> = {
  priority_qa: 'Q&A ưu tiên',
  background: 'Tri thức nền',
  rule: 'Quy tắc & persona',
  test_case: 'Bộ kiểm thử',
};

const TYPE_FROM_LABEL = Object.fromEntries(
  Object.entries(TYPE_LABELS).map(([key, label]) => [label, key]),
) as Record<string, AiChatKnowledgeType>;

const DEFAULT_MESSAGE_FIELDS: { key: string; label: string; hint?: string; rows?: number }[] = [
  { key: 'ai_greeting', label: 'Lời chào mở đầu', rows: 3 },
  { key: 'ai_examples', label: 'Câu hỏi gợi ý mẫu', hint: 'Mỗi dòng là 1 gợi ý hiển thị dưới ô chat.', rows: 4 },
  { key: 'ai_answer_loan', label: 'Câu trả lời an toàn: vay/lãi suất', rows: 3 },
  { key: 'ai_answer_legal', label: 'Câu trả lời an toàn: pháp lý', rows: 3 },
  { key: 'ai_answer_investment', label: 'Câu trả lời an toàn: đầu tư/lợi nhuận', rows: 3 },
  { key: 'ai_answer_unknown', label: 'Câu trả lời khi thiếu dữ liệu xác thực', rows: 3 },
  { key: 'ai_handoff_message', label: 'Câu mời chuyển tư vấn viên', rows: 2 },
];

const MESSAGE_LABELS: Record<string, string> = Object.fromEntries(DEFAULT_MESSAGE_FIELDS.map(f => [f.key, f.label]));

function typeOf(item: AiChatKnowledge): AiChatKnowledgeType {
  return item.knowledge_type ?? 'priority_qa';
}

function boolLabel(v: boolean | null | undefined): string {
  return v ? 'Có' : 'Không';
}

function statusLabel(v: boolean): string {
  return v ? 'Hiển thị' : 'Ẩn';
}

function SectionCard({
  type, icon, title, desc, entries, onCreate, onEdit, onDelete,
}: {
  type: AiChatKnowledgeType;
  icon: React.ReactNode;
  title: string;
  desc: string;
  entries: AiChatKnowledge[];
  onCreate: (type: AiChatKnowledgeType) => void;
  onEdit: (entry: AiChatKnowledge) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      <div className="p-4 border-b border-gray-100 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center flex-shrink-0">{icon}</div>
          <div>
            <h2 className="font-black text-gray-900 text-base">{title}</h2>
            <p className="text-xs text-gray-500 mt-0.5 max-w-2xl">{desc}</p>
          </div>
        </div>
        <button onClick={() => onCreate(type)} className="flex items-center gap-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-2 rounded-lg text-xs transition-colors flex-shrink-0">
          <Plus className="w-3.5 h-3.5" />Thêm
        </button>
      </div>
      <div className="p-4 space-y-2">
        {entries.map(item => (
          <div key={item.id} className={`rounded-xl border p-4 ${item.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}>
            <div className="flex justify-between items-start gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-bold text-gray-900 text-sm">{item.topic}</p>
                  <span className="text-[10px] font-semibold bg-gray-100 text-gray-500 rounded-full px-2 py-0.5">Ưu tiên {item.priority}</span>
                  <span className={`text-[10px] font-semibold rounded-full px-2 py-0.5 ${item.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{statusLabel(item.is_active)}</span>
                  {item.handoff_required && <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 rounded-full px-2 py-0.5">Chuyển TVV</span>}
                </div>
                <p className="text-[11px] text-gray-400 mt-1"><b>Từ khóa:</b> {item.keywords}</p>
                {item.question_examples && <p className="text-[11px] text-gray-400 mt-1"><b>Câu mẫu:</b> {item.question_examples.split('\n').filter(Boolean).slice(0, 2).join(' / ')}</p>}
                <p className="text-gray-600 text-xs mt-1 line-clamp-3">{item.answer}</p>
                {item.guardrail && <p className="text-[11px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1 mt-2 line-clamp-2"><b>Rào chắn:</b> {item.guardrail}</p>}
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => onEdit(item)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => onDelete(item.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          </div>
        ))}
        {entries.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Chưa có dữ liệu trong khu này.</div>}
      </div>
    </section>
  );
}

export function AiChatTab() {
  const [entries, setEntries] = useState<AiChatKnowledge[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<AiChatKnowledge | null>(null);
  const [creatingType, setCreatingType] = useState<AiChatKnowledgeType | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
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
      console.error('[AdminPanel] Lưu cấu hình AI chat thất bại:', e);
      alert(`Lưu thất bại: ${(e as { message?: string })?.message ?? 'Lỗi không xác định'}`);
    } finally {
      setSavingMessages(false);
    }
  };

  const activeType = editing ? typeOf(editing) : creatingType;
  if (activeType) {
    const e = editing;
    return (
      <SimpleForm
        title={`${e ? 'Sửa' : 'Thêm'} ${TYPE_LABELS[activeType]}`}
        fields={[
          { name: 'knowledge_type', label: 'Phân cấp', value: TYPE_LABELS[activeType], type: 'select', options: Object.values(TYPE_LABELS) },
          { name: 'topic', label: 'Tên/chủ đề *', value: e?.topic ?? '', required: true },
          { name: 'keywords', label: 'Từ khóa chính *', value: e?.keywords ?? '', required: true, type: 'textarea', rows: 3 },
          { name: 'question_examples', label: 'Câu hỏi mẫu / tình huống', value: e?.question_examples ?? '', type: 'textarea', rows: 3 },
          { name: 'typo_variants', label: 'Biến thể sai chính tả / cách viết khác', value: e?.typo_variants ?? '', type: 'textarea', rows: 2 },
          { name: 'answer', label: activeType === 'test_case' ? 'Kỳ vọng kiểm thử *' : 'Nội dung AI được phép trả lời *', value: e?.answer ?? '', required: true, type: 'textarea', rows: 5 },
          { name: 'guardrail', label: 'Rào chắn không bịa / giới hạn bắt buộc', value: e?.guardrail ?? '', type: 'textarea', rows: 3 },
          { name: 'expected_behavior', label: 'Hành vi mong đợi', value: e?.expected_behavior ?? '', type: 'textarea', rows: 2 },
          { name: 'must_not_answer', label: 'AI không được trả lời gì?', value: e?.must_not_answer ?? '', type: 'textarea', rows: 2 },
          { name: 'priority', label: 'Ưu tiên', value: String(e?.priority ?? (activeType === 'rule' ? 100 : activeType === 'background' ? 50 : 10)), type: 'number' },
          { name: 'handoff_required', label: 'Bắt buộc chuyển tư vấn viên', value: boolLabel(e?.handoff_required ?? activeType !== 'priority_qa'), type: 'select', options: ['Không', 'Có'] },
          { name: 'is_active', label: 'Trạng thái', value: statusLabel(e?.is_active ?? true), type: 'select', options: ['Hiển thị', 'Ẩn'] },
        ]}
        onSave={async (data) => {
          const type = TYPE_FROM_LABEL[String(data.knowledge_type)] ?? activeType;
          const payload = {
            knowledge_type: type,
            topic: String(data.topic).trim(),
            keywords: String(data.keywords).trim(),
            question_examples: String(data.question_examples ?? '').trim() || null,
            typo_variants: String(data.typo_variants ?? '').trim() || null,
            answer: String(data.answer).trim(),
            guardrail: String(data.guardrail ?? '').trim() || null,
            expected_behavior: String(data.expected_behavior ?? '').trim() || null,
            must_not_answer: String(data.must_not_answer ?? '').trim() || null,
            priority: parseInt(String(data.priority)) || 0,
            handoff_required: String(data.handoff_required) === 'Có',
            is_active: String(data.is_active) !== 'Ẩn',
          };
          if (editing) await updateAiChatKnowledge(editing.id, payload);
          else await createAiChatKnowledge(payload);
          await load();
          setEditing(null);
          setCreatingType(null);
        }}
        onCancel={() => { setEditing(null); setCreatingType(null); }}
      />
    );
  }

  const grouped = (type: AiChatKnowledgeType) => entries.filter(item => typeOf(item) === type);

  return (
    <div className="space-y-6">
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-900 space-y-1">
          <p className="font-semibold">Phân cấp đào tạo Trợ lý BĐS</p>
          <p className="text-blue-800">AI trả lời theo thứ tự: <b>Q&A ưu tiên</b> → <b>Tri thức nền</b> → <b>Quy tắc/persona</b> → hỏi lại hoặc chuyển tư vấn viên. AI chỉ dùng nội dung ở đây + dữ liệu tin đăng thật, không tự bịa số liệu, pháp lý, lãi suất hay lợi nhuận.</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-32 bg-gray-100 rounded-2xl animate-pulse" />)}</div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          <SectionCard type="priority_qa" icon={<MessageSquare className="w-5 h-5" />} title="Q&A ưu tiên" desc="Câu hỏi quan trọng cần trả lời đúng nội dung admin soạn trước; ưu tiên cao nhất khi khớp." entries={grouped('priority_qa')} onCreate={setCreatingType} onEdit={setEditing} onDelete={setConfirmDelete} />
          <SectionCard type="background" icon={<BookOpen className="w-5 h-5" />} title="Tri thức nền" desc="Pháp lý, khu vực, vay, quy trình, giá. Dùng để AI giải thích có kiểm soát và có rào chắn." entries={grouped('background')} onCreate={setCreatingType} onEdit={setEditing} onDelete={setConfirmDelete} />
          <SectionCard type="rule" icon={<ShieldCheck className="w-5 h-5" />} title="Quy tắc & persona" desc="Giọng điệu, giới hạn, điều cấm trả lời, cách nói khi thiếu dữ liệu và khi cần chuyển tư vấn viên." entries={grouped('rule')} onCreate={setCreatingType} onEdit={setEditing} onDelete={setConfirmDelete} />
          <SectionCard type="test_case" icon={<FlaskConical className="w-5 h-5" />} title="Bộ kiểm thử hội thoại" desc="Câu hỏi hóc búa, sai chính tả, thiếu dữ liệu, bắt buộc handoff. Không dùng làm nguồn trả lời công khai." entries={grouped('test_case')} onCreate={setCreatingType} onEdit={setEditing} onDelete={setConfirmDelete} />
        </div>
      )}

      <section className="space-y-3">
        <h2 className="font-bold text-gray-900 text-base flex items-center gap-2"><Bot className="w-4 h-4 text-red-600" />Persona & lời mặc định ở giao diện chat</h2>
        <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4 max-w-3xl">
          {DEFAULT_MESSAGE_FIELDS.map(f => (
            <div key={f.key}>
              <label className="block text-xs font-semibold text-gray-700 mb-1">{f.label}</label>
              {f.hint && <p className="text-[11px] text-gray-400 mb-1">{f.hint}</p>}
              <textarea
                value={messages[f.key] ?? ''}
                onChange={ev => { setMessages(m => ({ ...m, [f.key]: ev.target.value })); setMessagesSaved(false); }}
                rows={f.rows ?? 3}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
              />
            </div>
          ))}
          <div className="flex items-center gap-3 pt-2 border-t border-gray-100">
            <button onClick={saveMessages} disabled={savingMessages}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2">
              <Save className="w-4 h-4" />{savingMessages ? 'Đang lưu...' : 'Lưu persona'}
            </button>
            {messagesSaved && <span className="text-sm text-emerald-600 font-medium">Đã lưu</span>}
          </div>
        </div>
      </section>

      {confirmDelete && (
        <ConfirmDialog message="Xóa mục đào tạo AI này?"
          onConfirm={async () => { await deleteAiChatKnowledge(confirmDelete); setConfirmDelete(null); await load(); }}
          onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}
