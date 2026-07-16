import { useState, useEffect } from 'react';
import { Users, Trash2, Phone, MapPin, Clock, ChevronDown, RefreshCw, Download, Tag, StickyNote, AlertTriangle, CalendarClock, Split, UserPlus, X, Eye } from 'lucide-react';
import type { Lead } from '../../../lib/supabase';
import { getLeads, updateLeadStatus, updateLeadCrm, deleteLead, bulkUpdateLeadStatus, bulkDeleteLeads, leadsToCsv, bulkAssignLeads, createLead, addLeadActivity, getTeamMembers, addAssignee, removeAssignee } from '../../../lib/api';
import { leadSlaState, slaLabel, sortLeadsByUrgency } from '../../../lib/leadSla';
import { assigneesOf, assignmentPlan, memberLabel, type TeamMember } from '../../../lib/leadAssignment';
import { PIPELINE_STAGES, stageMeta } from '../../../lib/leadPipeline';
import { LeadDetailDrawer } from './LeadDetailDrawer';
import { PropertyPicker } from '../shared/PropertyPicker';
import { AssigneePicker } from '../shared/AssigneePicker';
import { FunnelReport } from '../shared/FunnelReport';
import { AcquisitionFunnel } from '../shared/AcquisitionFunnel';
import { useAuth } from '../../../lib/auth';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { leadSourceLabel } from '../../../lib/leadSource';

