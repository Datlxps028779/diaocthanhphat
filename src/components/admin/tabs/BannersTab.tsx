import { useState, useEffect } from 'react';
import { X, Eye, Plus, Edit2, Trash2, Save, Image as ImageIcon, MousePointer, CheckCircle, XCircle } from 'lucide-react';
import type { Banner } from '../../../lib/supabase';
import { adminGetAllBanners, createBanner, updateBanner, deleteBanner, bulkUpdateBanners, bulkDeleteBanners } from '../../../lib/api';
import { ImageUrlInput } from '../../ImageUpload';
import { ConfirmDialog } from '../shared/ConfirmDialog';

// ─── Banners Tab ──────────────────────────────────────────────────────────────
export function BannersTab() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const load = async () => { setLoading(true); const d = await adminGetAllBanners(); setBanners(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  // ─── Bulk helpers ─────────────────────────────────────────────────────────
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allIds = banners.map(b => b.id);
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
      console.info(`[AdminPanel] Bulk ${label}: ${n} banner`);
    } catch (e) {
      console.error(`[AdminPanel] Bulk ${label} thất bại:`, e);
      alert(`Thao tác hàng loạt thất bại: ${(e as { message?: string })?.message ?? 'Lỗi không xác định'}`);
    } finally { setBulkBusy(false); }
  };

  const [form, setForm] = useState<Partial<Banner>>({
    title: '', subtitle: '', cta_text: '', cta_link: '',
    image_url: '', bg_color: '#dc2626', position: 'hero', is_active: true, order_index: 0,
  });

  const openCreate = () => {
    setForm({ title: '', subtitle: '', cta_text: '', cta_link: '', image_url: '', bg_color: '#dc2626', position: 'hero', is_active: true, order_index: banners.length });
    setCreating(true);
  };
  const openEdit = (b: Banner) => { setForm(b); setEditing(b); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) await createBanner(form as Omit<Banner, 'id' | 'created_at' | 'updated_at'>);
      else if (editing) await updateBanner(editing.id, form);
      await load(); setEditing(null); setCreating(false);
    } catch (e) { console.error("[AdminPanel]", e); } finally { setSaving(false); }
  };

  const POSITION_LABELS: Record<string, string> = {
    hero: 'Hero (Trang chủ)', sidebar: 'Sidebar', footer_cta: 'CTA Footer', listings_top: 'Đầu trang listing',
  };

  if (creating || editing) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-gray-900 text-lg">{editing ? 'Sửa banner' : 'Thêm banner mới'}</h2>
          <button onClick={() => { setEditing(null); setCreating(false); }}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Vị trí hiển thị</label>
            <select value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value as Banner['position'] }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
              {Object.entries(POSITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {[
            { key: 'title', label: 'Tiêu đề *' },
            { key: 'subtitle', label: 'Mô tả phụ' },
            { key: 'cta_text', label: 'Nội dung nút' },
            { key: 'cta_link', label: 'Link nút' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-semibold text-gray-700 block mb-1">{f.label}</label>
              <input value={(form as Record<string, string>)[f.key] ?? ''}
                onChange={e => setForm(ff => ({ ...ff, [f.key]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
          ))}
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Ảnh nền</label>
            <ImageUrlInput value={form.image_url ?? ''} onChange={url => setForm(f => ({ ...f, image_url: url }))} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Màu nền dự phòng</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.bg_color ?? '#dc2626'}
                onChange={e => setForm(f => ({ ...f, bg_color: e.target.value }))}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200" />
              <input type="text" value={form.bg_color ?? ''}
                onChange={e => setForm(f => ({ ...f, bg_color: e.target.value }))}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="accent-red-500 w-4 h-4" />
            <span className="text-sm font-medium text-gray-700">Đang hiển thị</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
          <button onClick={() => { setEditing(null); setCreating(false); }} className="border border-gray-200 text-gray-600 px-5 py-2.5 rounded-lg text-sm">Hủy</button>
          <button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm flex items-center gap-2">
            <Save className="w-4 h-4" />{saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {banners.length > 0 ? (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={allSelected} onChange={toggleAll}
              aria-label="Chọn tất cả" className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer" />
            Chọn tất cả
          </label>
        ) : <span />}
        <button onClick={openCreate} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm">
          <Plus className="w-4 h-4" />Thêm banner
        </button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-gray-900 text-white rounded-xl px-4 py-2.5 animate-fade-in">
          <span className="text-sm font-semibold mr-1">Đã chọn {selected.size}</span>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateBanners(selectedIds(), { is_active: true }), 'hiện')}
            className="flex items-center gap-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <CheckCircle className="w-3.5 h-3.5" />Hiện
          </button>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateBanners(selectedIds(), { is_active: false }), 'ẩn')}
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
        <div className="space-y-3">
          {banners.map(b => (
            <div key={b.id} className={`bg-white rounded-xl border p-4 flex items-center gap-4 shadow-sm ${selected.has(b.id) ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-200'}`}>
              <input type="checkbox" checked={selected.has(b.id)} onChange={() => toggleOne(b.id)}
                aria-label={`Chọn ${b.title}`} className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer flex-shrink-0" />
              {b.image_url ? (
                <img src={b.image_url} alt={b.title} className="w-20 h-14 object-cover rounded-lg flex-shrink-0" />
              ) : (
                <div className="w-20 h-14 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: b.bg_color }}>
                  <ImageIcon className="w-6 h-6 text-white/60" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900 text-sm truncate">{b.title}</h4>
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{POSITION_LABELS[b.position] ?? b.position}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${b.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {b.is_active ? 'Hiển thị' : 'Ẩn'}
                  </span>
                </div>
                {b.subtitle && <p className="text-gray-500 text-xs mt-0.5 truncate">{b.subtitle}</p>}
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-[11px] text-gray-500">
                    <Eye className="w-3 h-3" />{(b.impressions ?? 0).toLocaleString('vi-VN')} lượt xem
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-gray-500">
                    <MousePointer className="w-3 h-3" />{(b.clicks ?? 0).toLocaleString('vi-VN')} click
                  </span>
                  {(b.impressions ?? 0) > 0 && (
                    <span className="text-[11px] text-blue-600 font-medium">
                      CTR: {((b.clicks ?? 0) / (b.impressions ?? 1) * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(b)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => setConfirmDelete(b.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {banners.length === 0 && <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">Chưa có banner nào</div>}
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog message="Xóa banner này?" onConfirm={async () => { await deleteBanner(confirmDelete); setConfirmDelete(null); await load(); }} onCancel={() => setConfirmDelete(null)} />
      )}
      {confirmBulkDelete && (
        <ConfirmDialog message={`Xóa ${selected.size} banner đã chọn? Thao tác không thể hoàn tác.`}
          onConfirm={() => { setConfirmBulkDelete(false); runBulk(() => bulkDeleteBanners(selectedIds()), 'xóa'); }}
          onCancel={() => setConfirmBulkDelete(false)} />
      )}
    </div>
  );
}
