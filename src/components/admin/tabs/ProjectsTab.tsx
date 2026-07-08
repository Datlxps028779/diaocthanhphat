import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, MapPin, CheckCircle, XCircle } from 'lucide-react';
import type { Project, Area } from '../../../lib/supabase';
import { getAreas, adminGetAllProjects, createProject, updateProject, deleteProject, bulkUpdateProjects, bulkDeleteProjects } from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { SimpleForm } from '../shared/SimpleForm';

// ─── Projects Tab ─────────────────────────────────────────────────────────────
export function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const load = async () => { setLoading(true); const [p, a] = await Promise.all([adminGetAllProjects(), getAreas()]); setProjects(p); setAreas(a); setLoading(false); };
  useEffect(() => { load(); }, []);

  // ─── Bulk helpers ─────────────────────────────────────────────────────────
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allIds = projects.map(p => p.id);
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
      console.info(`[AdminPanel] Bulk ${label}: ${n} dự án`);
    } catch (e) {
      console.error(`[AdminPanel] Bulk ${label} thất bại:`, e);
      alert(`Thao tác hàng loạt thất bại: ${(e as { message?: string })?.message ?? 'Lỗi không xác định'}`);
    } finally { setBulkBusy(false); }
  };

  const PHASE_COLORS: Record<string, string> = {
    'Đang mở bán': 'bg-emerald-100 text-emerald-700',
    'Sắp ra mắt': 'bg-amber-100 text-amber-700',
    'Đã bàn giao': 'bg-blue-100 text-blue-700',
  };

  if (creating || editing) {
    const p = editing;
    return (
      <SimpleForm
        title={p ? 'Sửa dự án' : 'Thêm dự án mới'}
        fields={[
          { name: 'name', label: 'Tên dự án *', value: p?.name ?? '', required: true },
          { name: 'location', label: 'Địa điểm', value: p?.location ?? '' },
          { name: 'city', label: 'Tỉnh/TP', value: p?.city ?? '' },
          { name: 'developer', label: 'Chủ đầu tư', value: p?.developer ?? '' },
          { name: 'phase', label: 'Giai đoạn', value: p?.phase ?? 'Đang mở bán', type: 'select', options: ['Đang mở bán', 'Sắp ra mắt', 'Đã bàn giao'] },
          { name: 'price_from', label: 'Giá từ (tỷ)', value: String(p?.price_from ?? ''), type: 'number' },
          { name: 'price_to', label: 'Giá đến (tỷ)', value: String(p?.price_to ?? ''), type: 'number' },
          { name: 'total_units', label: 'Tổng số nền/căn', value: String(p?.total_units ?? ''), type: 'number' },
          { name: 'sold_units', label: 'Đã bán', value: String(p?.sold_units ?? 0), type: 'number' },
          { name: 'image_url', label: 'URL ảnh', value: p?.image_url ?? '' },
          { name: 'description', label: 'Mô tả', value: p?.description ?? '', type: 'textarea' },
        ]}
        areaId={p?.area_id ?? ''}
        areas={areas}
        onSave={async (data) => {
          if (creating) await createProject(data as Omit<Project, 'id' | 'created_at' | 'updated_at' | 'areas'>);
          else if (editing) await updateProject(editing.id, data);
          await load(); setEditing(null); setCreating(false);
        }}
        onCancel={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {projects.length > 0 ? (
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={allSelected} onChange={toggleAll}
              aria-label="Chọn tất cả" className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer" />
            Chọn tất cả
          </label>
        ) : <span />}
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />Thêm dự án
        </button>
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-gray-900 text-white rounded-xl px-4 py-2.5 animate-fade-in">
          <span className="text-sm font-semibold mr-1">Đã chọn {selected.size}</span>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateProjects(selectedIds(), { is_active: true }), 'hiện')}
            className="flex items-center gap-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <CheckCircle className="w-3.5 h-3.5" />Hiện
          </button>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateProjects(selectedIds(), { is_active: false }), 'ẩn')}
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

      {loading ? <div className="h-40 bg-gray-100 rounded-xl animate-pulse" /> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(proj => (
            <div key={proj.id} className={`bg-white rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow ${selected.has(proj.id) ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-200'}`}>
              <div className="relative">
                <img src={proj.image_url ?? ''} alt={proj.name} className="w-full h-36 object-cover" />
                <input type="checkbox" checked={selected.has(proj.id)} onChange={() => toggleOne(proj.id)}
                  aria-label={`Chọn ${proj.name}`} className="absolute top-2 left-2 w-5 h-5 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer shadow" />
              </div>
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-gray-900 text-sm line-clamp-2">{proj.name}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${PHASE_COLORS[proj.phase] ?? 'bg-gray-100 text-gray-600'}`}>{proj.phase}</span>
                </div>
                <p className="text-xs text-gray-500 flex items-center gap-1 mb-2"><MapPin className="w-3 h-3 text-red-400" />{proj.location}</p>
                {proj.price_from && <p className="text-red-600 font-bold text-sm">Từ {proj.price_from} → {proj.price_to} tỷ</p>}
                {proj.total_units && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Đã bán: {proj.sold_units}/{proj.total_units}</span>
                      <span>{Math.round((proj.sold_units / proj.total_units) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(proj.sold_units / proj.total_units) * 100}%` }} />
                    </div>
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setEditing(proj)} className="flex-1 border border-blue-400 text-blue-600 text-xs font-semibold py-1.5 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"><Edit2 className="w-3 h-3" />Sửa</button>
                  <button onClick={() => setConfirmDelete(proj.id)} className="flex-1 border border-red-300 text-red-600 text-xs font-semibold py-1.5 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-1"><Trash2 className="w-3 h-3" />Xóa</button>
                </div>
              </div>
            </div>
          ))}
          {projects.length === 0 && <div className="col-span-3 text-center py-8 text-gray-400 text-sm">Chưa có dự án nào</div>}
        </div>
      )}
      {confirmDelete && <ConfirmDialog message="Xóa dự án này?" onConfirm={async () => { await deleteProject(confirmDelete); setConfirmDelete(null); await load(); }} onCancel={() => setConfirmDelete(null)} />}
      {confirmBulkDelete && (
        <ConfirmDialog message={`Xóa ${selected.size} dự án đã chọn? Thao tác không thể hoàn tác.`}
          onConfirm={() => { setConfirmBulkDelete(false); runBulk(() => bulkDeleteProjects(selectedIds()), 'xóa'); }}
          onCancel={() => setConfirmBulkDelete(false)} />
      )}
    </div>
  );
}
