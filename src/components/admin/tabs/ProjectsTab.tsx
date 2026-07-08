import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, MapPin } from 'lucide-react';
import type { Project, Area } from '../../../lib/supabase';
import { getAreas, adminGetAllProjects, createProject, updateProject, deleteProject } from '../../../lib/api';
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

  const load = async () => { setLoading(true); const [p, a] = await Promise.all([adminGetAllProjects(), getAreas()]); setProjects(p); setAreas(a); setLoading(false); };
  useEffect(() => { load(); }, []);

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
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />Thêm dự án
        </button>
      </div>
      {loading ? <div className="h-40 bg-gray-100 rounded-xl animate-pulse" /> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(proj => (
            <div key={proj.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <img src={proj.image_url ?? ''} alt={proj.name} className="w-full h-36 object-cover" />
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
    </div>
  );
}
