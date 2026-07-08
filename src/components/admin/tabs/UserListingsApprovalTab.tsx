import { useState, useEffect } from 'react';
import { Building2, CheckCircle, XCircle, Phone, MapPin, Clock, FileText } from 'lucide-react';
import type { UserListing } from '../../../lib/supabase';
import { adminGetUserListings, approveUserListing, rejectUserListing } from '../../../lib/api';

// ─── User Listings Approval Tab ───────────────────────────────────────────────
export function UserListingsApprovalTab({ onRefreshStats }: { onRefreshStats: () => void }) {
  const [listings, setListings] = useState<UserListing[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = async () => { setLoading(true); const data = await adminGetUserListings(statusFilter); setListings(data); setLoading(false); };
  useEffect(() => { load(); }, [statusFilter]);

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
      </div>

      {loading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        : listings.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Không có tin đăng nào trong trạng thái này</p>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map(listing => (
              <div key={listing.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex gap-4">
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
    </div>
  );
}