// ISO (UTC) → giá trị cho input datetime-local (giờ địa phương, không timezone).
function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ─── Leads Tab ────────────────────────────────────────────────────────────────
export function LeadsTab({ onRefreshStats }: { onRefreshStats: () => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [roster, setRoster] = useState<TeamMember[]>([]);   // NV admin/staff để gán
  const [confirmDistribute, setConfirmDistribute] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [creating, setCreating] = useState(false);
  const emptyForm = { full_name: '', phone: '', area_interest: '', budget: '', message: '', assignee_ids: [] as string[], status: 'new' as Lead['status'], property_id: null as string | null, property_title: null as string | null };
  const [createForm, setCreateForm] = useState(emptyForm);
  const [createBusy, setCreateBusy] = useState(false);
  const [createErr, setCreateErr] = useState('');
  const [detailLead, setDetailLead] = useState<Lead | null>(null);

  const { user } = useAuth();
  const authorLabel = (user?.user_metadata?.display_name as string | undefined)?.trim() || user?.email || 'Admin';

  const load = async () => { setLoading(true); const data = await getLeads(statusFilter); setLeads(data); setLoading(false); };
  useEffect(() => { load(); }, [statusFilter]);

  // Cập nhật mốc "now" định kỳ để badge SLA tự đổi khi lead quá hạn theo thời gian thực.
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  // Tải roster NV (admin+staff) 1 lần cho picker gán. Lỗi → roster rỗng (ẩn nút thêm).
  useEffect(() => {
    getTeamMembers().then(setRoster).catch(() => setRoster([]));
  }, []);

  // Tự chia đều lead CHƯA gán (đang hiển thị) cho các NV theo round-robin (user_id).
  const unassignedVisible = leads.filter(l => (l.lead_assignments?.length ?? 0) === 0);
  const handleDistribute = async () => {
    setConfirmDistribute(false);
    const plan = assignmentPlan(unassignedVisible.map(l => l.id), roster.map(m => m.id));
    if (plan.length === 0) return;
    setBulkBusy(true);
    try {
      await bulkAssignLeads(plan);
      await load();
    } catch (e) {
      alert(`Chia lead thất bại: ${(e as { message?: string })?.message ?? 'Lỗi không xác định'}`);
    } finally { setBulkBusy(false); }
  };

  // Thêm/gỡ NV phụ trách 1 lead (từ card) → ghi activity + cập nhật local, không reload cả trang.
  const handleAddAssignee = async (leadId: string, userId: string) => {
    await addAssignee(leadId, userId, user?.id ?? null);
    setLeads(prev => prev.map(l => l.id === leadId
      ? { ...l, lead_assignments: [...(l.lead_assignments ?? []), { user_id: userId }] } : l));
    const m = roster.find(r => r.id === userId);
    await addLeadActivity(leadId, { kind: 'note', author: authorLabel, body: `Thêm phụ trách: ${m ? memberLabel(m) : userId}` });
  };
  const handleRemoveAssignee = async (leadId: string, userId: string) => {
    await removeAssignee(leadId, userId);
    setLeads(prev => prev.map(l => l.id === leadId
      ? { ...l, lead_assignments: (l.lead_assignments ?? []).filter(a => a.user_id !== userId) } : l));
    const m = roster.find(r => r.id === userId);
    await addLeadActivity(leadId, { kind: 'note', author: authorLabel, body: `Gỡ phụ trách: ${m ? memberLabel(m) : userId}` });
  };

  // Tạo khách thủ công (admin nhập tay). Validate họ tên + SĐT trước khi gọi API.
  const openCreate = () => { setCreateForm(emptyForm); setCreateErr(''); setCreating(true); };
  const handleCreate = async () => {
    if (!createForm.full_name.trim() || !createForm.phone.trim()) {
      setCreateErr('Vui lòng nhập họ tên và số điện thoại.');
      return;
    }
    setCreateBusy(true); setCreateErr('');
    try {
      await createLead({
        full_name: createForm.full_name.trim(), phone: createForm.phone.trim(),
        area_interest: createForm.area_interest.trim() || null,
        budget: createForm.budget.trim() || null,
        message: createForm.message.trim() || null,
        assignee_ids: createForm.assignee_ids,
        creator_id: user?.id ?? null,
        author: authorLabel,
        status: createForm.status,
        property_id: createForm.property_id,
      });
      setCreating(false);
      await load(); onRefreshStats();
    } catch (e) {
      setCreateErr(`Tạo khách thất bại: ${(e as { message?: string })?.message ?? 'Lỗi không xác định'}`);
    } finally { setCreateBusy(false); }
  };

  const handleStatus = async (id: string, status: Lead['status']) => {
    const prev = leads.find(l => l.id === id)?.status;
    await updateLeadStatus(id, status);
    if (prev && prev !== status) {
      await addLeadActivity(id, { kind: 'stage_change', author: authorLabel, body: `${stageMeta(prev).label} → ${stageMeta(status).label}` });
    }
    await load(); onRefreshStats();
  };
  const handleDelete = async (id: string) => {
    await deleteLead(id); setConfirmDelete(null); await load(); onRefreshStats();
  };

  // CRM: lưu ghi chú + nhân viên phụ trách (blur/enter mới gọi API, không spam).
  // Ghi vào nhật ký để hành trình chăm sóc đầy đủ dù thao tác ngoài drawer.
  const handleCrmSave = async (id: string, patch: { note?: string | null; follow_up_at?: string | null }) => {
    await updateLeadCrm(id, patch);
    setLeads(prev => prev.map(l => l.id === id ? { ...l, ...patch } : l));
    if ('follow_up_at' in patch) {
      await addLeadActivity(id, { kind: 'follow_up', author: authorLabel, body: patch.follow_up_at ? new Date(patch.follow_up_at).toLocaleString('vi-VN') : 'Xóa hẹn gọi lại' });
    }
    if ('note' in patch) {
      await addLeadActivity(id, { kind: 'note', author: authorLabel, body: patch.note ? `Ghi chú: ${patch.note}` : 'Xóa ghi chú' });
    }
  };

  // Xuất CSV danh sách lead đang hiển thị (theo filter hiện tại).
  const handleExportCsv = () => {
    const csv = leadsToCsv(leads, roster);
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

  // Sắp xếp theo độ khẩn (quá hạn → cần gọi hôm nay → mới nhất) + đếm quá hạn.
  const sortedLeads = sortLeadsByUrgency(leads, now);
  const overdueCount = leads.filter(l => leadSlaState(l, now) === 'overdue').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={openCreate}
          className="flex items-center gap-1 px-3 py-1.5 text-sm font-semibold rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors">
          <UserPlus className="w-4 h-4" />Tạo khách mới
        </button>
        <button onClick={() => setStatusFilter('all')}
          className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${statusFilter === 'all' ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-red-400'}`}>
          Tất cả
        </button>
        {PIPELINE_STAGES.map(s => (
          <button key={s.key} onClick={() => setStatusFilter(s.key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${statusFilter === s.key ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-red-400'}`}>
            {s.label}
          </button>
        ))}
        {overdueCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
            <AlertTriangle className="w-3.5 h-3.5" />{overdueCount} quá hạn
          </span>
        )}
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
        {roster.length > 0 && unassignedVisible.length > 0 && (
          <button disabled={bulkBusy} onClick={() => setConfirmDistribute(true)}
            className="text-xs text-gray-500 hover:text-gray-700 disabled:opacity-50 flex items-center gap-1">
            <Split className="w-3.5 h-3.5" />Tự chia đều ({unassignedVisible.length})
          </button>
        )}
        {leads.length > 0 && (
          <button onClick={handleExportCsv} className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
            <Download className="w-3.5 h-3.5" />Xuất CSV
          </button>
        )}
      </div>

      {statusFilter === 'all' && !loading && (
        <>
          <AcquisitionFunnel leads={leads} />
          <FunnelReport leads={leads} roster={roster} />
        </>
      )}

      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-gray-900 text-white rounded-xl px-4 py-2.5 animate-fade-in">
          <span className="text-sm font-semibold mr-1">Đã chọn {selected.size}</span>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateLeadStatus(selectedIds(), 'contacted'), 'đã liên hệ')}
            className="text-xs font-medium bg-cyan-500 hover:bg-cyan-400 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">Đã liên hệ</button>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateLeadStatus(selectedIds(), 'won'), 'chốt')}
            className="text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">Chốt</button>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateLeadStatus(selectedIds(), 'lost'), 'mất')}
            className="text-xs font-medium bg-gray-600 hover:bg-gray-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">Mất</button>
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
            {sortedLeads.map(lead => {
              const sla = leadSlaState(lead, now);
              const slaBorder = sla === 'overdue' ? 'border-red-400 bg-red-50/40'
                : sla === 'due_soon' ? 'border-amber-300 bg-amber-50/40' : 'border-gray-200';
              return (
              <div key={lead.id} className={`bg-white rounded-xl border shadow-sm p-4 hover:shadow-md transition-shadow ${selected.has(lead.id) ? 'border-red-400 ring-1 ring-red-300' : slaBorder}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <input type="checkbox" checked={selected.has(lead.id)} onChange={() => toggleOne(lead.id)}
                      aria-label={`Chọn ${lead.full_name}`} className="mt-1 w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-gray-900 text-sm">{lead.full_name}</h4>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${stageMeta(lead.status).color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${stageMeta(lead.status).dot}`} />
                        {stageMeta(lead.status).label}
                      </span>
                      {(sla === 'overdue' || sla === 'due_soon') && (
                        <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${sla === 'overdue' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                          <AlertTriangle className="w-3 h-3" />{slaLabel(sla)}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>
                      {lead.area_interest && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.area_interest}</span>}
                      {lead.source && <span className="flex items-center gap-1 text-violet-600"><Tag className="w-3 h-3" />{leadSourceLabel(lead.source)}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(lead.created_at).toLocaleString('vi-VN')}</span>
                    </div>
                    {lead.message && <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5 italic">"{lead.message}"</p>}
                    {lead.properties && <p className="mt-1 text-xs text-blue-600">BĐS: {lead.properties.title}</p>}
                    <div className="mt-2 flex flex-wrap gap-2">
                      <div className="flex items-center gap-1 flex-1 min-w-[200px]">
                        <AssigneePicker compact assignees={assigneesOf(lead, roster)} roster={roster}
                          onAdd={uid => handleAddAssignee(lead.id, uid)}
                          onRemove={uid => handleRemoveAssignee(lead.id, uid)} />
                      </div>
                      <div className="flex items-center gap-1 flex-1 min-w-[180px]">
                        <StickyNote className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <input defaultValue={lead.note ?? ''} placeholder="Ghi chú nội bộ"
                          onBlur={e => { const v = e.target.value.trim() || null; if (v !== (lead.note ?? null)) handleCrmSave(lead.id, { note: v }); }}
                          className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 focus:ring-1 focus:ring-red-400 focus:border-red-400 outline-none" />
                      </div>
                      <div className="flex items-center gap-1 flex-1 min-w-[170px]">
                        <CalendarClock className="w-3 h-3 text-gray-400 flex-shrink-0" />
                        <input type="datetime-local" value={isoToLocalInput(lead.follow_up_at)} aria-label="Hẹn gọi lại"
                          onChange={e => { const v = e.target.value ? new Date(e.target.value).toISOString() : null; handleCrmSave(lead.id, { follow_up_at: v }); }}
                          className="w-full text-xs border border-gray-200 rounded-md px-2 py-1 focus:ring-1 focus:ring-red-400 focus:border-red-400 outline-none" />
                      </div>
                    </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => setDetailLead(lead)} className="flex items-center gap-1 bg-gray-900 hover:bg-gray-800 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                      <Eye className="w-3 h-3" />Chi tiết
                    </button>
                    <a href={`tel:${lead.phone}`} className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                      <Phone className="w-3 h-3" />Gọi
                    </a>
                    <div className="relative group">
                      <button className="flex items-center gap-1 border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                        Trạng thái <ChevronDown className="w-3 h-3" />
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10 hidden group-hover:block min-w-[150px]">
                        {PIPELINE_STAGES.map(s => (
                          <button key={s.key} onClick={() => handleStatus(lead.id, s.key)}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${lead.status === s.key ? 'font-bold text-red-600' : 'text-gray-700'}`}>
                            {s.label}
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
              );
            })}
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
      {confirmDistribute && (
        <ConfirmDialog message={`Tự chia đều ${unassignedVisible.length} lead chưa gán cho ${roster.length} nhân viên?`}
          onConfirm={handleDistribute} onCancel={() => setConfirmDistribute(false)} />
      )}

      {detailLead && (
        <LeadDetailDrawer lead={detailLead} author={authorLabel}
          onClose={() => setDetailLead(null)} onChanged={load} />
      )}

      {creating && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-10">
          <div className="absolute inset-0 bg-black/50" onClick={() => !createBusy && setCreating(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-red-600" />Tạo khách mới
              </h3>
              <button onClick={() => !createBusy && setCreating(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            {createErr && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{createErr}</p>}
            <div className="grid grid-cols-2 gap-3">
              <input value={createForm.full_name} onChange={e => setCreateForm(f => ({ ...f, full_name: e.target.value }))}
                placeholder="Họ và tên *" className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 outline-none" />
              <input value={createForm.phone} onChange={e => setCreateForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="Số điện thoại *" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 outline-none" />
              <input value={createForm.area_interest} onChange={e => setCreateForm(f => ({ ...f, area_interest: e.target.value }))}
                placeholder="Khu vực quan tâm" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 outline-none" />
              <input value={createForm.budget} onChange={e => setCreateForm(f => ({ ...f, budget: e.target.value }))}
                placeholder="Ngân sách" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 outline-none" />
              <select value={createForm.status} onChange={e => setCreateForm(f => ({ ...f, status: e.target.value as Lead['status'] }))}
                className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-red-400 outline-none">
                {PIPELINE_STAGES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              {roster.length > 0 && (
                <div className="col-span-2 border border-gray-200 rounded-lg px-3 py-2.5">
                  <AssigneePicker
                    assignees={createForm.assignee_ids.map(id => ({ id, label: memberLabel(roster.find(m => m.id === id) ?? { id, display_name: null, phone: null }) }))}
                    roster={roster}
                    onAdd={uid => setCreateForm(f => ({ ...f, assignee_ids: [...f.assignee_ids, uid] }))}
                    onRemove={uid => setCreateForm(f => ({ ...f, assignee_ids: f.assignee_ids.filter(x => x !== uid) }))} />
                </div>
              )}
              <div className="col-span-2">
                <PropertyPicker value={createForm.property_id} valueLabel={createForm.property_title}
                  onChange={(id, title) => setCreateForm(f => ({ ...f, property_id: id, property_title: title }))} />
              </div>
              <textarea value={createForm.message} onChange={e => setCreateForm(f => ({ ...f, message: e.target.value }))}
                placeholder="Nhu cầu / ghi chú" rows={3} className="col-span-2 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 outline-none resize-none" />
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setCreating(false)} disabled={createBusy}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Hủy</button>
              <button onClick={handleCreate} disabled={createBusy}
                className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors">
                {createBusy ? 'Đang tạo...' : 'Tạo khách'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
