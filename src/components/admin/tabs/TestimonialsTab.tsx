import { useState, useEffect } from 'react';
import { Star, Plus, Edit2, Trash2, CheckCircle, XCircle } from 'lucide-react';
import type { Testimonial } from '../../../lib/supabase';
import { adminGetTestimonials, createTestimonial, updateTestimonial, deleteTestimonial, bulkUpdateTestimonials, bulkDeleteTestimonials } from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { SimpleForm } from '../shared/SimpleForm';

// ─── Testimonials Tab ─────────────────────────────────────────────────────────
export function TestimonialsTab() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const load = async () => { setLoading(true); const d = await adminGetTestimonials(); setTestimonials(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  // ─── Bulk helpers ─────────────────────────────────────────────────────────
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allIds = testimonials.map(t => t.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allIds));
  const clearSelection = () => setSelected(new Set());
  const selectedIds = () => Array.from(selected);
  const runBulk = async (fn: () => Promise<number>, label: string) => {
    setBulkBusy(true);
    try {
      const n = await fn();
      clearSelection();
      await load();
      console.info(`[AdminPanel] Bulk ${label}: ${n} đánh giá`);
    } catch (e) {
      console.error(`[AdminPanel] Bulk ${label} thất bại:`, e);
      alert(`Thao tác hàng loạt thất bại: ${(e as { message?: string })?.message ?? 'Lỗi không xác định'}`);
    } finally { setBulkBusy(false); }
  };

  const t = editing;
  if (creating || editing) {
    return (
      <SimpleForm
        title={t ? 'Sửa đánh giá' : 'Thêm đánh giá mới'}
        fields={[
          { name: 'name', label: 'Họ tên *', value: t?.name ?? '', required: true },
          { name: 'location', label: 'Địa điểm', value: t?.location ?? '' },
          { name: 'rating', label: 'Đánh giá (1-5)', value: String(t?.rating ?? 5), type: 'number' },
          { name: 'content', label: 'Nội dung *', value: t?.content ?? '', required: true, type: 'textarea' },
        ]}
        onSave={async (data) => {
          const payload = { ...data, rating: parseInt(String(data.rating)) || 5, is_active: true };
          if (creating) await createTestimonial(payload as Omit<Testimonial, 'id' | 'created_at'>);
          else if (editing) await updateTestimonial(editing.id, payload);
          await load(); setEditing(null); setCreating(false);
        }}
        onCancel={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {testimonials.length > 0 ? (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={allSelected} onChange={toggleAll}
              aria-label="Chọn tất cả" className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer" />
            Chọn tất cả
          </label>
        ) : <span />}
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />Thêm đánh giá
        </button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-gray-900 text-white rounded-xl px-4 py-2.5 animate-fade-in">
          <span className="text-sm font-semibold mr-1">Đã chọn {selected.size}</span>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateTestimonials(selectedIds(), { is_active: true }), 'hiện')}
            className="flex items-center gap-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <CheckCircle className="w-3.5 h-3.5" />Hiện
          </button>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateTestimonials(selectedIds(), { is_active: false }), 'ẩn')}
            className="flex items-center gap-1 text-xs font-medium bg-gray-600 hover:bg-gray-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <XCircle className="w-3.5 h-3.5" />Ẩn
          </button>
          <button disabled={bulkBusy} onClick={() => setConfirmBulkDelete(true)}
            className="flex items-center gap-1 text-xs font-medium bg-red-800 hover:bg-red-700 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />Xóa
          </button>
          <button onClick={clearSelection} className="ml-auto text-xs text-gray-300 hover:text-white transition-colors">Bỏ chọn</button>
        </div>
      )}

      {loading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {testimonials.map(t => (
            <div key={t.id} className={`bg-white rounded-xl border p-4 shadow-sm hover:shadow-md transition-shadow ${selected.has(t.id) ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-200'}`}>
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-start gap-2">
                  <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggleOne(t.id)}
                    aria-label={`Chọn ${t.name}`} className="mt-1 w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer" />
                  <div>
                  <p className="font-bold text-gray-900 text-sm">{t.name}</p>
                  {t.location && <p className="text-gray-400 text-xs">{t.location}</p>}
                  <div className="flex gap-0.5 mt-1">
                    {Array.from({ length: t.rating }).map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}
                  </div>
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(t)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setConfirmDelete(t.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <p className="text-gray-600 text-xs italic line-clamp-3">"{t.content}"</p>
              <button onClick={async () => { await updateTestimonial(t.id, { is_active: !t.is_active }); await load(); }}
                className={`mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {t.is_active ? 'Đang hiển thị' : 'Đã ẩn'}
              </button>
            </div>
          ))}
          {testimonials.length === 0 && <div className="col-span-3 text-center py-8 text-gray-400 text-sm">Chưa có đánh giá nào</div>}
        </div>
      )}
      {confirmDelete && <ConfirmDialog message="Xóa đánh giá này?" onConfirm={async () => { await deleteTestimonial(confirmDelete); setConfirmDelete(null); await load(); }} onCancel={() => setConfirmDelete(null)} />}
      {confirmBulkDelete && (
        <ConfirmDialog message={`Xóa ${selected.size} đánh giá đã chọn? Thao tác không thể hoàn tác.`}
          onConfirm={() => { setConfirmBulkDelete(false); runBulk(() => bulkDeleteTestimonials(selectedIds()), 'xóa'); }}
          onCancel={() => setConfirmBulkDelete(false)} />
      )}
    </div>
  );
}
