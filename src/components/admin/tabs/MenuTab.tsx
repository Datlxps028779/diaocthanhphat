import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, ArrowUp, ArrowDown, X, List, AlertCircle, ExternalLink } from 'lucide-react';
import type { MenuItem, MenuItemType } from '../../../lib/supabase';
import { getMenuItems, adminCreateMenuItem, adminUpdateMenuItem, adminDeleteMenuItem } from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';

// Quản lý menu điều hướng (kiểu WordPress): thêm/sửa/xóa/sắp xếp/lồng cấp.
// Menu_type='dynamic_areas' là mục "động" — FE tự bung danh sách khu vực thật.

type FormState = {
  label: string; url: string; item_type: MenuItemType;
  open_new_tab: boolean; parent_id: string | null; is_active: boolean;
};
const BLANK: FormState = { label: '', url: '', item_type: 'link', open_new_tab: false, parent_id: null, is_active: true };

// Tập id chính nó + toàn bộ con cháu — để loại khỏi dropdown "menu cha" (chống vòng lặp).
function descendantIds(items: MenuItem[], rootId: string): Set<string> {
  const out = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const it of items) {
      if (it.parent_id && out.has(it.parent_id) && !out.has(it.id)) { out.add(it.id); added = true; }
    }
  }
  return out;
}

