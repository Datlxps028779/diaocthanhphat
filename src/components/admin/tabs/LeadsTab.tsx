import { useState, useEffect } from 'react';
import { Users, Trash2, Phone, MapPin, Clock, ChevronDown, RefreshCw, Download, Tag, UserCheck, StickyNote } from 'lucide-react';
import type { Lead } from '../../../lib/supabase';
import { getLeads, updateLeadStatus, updateLeadCrm, deleteLead, bulkUpdateLeadStatus, bulkDeleteLeads, leadsToCsv } from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';

// Nhãn nguồn lead dễ đọc (khớp các giá trị source ghi khi submitLead).
const SOURCE_LABELS: Record<string, string> = {
  property_detail_form: 'Form chi tiết',
  phone_reveal: 'Bấm hiện số',
  contact_modal: 'Popup liên hệ',
  invest_page: 'Trang đầu tư',
  about_page: 'Trang liên hệ',
};

// ─── Leads Tab ────────────────────────────────────────────────────────────────
export function LeadsTab({ onRefreshStats }: { onRefreshStats: () => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const load = async () => { setLoading(true); const data = await getLeads(statusFilter); setLeads(data); setLoading(false); };
  useEffect(() => { load(); }, [statusFilter]);

  const handleStatus = async (id: string, status: Lead['status']) => {
    await updateLeadStatus(id, status); await load(); onRefreshStats();
  };
  const handleDelete = async (id: string) => {
    await deleteLead(id); setConfirmDelete(null); await load(); onRefreshStats();
  };

  // CRM: lưu ghi chú + nhân viên phụ trách (blur/enter mới gọi API, không spam).
  const handleCrmSave = async (id: string, patch: { note?: string | null; assigned_to?: string | null }) => {
    await updateLeadCrm(id, patch);
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
  };

  // Xuất CSV danh sách lead đang hiển thị (theo filter hiện tại).
  const handleExportCsv = () => {
    const csv = leadsToCsv(leads);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `leads-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Bulk helpers ─────────────────────────────────────────────────────────
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allIds = leads.map(l => l.id);
  const allSelected = allIds.length > 0 && allIds.every(id => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(allIds));
  const clearSelection = () => setSelected(new Set());
  const selectedIds = () => Array.from(selected);
  const runBulk = async (fn: () => Promise<number>, label: string) => {
    setBulkBusy(true);
    try {
      const n = await fn();
      clearSelection();
      await load(); onRefreshStats();
      console.info(`[AdminPanel] Bulk ${label}: ${n} lead`);
    } catch (e) {
      console.error(`[AdminPanel] Bulk ${label} thất bại:`, e);
      alert(`Thao tác hàng loạt thất bại: ${(e as { message?: string })?.message ?? 'Lỗi không xác định'}`);
    } finally { setBulkBusy(false); }
  };

  const STATUS_CONFIG = {
    new: { label: 'Mới', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
    contacted: { label: 'Đã liên hệ', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
    closed: { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'new', 'contacted', 'closed'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${statusFilter === s ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-red-400'}`}>
            {s === 'all' ? 'Tất cả' : STATUS_CONFIG[s].label}
          </button>
        ))}
        {leads.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={allSelected} onChange={toggleAll}
              aria-label="Chọn tất cả" className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer" />
            Chọn tất cả
          </label>
        )}
        <button onClick={load} className={`${leads.length > 0 ? '' : 'ml-auto'} text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1`}>
          <RefreshCw className="w-3.5 h-3.5" />Làm mới
        </button>
        {leads.length > 0 && (
          <button onClick={handleExportCsv} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />Xuất CSV
          </button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-gray-900 text-white rounded-xl px-4 py-2.5 animate-fade-in">
          <span className="text-sm font-semibold mr-1">Đã chọn {selected.size}</span>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateLeadStatus(selectedIds(), 'contacted'), 'đã liên hệ')}
            className="text-xs font-medium bg-amber-500 hover:bg-amber-400 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">Đã liên hệ</button>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateLeadStatus(selectedIds(), 'closed'), 'hoàn thành')}
            className="text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">Hoàn thành</button>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateLeadStatus(selectedIds(), 'new'), 'đánh dấu mới')}
            className="text-xs font-medium bg-blue-600 hover:bg-blue-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">Đánh dấu mới</button>
          <button disabled={bulkBusy} onClick={() => setConfirmBulkDelete(true)}
            className="flex items-center gap-1 text-xs font-medium bg-red-800 hover:bg-red-700 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />Xóa
          </button>
          <button onClick={clearSelection} className="ml-auto text-xs text-gray-300 hover:text-white transition-colors">Bỏ chọn</button>
        </div>
      )}

      {loading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        : leads.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Chưa có khách hàng tiềm năng nào</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leads.map(lead => (
              <div key={lead.id} className={`bg-white rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow ${selected.has(lead.id) ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-200'}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleOne(lead.id)}
                      aria-label={`Chọn ${lead.full_name}`} className="mt-1 w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-gray-900 text-sm">{lead.full_name}</h4>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_CONFIG[lead.status].color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[lead.status].dot}`} />
                        {STATUS_CONFIG[lead.status].label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>
                      {lead.area_interest && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.area_interest}</span>}
                      {lead.source && <span className="flex items-center gap-1 text-violet-600"><Tag className="w-3 h-3" />{SOURCE_LABELS[lead.source] ?? lead.source}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(lead.created_at).toLocaleString('vi-VN')}</span>
                    </div>
                    {lead.message && <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5 italic">"{lead.message}"</p>}
                    {lead.properties && <p className="mt-1 text-xs text-blue-600">BĐS: {lead.properties.title}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <div className="flex items-center gap-1 flex-1 min-w-[140px]">
                        <UserCheck className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <input defaultValue={lead.assigned_to ?? ''} placeholder="Gán nhân viên"
                          onBlur={e => { const v = e.target.value.trim() || null; if (v !== (lead.assigned_to ?? null)) handleCrmSave(lead.id, { assigned_to: v }); }}
                          className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 focus:ring-1 focus:ring-red-400 focus:border-red-400 outline-none" />
                      </div>
                      <div className="flex items-center gap-1 flex-1 min-w-[180px]">
                        <StickyNote className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <input defaultValue={lead.note ?? ''} placeholder="Ghi chú nội bộ"
                          onBlur={e => { const v = e.target.value.trim() || null; if (v !== (lead.note ?? null)) handleCrmSave(lead.id, { note: v }); }}
                          className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 focus:ring-1 focus:ring-red-400 focus:border-red-400 outline-none" />
                      </div>
                    </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a href={`tel:${lead.phone}`} className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                      <Phone className="w-3 h-3" />Gọi
                    </a>
                    <div className="relative group">
                      <button className="flex items-center gap-1 border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                        Trạng thái <ChevronDown className="w-3 h-3" />
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10 hidden group-hover:block min-w-[140px]">
                        {(['new', 'contacted', 'closed'] as const).map(s => (
                          <button key={s} onClick={() => handleStatus(lead.id, s)}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${lead.status === s ? 'font-bold text-red-600' : 'text-gray-700'}`}>
                            {STATUS_CONFIG[s].label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setConfirmDelete(lead.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      {confirmDelete && (
        <ConfirmDialog message="Xóa khách hàng này khỏi danh sách?" onConfirm={() => handleDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      )}
      {confirmBulkDelete && (
        <ConfirmDialog message={`Xóa ${selected.size} khách hàng đã chọn? Thao tác không thể hoàn tác.`}
          onConfirm={() => { setConfirmBulkDelete(false); runBulk(() => bulkDeleteLeads(selectedIds()), 'xóa'); }}
          onCancel={() => setConfirmBulkDelete(false)} />
      )}
    </div>
  );
}
