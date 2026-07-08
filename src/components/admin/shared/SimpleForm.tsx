import { useState } from 'react';
import { X, Save } from 'lucide-react';
import type { Area } from '../../../lib/supabase';

// ─── SimpleForm ───────────────────────────────────────────────────────────────
export function SimpleForm({ title, fields, areaId, areas, onSave, onCancel }: {
  title: string;
  fields: { name: string; label: string; value: string; type?: string; required?: boolean; options?: string[]; rows?: number }[];
  areaId?: string; areas?: Area[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const init: Record<string, string> = {};
  fields.forEach(f => { init[f.name] = f.value; });
  if (areaId !== undefined) init['area_id'] = areaId;

  const [form, setForm] = useState(init);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); } catch (e) { console.error("[AdminPanel]", e); } finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-bold text-gray-900 text-lg">{title}</h2>
        <button onClick={onCancel}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
      </div>
      <div className="space-y-3">
        {areas && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Khu vực</label>
            <select value={form['area_id'] ?? ''} onChange={e => setForm(f => ({ ...f, area_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
              <option value="">-- Chọn khu vực --</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        {fields.map(f => (
          <div key={f.name}>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{f.label}</label>
            {f.type === 'textarea' ? (
              <textarea value={form[f.name] ?? ''} onChange={e => setForm(ff => ({ ...ff, [f.name]: e.target.value }))}
                rows={f.rows ?? 4} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
            ) : f.type === 'select' ? (
              <select value={form[f.name] ?? ''} onChange={e => setForm(ff => ({ ...ff, [f.name]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type={f.type ?? 'text'} value={form[f.name] ?? ''} onChange={e => setForm(ff => ({ ...ff, [f.name]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
        <button onClick={onCancel} className="border border-gray-200 text-gray-600 px-5 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">Hủy</button>
        <button onClick={handleSave} disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2">
          <Save className="w-4 h-4" />{saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </div>
  );
}