export function MenuTab() {
  const [items, setItems] = useState<MenuItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<MenuItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>({ ...BLANK });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = () => getMenuItems().then(m => { setItems(m); setLoading(false); });
  useEffect(() => { load(); }, []);

  // Con của mỗi parent, sort order_index — để render cây + tính order khi thêm mới.
  const childrenOf = (parentId: string | null) =>
    items.filter(i => i.parent_id === parentId).sort((a, b) => a.order_index - b.order_index);

  const openCreate = (parentId: string | null = null) => {
    setForm({ ...BLANK, parent_id: parentId });
    setEditing(null); setError(''); setCreating(true);
  };
  const openEdit = (m: MenuItem) => {
    setForm({ label: m.label, url: m.url ?? '', item_type: m.item_type, open_new_tab: m.open_new_tab, parent_id: m.parent_id, is_active: m.is_active });
    setEditing(m); setError(''); setCreating(true);
  };

  const save = async () => {
    if (!form.label.trim()) { setError('Nhãn không được để trống'); return; }
    if (form.item_type === 'link' && !form.url.trim()) { setError('Mục liên kết cần có URL'); return; }
    setSaving(true); setError('');
    try {
      const siblings = childrenOf(form.parent_id);
      const payload = {
        label: form.label.trim(),
        url: form.item_type === 'dynamic_areas' ? null : form.url.trim(),
        item_type: form.item_type,
        open_new_tab: form.open_new_tab,
        parent_id: form.parent_id,
        is_active: form.is_active,
        order_index: editing?.order_index ?? siblings.length,
      };
      if (editing) await adminUpdateMenuItem(editing.id, payload);
      else await adminCreateMenuItem(payload);
      await load();
      setCreating(false); setEditing(null);
    } catch (e) { setError((e as Error).message); }
    setSaving(false);
  };

  const move = async (m: MenuItem, dir: 'up' | 'down') => {
    const siblings = childrenOf(m.parent_id);
    const idx = siblings.findIndex(s => s.id === m.id);
    const swap = dir === 'up' ? idx - 1 : idx + 1;
    if (swap < 0 || swap >= siblings.length) return;
    const a = siblings[idx], b = siblings[swap];
    await Promise.all([
      adminUpdateMenuItem(a.id, { order_index: b.order_index }),
      adminUpdateMenuItem(b.id, { order_index: a.order_index }),
    ]);
    load();
  };

  const del = async (id: string) => {
    await adminDeleteMenuItem(id);
    setConfirmDelete(null);
    load();
  };

  // Render 1 hàng + đệ quy con, thụt lề theo cấp.
  const renderNode = (m: MenuItem, depth: number) => {
    const siblings = childrenOf(m.parent_id);
    const idx = siblings.findIndex(s => s.id === m.id);
    const kids = childrenOf(m.id);
    return (
      <div key={m.id}>
        <div className={`flex items-center gap-3 bg-white border rounded-xl p-3 ${m.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'}`}
          style={{ marginLeft: depth * 20 }}>
          <div className="flex flex-col gap-0.5">
            <button onClick={() => move(m, 'up')} disabled={idx === 0} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
            <button onClick={() => move(m, 'down')} disabled={idx === siblings.length - 1} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-gray-900 text-sm">{m.label}</span>
              {m.item_type === 'dynamic_areas' && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Động: khu vực</span>}
              {m.open_new_tab && <ExternalLink className="w-3 h-3 text-gray-400" />}
              {!m.is_active && <span className="text-[10px] bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-full">Ẩn</span>}
            </div>
            {m.url && <p className="text-gray-400 text-xs mt-0.5 truncate">{m.url}</p>}
          </div>
          <div className="flex items-center gap-1.5">
            <button onClick={() => openCreate(m.id)} title="Thêm mục con" className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"><Plus className="w-4 h-4" /></button>
            <button onClick={() => openEdit(m)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
            <button onClick={() => setConfirmDelete(m.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
          </div>
        </div>
        {kids.length > 0 && <div className="mt-2 space-y-2">{kids.map(k => renderNode(k, depth + 1))}</div>}
      </div>
    );
  };

  // Dropdown "menu cha": mọi item trừ chính nó + con cháu (chống vòng lặp).
  const excluded = editing ? descendantIds(items, editing.id) : new Set<string>();
  const parentOptions = items.filter(i => !excluded.has(i.id)).sort((a, b) => a.order_index - b.order_index);

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" /></div>;

  const roots = childrenOf(null);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2"><List className="w-5 h-5 text-red-600" />Quản lý Menu</h2>
          <p className="text-gray-500 text-sm mt-1">Thêm/sửa/xóa, kéo thứ tự và lồng cấp menu điều hướng. Mục "Động: khu vực" tự liệt kê các khu vực thật.</p>
        </div>
        <button onClick={() => openCreate(null)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" />Thêm mục
        </button>
      </div>

      {roots.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">Chưa có mục menu nào. Bấm "Thêm mục" để bắt đầu.</p>
        </div>
      ) : (
        <div className="space-y-2">{roots.map(m => renderNode(m, 0))}</div>
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-10">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setCreating(false); setEditing(null); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-base">{editing ? 'Sửa mục menu' : 'Thêm mục menu'}</h3>
              <button onClick={() => { setCreating(false); setEditing(null); }} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Nhãn *</label>
              <input value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))} placeholder="Mua bán"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Loại mục</label>
              <select value={form.item_type} onChange={e => setForm(f => ({ ...f, item_type: e.target.value as MenuItemType }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                <option value="link">Liên kết (URL)</option>
                <option value="dynamic_areas">Động: danh sách khu vực</option>
              </select>
            </div>

            {form.item_type === 'link' && (
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">URL *</label>
                <input value={form.url} onChange={e => setForm(f => ({ ...f, url: e.target.value }))} placeholder="/mua-ban hoặc https://..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Menu cha</label>
              <select value={form.parent_id ?? ''} onChange={e => setForm(f => ({ ...f, parent_id: e.target.value || null }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                <option value="">— Mục gốc (cấp 1) —</option>
                {parentOptions.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.open_new_tab} onChange={e => setForm(f => ({ ...f, open_new_tab: e.target.checked }))} className="w-4 h-4 accent-red-600 rounded" />
                <span className="text-sm text-gray-700">Mở tab mới</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="w-4 h-4 accent-red-600 rounded" />
                <span className="text-sm text-gray-700">Hiển thị</span>
              </label>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={save} disabled={saving} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-60">
                {saving ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-3.5 h-3.5" />}{saving ? 'Đang lưu...' : 'Lưu'}
              </button>
              <button onClick={() => { setCreating(false); setEditing(null); }} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Hủy</button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message="Xóa mục menu này? Mọi mục con cũng sẽ bị xóa."
          onConfirm={() => del(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
