import { useState, useEffect, useCallback } from 'react';
import { X, Phone, MapPin, Wallet, StickyNote, PhoneCall, GitBranch, UserPlus, Clock } from 'lucide-react';
import type { Lead, LeadActivity } from '../../../lib/supabase';
import { getLeadActivities, addLeadActivity, updateLeadStatus, updateLeadCrm } from '../../../lib/api';
import { PIPELINE_STAGES, stageMeta } from '../../../lib/leadPipeline';
import { PropertyPicker } from '../shared/PropertyPicker';

// Nhãn + icon cho từng loại activity trong timeline.
const KIND_META: Record<LeadActivity['kind'], { label: string; icon: typeof StickyNote }> = {
  created: { label: 'Tạo khách', icon: UserPlus },
  note: { label: 'Ghi chú', icon: StickyNote },
  call: { label: 'Cuộc gọi', icon: PhoneCall },
  stage_change: { label: 'Đổi giai đoạn', icon: GitBranch },
  follow_up: { label: 'Hẹn gọi lại', icon: Clock },
};

interface Props {
  lead: Lead;
  author: string;               // nhãn admin đang thao tác (ghi vào activity)
  onClose: () => void;
  onChanged: () => void;        // báo LeadsTab reload danh sách sau khi đổi
}

export function LeadDetailDrawer({ lead, author, onClose, onChanged }: Props) {
  const [activities, setActivities] = useState<LeadActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<Lead['status']>(lead.status);
  const [propertyId, setPropertyId] = useState<string | null>(lead.property_id);
  const [propertyTitle, setPropertyTitle] = useState<string | null>(lead.properties?.title ?? null);
  const [noteKind, setNoteKind] = useState<'note' | 'call'>('note');
  const [noteBody, setNoteBody] = useState('');
  const [busy, setBusy] = useState(false);

  const loadActivities = useCallback(async () => {
    setLoading(true);
    setActivities(await getLeadActivities(lead.id));
    setLoading(false);
  }, [lead.id]);

  useEffect(() => { loadActivities(); }, [loadActivities]);

  // Đổi giai đoạn → cập nhật DB + ghi activity stage_change + reload timeline & list.
  const handleStage = async (next: Lead['status']) => {
    if (next === status || busy) return;
    setBusy(true);
    try {
      await updateLeadStatus(lead.id, next);
      await addLeadActivity(lead.id, {
        kind: 'stage_change', author,
        body: `${stageMeta(status).label} → ${stageMeta(next).label}`,
      });
      setStatus(next);
      await loadActivities();
      onChanged();
    } finally { setBusy(false); }
  };

  // Gắn/đổi/gỡ BĐS quan tâm → cập nhật DB + ghi activity note + reload list.
  const handleProperty = async (id: string | null, title: string | null) => {
    if (id === propertyId || busy) return;
    setBusy(true);
    try {
      await updateLeadCrm(lead.id, { property_id: id });
      await addLeadActivity(lead.id, {
        kind: 'note', author,
        body: id ? `Gắn BĐS quan tâm: ${title ?? id}` : 'Gỡ BĐS quan tâm',
      });
      setPropertyId(id);
      setPropertyTitle(title);
      await loadActivities();
      onChanged();
    } finally { setBusy(false); }
  };

  const handleAddNote = async () => {
    if (!noteBody.trim() || busy) return;
    setBusy(true);
    try {
      await addLeadActivity(lead.id, { kind: noteKind, body: noteBody.trim(), author });
      setNoteBody('');
      await loadActivities();
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-gray-50 w-full max-w-md h-full overflow-y-auto shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-gray-200 px-5 py-4 flex items-start justify-between z-10">
          <div className="min-w-0">
            <h3 className="font-bold text-gray-900 text-base truncate">{lead.full_name}</h3>
            <div className="flex flex-wrap gap-3 mt-1 text-xs text-gray-500">
              <a href={`tel:${lead.phone}`} className="flex items-center gap-1 text-emerald-600 font-medium"><Phone className="w-3 h-3" />{lead.phone}</a>
              {lead.area_interest && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.area_interest}</span>}
              {lead.budget && <span className="flex items-center gap-1"><Wallet className="w-3 h-3" />{lead.budget}</span>}
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 flex-shrink-0 ml-2"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Stepper giai đoạn */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Giai đoạn</p>
            <div className="flex flex-wrap gap-1.5">
              {PIPELINE_STAGES.map(s => (
                <button key={s.key} disabled={busy} onClick={() => handleStage(s.key)}
                  className={`text-xs font-medium px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-50 ${status === s.key ? `${s.color} border-transparent ring-1 ring-offset-1 ring-red-300` : 'bg-white border-gray-200 text-gray-600 hover:border-red-400'}`}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Gán NV + hẹn gọi lại */}
          <div className="grid grid-cols-1 gap-2">
            <label className="flex items-center gap-2 text-xs">
              <UserPlus className="w-3.5 h-3.5 text-gray-400" />
              <input defaultValue={lead.assigned_to ?? ''} placeholder="Gán nhân viên"
                onBlur={e => { const v = e.target.value.trim() || null; if (v !== (lead.assigned_to ?? null)) { updateLeadCrm(lead.id, { assigned_to: v }).then(onChanged); } }}
                className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-red-400 outline-none" />
            </label>
            <div className="text-xs">
              <PropertyPicker value={propertyId} valueLabel={propertyTitle}
                onChange={handleProperty} disabled={busy} />
            </div>
            <label className="flex items-center gap-2 text-xs">
              <Clock className="w-3.5 h-3.5 text-gray-400" />
              <input type="datetime-local" aria-label="Hẹn gọi lại"
                defaultValue={lead.follow_up_at ? toLocalInput(lead.follow_up_at) : ''}
                onChange={e => { const v = e.target.value ? new Date(e.target.value).toISOString() : null; updateLeadCrm(lead.id, { follow_up_at: v }).then(() => { addLeadActivity(lead.id, { kind: 'follow_up', author, body: v ? new Date(v).toLocaleString('vi-VN') : 'Xóa hẹn' }).then(loadActivities); onChanged(); }); }}
                className="flex-1 border border-gray-200 rounded-md px-2 py-1.5 focus:ring-1 focus:ring-red-400 outline-none" />
            </label>
          </div>

          {/* Thêm ghi chú / cuộc gọi */}
          <div className="bg-white rounded-xl border border-gray-200 p-3 space-y-2">
            <div className="flex gap-1.5">
              {(['note', 'call'] as const).map(k => (
                <button key={k} onClick={() => setNoteKind(k)}
                  className={`text-xs font-medium px-2.5 py-1 rounded-lg transition-colors ${noteKind === k ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                  {KIND_META[k].label}
                </button>
              ))}
            </div>
            <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)} rows={2}
              placeholder={noteKind === 'call' ? 'Nội dung cuộc gọi...' : 'Ghi chú chăm sóc...'}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:ring-1 focus:ring-red-400 outline-none resize-none" />
            <button onClick={handleAddNote} disabled={busy || !noteBody.trim()}
              className="w-full text-xs font-semibold bg-gray-900 hover:bg-gray-800 disabled:opacity-40 text-white py-2 rounded-lg transition-colors">
              Lưu vào nhật ký
            </button>
          </div>

          {/* Timeline tương tác */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Nhật ký chăm sóc</p>
            {loading ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}</div>
            ) : activities.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">Chưa có tương tác nào.</p>
            ) : (
              <ol className="space-y-2">
                {activities.map(a => {
                  const meta = KIND_META[a.kind];
                  const Icon = meta.icon;
                  return (
                    <li key={a.id} className="bg-white rounded-lg border border-gray-100 p-2.5 flex gap-2.5">
                      <Icon className="w-4 h-4 text-gray-400 flex-shrink-0 mt-0.5" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-gray-700">{meta.label}</span>
                          <span className="text-[10px] text-gray-400 flex-shrink-0">{new Date(a.created_at).toLocaleString('vi-VN')}</span>
                        </div>
                        {a.body && <p className="text-xs text-gray-600 mt-0.5 break-words">{a.body}</p>}
                        {a.author && <p className="text-[10px] text-gray-400 mt-0.5">— {a.author}</p>}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ISO → giá trị input datetime-local (giờ địa phương).
function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
