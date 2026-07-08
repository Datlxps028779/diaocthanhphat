import { useState, useEffect } from 'react';
import { Users, Trash2, Phone, MapPin, Clock, ChevronDown, RefreshCw } from 'lucide-react';
import type { Lead } from '../../../lib/supabase';
import { getLeads, updateLeadStatus, deleteLead } from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';

// ─── Leads Tab ────────────────────────────────────────────────────────────────
export function LeadsTab({ onRefreshStats }: { onRefreshStats: () => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => { setLoading(true); const data = await getLeads(statusFilter); setLeads(data); setLoading(false); };
  useEffect(() => { load(); }, [statusFilter]);

  const handleStatus = async (id: string, status: Lead['status']) => {
    await updateLeadStatus(id, status); await load(); onRefreshStats();
  };
  const handleDelete = async (id: string) => {
    await deleteLead(id); setConfirmDelete(null); await load(); onRefreshStats();
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
        <button onClick={load} className="ml-auto text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" />Làm mới
        </button>
      </div>

      {loading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        : leads.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Chưa có khách hàng tiềm năng nào</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leads.map(lead => (
              <div key={lead.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3 flex-wrap">
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
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(lead.created_at).toLocaleString('vi-VN')}</span>
                    </div>
                    {lead.message && <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5 italic">"{lead.message}"</p>}
                    {lead.properties && <p className="mt-1 text-xs text-blue-600">BĐS: {lead.properties.title}</p>}
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
    </div>
  );
}
