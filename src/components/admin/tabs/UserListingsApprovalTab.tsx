import { useState, useEffect } from 'react';
import { Building2, CheckCircle, XCircle, Phone, MapPin, Clock, FileText } from 'lucide-react';
import type { UserListing } from '../../../lib/supabase';
import { adminGetUserListings, approveUserListing, rejectUserListing, bulkApproveUserListings, bulkRejectUserListings } from '../../../lib/api';

// ─── User Listings Approval Tab ───────────────────────────────────────────────
export function UserListingsApprovalTab({ onRefreshStats }: { onRefreshStats: () => void }) {
  const [listings, setListings] = useState<UserListing[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkRejectModal, setBulkRejectModal] = useState(false);

  const load = async () => { setLoading(true); const data = await adminGetUserListings(statusFilter); setListings(data); setLoading(false); };
  useEffect(() => { load(); }, [statusFilter]);
  // Đổi filter thì bỏ chọn để tránh giữ id không còn hiển thị.
  useEffect(() => { setSelected(new Set()); }, [statusFilter]);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try { await approveUserListing(id); await load(); onRefreshStats(); }
    catch (e) { console.error("[AdminPanel]", e); } finally { setProcessingId(null); }
  };
  const handleReject = async () => {
    if (!rejectModal) return;
    setProcessingId(rejectModal);
    try { await rejectUserListing(rejectModal, rejectReason || 'Không đáp ứng yêu cầu đăng tin'); await load(); onRefreshStats(); }
    catch (e) { console.error("[AdminPanel]", e); } finally { setProcessingId(null); setRejectModal(null); setRejectReason(''); }
  };

  // ─── Bulk helpers ─────────────────────────────────────────────────────────
  // Chỉ cho chọn tin đang chờ duyệt — duyệt/từ chối tin đã xử lý là vô nghĩa.
  const pendingIds = listings.filter(l => l.status === 'pending').map(l => l.id);
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const allSelected = pendingIds.length > 0 && pendingIds.every(id => selected.has(id));
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(pendingIds));
  const clearSelection = () => setSelected(new Set());
  const selectedIds = () => Array.from(selected);
  const runBulk = async (fn: () => Promise<number>, label: string) => {
    setBulkBusy(true);
    try {
      const n = await fn();
      clearSelection();
      await load(); onRefreshStats();
      console.info(`[AdminPanel] Bulk ${label}: ${n} tin`);
    } catch (e) {
      console.error(`[AdminPanel] Bulk ${label} thất bại:`, e);
      alert(`Thao tác hàng loạt thất bại: ${(e as { message?: string })?.message ?? 'Lỗi không xác định'}`);
    } finally { setBulkBusy(false); }
  };
  const handleBulkReject = () => {
    const reason = rejectReason || 'Không đáp ứng yêu cầu đăng tin';
    setBulkRejectModal(false); setRejectReason('');
    runBulk(() => bulkRejectUserListings(selectedIds(), reason), 'từ chối');
  };

  const STATUS_CONFIG = {
    pending: { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-700' },
    approved: { label: 'Đã duyệt', cls: 'bg-emerald-100 text-emerald-700' },
    rejected: { label: 'Từ chối', cls: 'bg-red-100 text-red-700' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${statusFilter === s ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-red-400'}`}>
            {s === 'all' ? 'Tất cả' : STATUS_CONFIG[s]?.label}
          </button>
        ))}
        {pendingIds.length > 0 && (
          <label className="ml-auto flex items-center gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input type="checkbox" checked={allSelected} onChange={toggleAll}
              aria-label="Chọn tất cả tin chờ duyệt" className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer" />
            Chọn tất cả chờ duyệt
          </label>
        )}
      </div>

      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-gray-900 text-white rounded-xl px-4 py-2.5 animate-fade-in">
          <span className="text-sm font-semibold mr-1">Đã chọn {selected.size}</span>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkApproveUserListings(selectedIds()), 'duyệt')}
            className="flex items-center gap-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <CheckCircle className="w-3.5 h-3.5" />{bulkBusy ? 'Đang xử lý...' : 'Duyệt'}
          </button>
          <button disabled={bulkBusy} onClick={() => { setRejectReason(''); setBulkRejectModal(true); }}
            className="flex items-center gap-1 text-xs font-medium bg-red-800 hover:bg-red-700 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <XCircle className="w-3.5 h-3.5" />Từ chối
          </button>
          <button onClick={clearSelection} className="ml-auto text-xs text-gray-300 hover:text-white transition-colors">Bỏ chọn</button>
        </div>
      )}

      {loading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        : listings.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Không có tin đăng nào trong trạng thái này</p>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map(listing => (
              <div key={listing.id} className={`bg-white rounded-xl border p-4 shadow-sm ${selected.has(listing.id) ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-200'}`}>
                <div className="flex gap-4">
                  {listing.status === 'pending' && (
                    <input type="checkbox" checked={selected.has(listing.id)} onChange={() => toggleOne(listing.id)}
                      aria-label={`Chọn ${listing.title}`} className="mt-1 w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer flex-shrink-0" />
                  )}
                  <div className="w-20 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100">
                    {listing.image_url
                      ? <img src={listing.image_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Building2 className="w-6 h-6 text-gray-300" /></div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm line-clamp-1">{listing.title}</h4>
                        <p className="text-red-600 font-bold text-sm">{listing.price} {listing.price_unit}</p>
                        <div className="flex gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{listing.city}</span>
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{listing.contact_phone}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(listing.created_at).toLocaleString('vi-VN')}</span>
                        </div>
                        {listing.status === 'rejected' && listing.reject_reason && (
                          <p className="text-xs text-red-600 mt-1 bg-red-50 px-2 py-1 rounded">Lý do: {listing.reject_reason}</p>
                        )}
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_CONFIG[listing.status].cls}`}>
                        {STATUS_CONFIG[listing.status].label}
                      </span>
                    </div>
                  </div>
                  {listing.status === 'pending' && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => handleApprove(listing.id)} disabled={processingId === listing.id}
                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
                        <CheckCircle className="w-3.5 h-3.5" />Duyệt
                      </button>
                      <button onClick={() => { setRejectModal(listing.id); setRejectReason(''); }}
                        className="flex items-center gap-1 border border-red-300 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                        <XCircle className="w-3.5 h-3.5" />Từ chối
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRejectModal(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-gray-900 mb-3">Từ chối tin đăng</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Lý do từ chối (không bắt buộc)..." rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm">Hủy</button>
              <button onClick={handleReject} disabled={!!processingId}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60">
                {processingId ? 'Đang xử lý...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}

      {bulkRejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setBulkRejectModal(false)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-gray-900 mb-3">Từ chối {selected.size} tin đăng đã chọn</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Lý do từ chối (áp dụng cho tất cả tin đã chọn)..." rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setBulkRejectModal(false)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm">Hủy</button>
              <button onClick={handleBulkReject} disabled={bulkBusy}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60">
                {bulkBusy ? 'Đang xử lý...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
