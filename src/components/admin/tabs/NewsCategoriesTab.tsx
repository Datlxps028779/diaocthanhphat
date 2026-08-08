import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, X, Tag, AlertCircle } from 'lucide-react';
import type { NewsCategoryRow } from '../../../lib/supabase';
import { getNewsCategories, adminCreateNewsCategory, adminUpdateNewsCategory, adminDeleteNewsCategory } from '../../../lib/api';
import { buildSlug } from '../../../lib/slug';

// Quản lý danh mục tin tức (bảng news_categories). label khớp CHÍNH XÁC news.category.
// Đổi tên → cascade cập nhật bài qua RPC (trong adminUpdateNewsCategory). Xoá danh mục
// còn bài bị chặn ở API (adminDeleteNewsCategory đếm trước). Theo khuôn MenuTab.

// Bảng màu badge cố định, khớp categoryColors trong NewsPage.tsx.
const BADGE_COLORS: { key: string; label: string; className: string }[] = [
  { key: 'blue',   label: 'Xanh dương', className: 'bg-blue-100 text-blue-700' },
  { key: 'green',  label: 'Xanh lá',    className: 'bg-green-100 text-green-700' },
  { key: 'amber',  label: 'Vàng',       className: 'bg-amber-100 text-amber-700' },
  { key: 'purple', label: 'Tím',        className: 'bg-purple-100 text-purple-700' },
  { key: 'red',    label: 'Đỏ',         className: 'bg-red-100 text-red-700' },
  { key: 'slate',  label: 'Xám',        className: 'bg-gray-100 text-gray-600' },
];
function badgeClass(key: string) {
  return BADGE_COLORS.find(c => c.key === key)?.className ?? 'bg-gray-100 text-gray-600';
}

type FormState = { label: string; slug: string; badge_color: string; seo_description: string; order_index: number };
const BLANK: FormState = { label: '', slug: '', badge_color: 'slate', seo_description: '', order_index: 0 };

export function NewsCategoriesTab() {
  const [items, setItems] = useState<NewsCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<NewsCategoryRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>({ ...BLANK });
  const [slugTouched, setSlugTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = () => getNewsCategories().then(c => { setItems(c); setLoading(false); });
  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setForm({ ...BLANK, order_index: items.length });
    setEditing(null); setSlugTouched(false); setError(''); setCreating(true);
  };
  const openEdit = (c: NewsCategoryRow) => {
    setForm({ label: c.label, slug: c.slug, badge_color: c.badge_color, seo_description: c.seo_description ?? '', order_index: c.order_index });
    setEditing(c); setSlugTouched(true); setError(''); setCreating(true);
  };

  // Nhập nhãn: nếu chưa động vào ô slug thì tự gợi ý slug bỏ dấu từ nhãn.
  const onLabelChange = (label: string) => {
    setForm(f => ({ ...f, label, slug: slugTouched ? f.slug : buildSlug(label) }));
  };

  const save = async () => {
    if (!form.label.trim()) { setError('Tên danh mục không được để trống'); return; }
    if (!form.slug.trim()) { setError('Slug không được để trống'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        label: form.label.trim(),
        slug: form.slug.trim(),
        badge_color: form.badge_color,
        seo_description: form.seo_description.trim() || null,
        order_index: form.order_index,
      };
      if (editing) await adminUpdateNewsCategory(editing.id, payload, editing.label, editing.slug);
      else await adminCreateNewsCategory(payload);
      await load();
      setCreating(false); setEditing(null);
    } catch (e) { setError((e as Error).message); }
    setSaving(false);
  };

  const del = async (c: NewsCategoryRow) => {
    if (!confirm(`Xoá danh mục "${c.label}"?`)) return;
    try {
      await adminDeleteNewsCategory(c.id, c.label);
      await load();
    } catch (e) { alert((e as Error).message); }
  };

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2"><Tag className="w-5 h-5 text-red-600" />Danh mục tin tức</h2>
          <p className="text-gray-500 text-sm mt-1">Thêm/sửa/xoá danh mục. Đổi tên sẽ tự cập nhật mọi bài thuộc danh mục đó. Không xoá được danh mục còn bài.</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" />Thêm danh mục
        </button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-gray-500">Chưa có danh mục nào. Bấm "Thêm danh mục" để bắt đầu.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map(c => (
            <div key={c.id} className="flex items-center gap-3 bg-white border border-gray-200 rounded-xl p-3">
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded ${badgeClass(c.badge_color)}`}>{c.label}</span>
              <div className="flex-1 min-w-0">
                <p className="text-gray-400 text-xs truncate">/tin-tuc/danh-muc/{c.slug}</p>
                {c.seo_description && <p className="text-gray-500 text-xs mt-0.5 truncate">{c.seo_description}</p>}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => openEdit(c)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => del(c)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
      {creating && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-10">
          <div className="absolute inset-0 bg-black/50" onClick={() => { setCreating(false); setEditing(null); }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-base">{editing ? 'Sửa danh mục' : 'Thêm danh mục'}</h3>
              <button onClick={() => { setCreating(false); setEditing(null); }} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}

            {editing && (
              <div className="bg-amber-50 border border-amber-200 text-amber-700 text-xs px-4 py-2.5 rounded-lg flex items-start gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />Đổi tên danh mục sẽ tự cập nhật tất cả bài viết đang thuộc danh mục này.
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tên danh mục *</label>
              <input value={form.label} onChange={e => onLabelChange(e.target.value)} placeholder="Thị trường"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Slug URL *</label>
              <input value={form.slug} onChange={e => { setSlugTouched(true); setForm(f => ({ ...f, slug: e.target.value })); }} placeholder="thi-truong"
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              <p className="text-[11px] text-gray-400 mt-1">/tin-tuc/danh-muc/{form.slug || '...'}</p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Màu nhãn</label>
              <div className="flex flex-wrap gap-2">
                {BADGE_COLORS.map(c => (
                  <button key={c.key} type="button" onClick={() => setForm(f => ({ ...f, badge_color: c.key }))}
                    className={`text-[11px] font-bold px-2.5 py-1 rounded ${c.className} ${form.badge_color === c.key ? 'ring-2 ring-offset-1 ring-gray-900' : 'opacity-70'}`}>
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Mô tả SEO danh mục</label>
              <textarea value={form.seo_description} onChange={e => setForm(f => ({ ...f, seo_description: e.target.value }))} rows={2} placeholder="Mô tả ngắn hiển thị ở đầu trang danh mục và thẻ meta."
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
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
    </div>
  );
}
