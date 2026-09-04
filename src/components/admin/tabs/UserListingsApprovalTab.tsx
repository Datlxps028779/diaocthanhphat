import { useState, useEffect, useRef } from 'react';
import { Building2, CheckCircle, XCircle, Phone, MapPin, Clock, FileText, Archive, RotateCcw, Trash2, CalendarClock, History, X, Pencil, Sparkles } from 'lucide-react';
import { PostListingPage } from '../../../screens/PostListingPage';
import type { Page } from '../../../lib/router';
import type { UserListing, UserListingLifecycleEvent } from '../../../lib/supabase';
import { adminGetUserListings, adminGetUserListingLifecycle, adminCorrectCanonicalLocationConflict, isCanonicalLocationCorrectionCandidate, approveUserListing, rejectUserListing, bulkApproveUserListings, bulkRejectUserListings, deleteMyListing, adminSetExpiry, generateUserListingSeoDraft, applyUserListingSeoDraft, rejectUserListingSeoDraft } from '../../../lib/api';
import { daysUntilExpiry, expiryLabel } from '../../../lib/listingExpiry';
import { listingLifecycleActorLabel, listingLifecycleEventLabel, listingLifecycleExpiryMetadata, listingLifecycleTransition } from '../../../lib/listingLifecycle';
import { formatPropertyPrice } from '../../../lib/listingPrice';

// ─── User Listings Approval Tab ───────────────────────────────────────────────
export function UserListingsApprovalTab({ onRefreshStats }: { onRefreshStats: () => void }) {
  const [listings, setListings] = useState<UserListing[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [deleteModal, setDeleteModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkRejectModal, setBulkRejectModal] = useState(false);
  const [historyListing, setHistoryListing] = useState<UserListing | null>(null);
  const [historyEvents, setHistoryEvents] = useState<UserListingLifecycleEvent[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [editingListing, setEditingListing] = useState<UserListing | null>(null);
  const [seoProcessingId, setSeoProcessingId] = useState<string | null>(null);
  const [correctionNotice, setCorrectionNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const historyRequest = useRef(0);

  const noOpNavigate = (_page: Page) => {};

  const load = async () => { setLoading(true); const data = await adminGetUserListings(statusFilter); setListings(data); setLoading(false); };
  useEffect(() => { load(); }, [statusFilter]);
  // Đổi filter thì bỏ chọn để tránh giữ id không còn hiển thị.
  useEffect(() => { setSelected(new Set()); }, [statusFilter]);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try { await approveUserListing(id); await load(); onRefreshStats(); }
    catch (e) { console.error("[AdminPanel]", e); } finally { setProcessingId(null); }
  };
  const handleGenerateSeo = async (id: string) => {
    setSeoProcessingId(id);
    try { await generateUserListingSeoDraft(id); await load(); }
    catch (e) { console.error('[AdminPanel] SEO AI', e); alert('Không tạo được bản nháp SEO AI. Vui lòng thử lại.'); }
    finally { setSeoProcessingId(null); }
  };
  const handleApplySeo = async (id: string) => {
    setSeoProcessingId(id);
    try { await applyUserListingSeoDraft(id); await load(); }
    catch (e) { console.error('[AdminPanel] SEO AI apply', e); alert('Không áp dụng được bản nháp SEO AI. Vui lòng kiểm tra lại.'); }
    finally { setSeoProcessingId(null); }
  };
  const handleRejectSeo = async (id: string) => {
    setSeoProcessingId(id);
    try { await rejectUserListingSeoDraft(id); await load(); }
    catch (e) { console.error('[AdminPanel] SEO AI reject', e); alert('Không bỏ được bản nháp SEO AI. Vui lòng thử lại.'); }
    finally { setSeoProcessingId(null); }
  };
  const handleCanonicalLocationCorrection = async (listing: UserListing) => {
    if (!isCanonicalLocationCorrectionCandidate(listing)) return;
    if (!window.confirm('Đồng bộ location của tin này theo property Bình Phước / Chơn Thành / Nha Bích? Chỉ 6 trường location sẽ được sửa.')) return;

    setProcessingId(listing.id);
    setCorrectionNotice(null);
    try {
      await adminCorrectCanonicalLocationConflict();
      setCorrectionNotice({ type: 'success', message: 'Đã đồng bộ location theo property canonical. Hãy chạy hậu kiểm production trước khi dọn RPC one-time.' });
      await load();
      onRefreshStats();
    } catch (e) {
      console.error('[AdminPanel] canonical location correction', e);
      setCorrectionNotice({ type: 'error', message: `Không thực hiện được correction: ${(e as { message?: string })?.message ?? 'Lỗi không xác định'}` });
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async () => {
    if (!rejectModal) return;
    setProcessingId(rejectModal);
    try { await rejectUserListing(rejectModal, rejectReason || 'Không đáp ứng yêu cầu đăng tin'); await load(); onRefreshStats(); }
    catch (e) { console.error("[AdminPanel]", e); } finally { setProcessingId(null); setRejectModal(null); setRejectReason(''); }
  };

  // Khu lưu trữ tin từ chối: khôi phục (duyệt lại) hoặc xóa vĩnh viễn.
  const handleRestore = async (id: string) => {
    setProcessingId(id);
    try { await approveUserListing(id); await load(); onRefreshStats(); }
    catch (e) { console.error("[AdminPanel]", e); } finally { setProcessingId(null); }
  };
  const handleDeleteForever = async () => {
    if (!deleteModal) return;
    setProcessingId(deleteModal);
    try { await deleteMyListing(deleteModal); await load(); onRefreshStats(); }
    catch (e) { console.error("[AdminPanel]", e); } finally { setProcessingId(null); setDeleteModal(null); }
  };

  // Admin chỉnh ngày hết hạn tin đã duyệt (input type=date → ISO cuối ngày đó).
  const handleSetExpiry = async (id: string, dateStr: string) => {
    setProcessingId(id);
    try {
      const iso = dateStr ? new Date(`${dateStr}T23:59:59`).toISOString() : null;
      await adminSetExpiry(id, iso);
      await load(); onRefreshStats();
    } catch (e) { console.error("[AdminPanel]", e); } finally { setProcessingId(null); }
  };

  const closeHistory = () => {
    historyRequest.current += 1;
    setHistoryListing(null);
    setHistoryEvents([]);
    setHistoryError(null);
    setHistoryLoading(false);
  };

  const openHistory = async (listing: UserListing) => {
    const request = historyRequest.current + 1;
    historyRequest.current = request;
    setHistoryListing(listing);
    setHistoryEvents([]);
    setHistoryError(null);
    setHistoryLoading(true);
    try {
      const events = await adminGetUserListingLifecycle(listing.id);
      if (historyRequest.current === request) setHistoryEvents(events);
    } catch (e) {
      if (historyRequest.current === request) {
        setHistoryError((e as { message?: string })?.message ?? 'Không tải được lịch sử tin đăng.');
      }
    } finally {
      if (historyRequest.current === request) setHistoryLoading(false);
    }
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
    expired: { label: 'Hết hạn', cls: 'bg-gray-200 text-gray-600' },
  };

  if (editingListing) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-gray-100">
        <div className="min-h-full py-6">
          <div className="max-w-6xl mx-auto px-4 mb-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-red-600">Kiểm duyệt nội dung</p>
              <h2 className="text-xl font-black text-gray-900">Chỉnh tin trước khi duyệt</h2>
            </div>
            <button onClick={() => setEditingListing(null)} className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-2 text-sm font-semibold text-gray-700 hover:border-gray-400">
              <X className="w-4 h-4" /> Đóng
            </button>
          </div>
          <PostListingPage
            onNavigate={noOpNavigate}
            editId={editingListing.id}
            adminMode
            onAdminSaved={async () => { setEditingListing(null); await load(); onRefreshStats(); }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {correctionNotice && (
        <div
          role="status"
          data-testid="canonical-location-correction-notice"
          className={`rounded-xl border px-4 py-3 text-sm ${correctionNotice.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-red-200 bg-red-50 text-red-700'}`}
        >
          {correctionNotice.message}
        </div>
      )}
      {statusFilter === 'rejected' && (
        <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl px-4 py-3">
          <Archive className="w-5 h-5 flex-shrink-0 text-gray-500 mt-0.5" />
          <div>
            <p className="font-semibold text-gray-900">Kho lưu trữ tin bị từ chối</p>
            <p className="text-xs text-gray-500 mt-0.5">Tin ở đây đã bị ẩn khỏi trang công khai. Bạn có thể <b>Duyệt lại</b> để khôi phục hoặc <b>Xóa hẳn</b> để gỡ vĩnh viễn.</p>
          </div>
        </div>
      )}
      {statusFilter === 'expired' && (
        <div className="flex items-start gap-2 bg-gray-50 border border-gray-200 text-gray-700 text-sm rounded-xl px-4 py-3">
          <CalendarClock className="w-5 h-5 flex-shrink-0 text-gray-500 mt-0.5" />
          <div>
            <p className="font-semibold text-gray-900">Kho tin đã hết hạn hiển thị</p>
            <p className="text-xs text-gray-500 mt-0.5">Tin quá hạn (mặc định 60 ngày) tự ẩn khỏi trang công khai. Bấm <b>Duyệt lại</b> để hiển thị tiếp với hạn mới, hoặc <b>Xóa hẳn</b> để gỡ vĩnh viễn.</p>
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'pending', 'approved', 'rejected', 'expired'] as const).map(s => (
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
                        <p className="text-red-600 font-bold text-sm">{formatPropertyPrice(listing)}</p>
                        <div className="flex gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{listing.city}</span>
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{listing.contact_phone}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(listing.created_at).toLocaleString('vi-VN')}</span>
                          {listing.status === 'approved' && (() => {
                            const d = daysUntilExpiry(listing.expires_at);
                            if (d == null) return null;
                            return (
                              <span className={`flex items-center gap-1 font-semibold ${d <= 7 ? 'text-amber-600' : 'text-gray-500'}`}>
                                <CalendarClock className="w-3 h-3" />{expiryLabel(listing.expires_at)}
                              </span>
                            );
                          })()}
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
                    <div className="w-full rounded-xl border border-violet-100 bg-violet-50/60 p-3 lg:max-w-xs">
                      <div className="flex items-center justify-between gap-2">
                        <p className="flex items-center gap-1.5 text-xs font-bold text-violet-800"><Sparkles className="h-3.5 w-3.5" /> SEO AI bản nháp</p>
                        <button
                          onClick={() => handleGenerateSeo(listing.id)}
                          disabled={seoProcessingId === listing.id}
                          data-testid={`generate-seo-${listing.id}`}
                          className="rounded-lg bg-violet-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-violet-700 disabled:opacity-60"
                        >{seoProcessingId === listing.id ? 'Đang tạo...' : listing.ai_seo_draft ? 'Tạo lại' : 'Tạo bản nháp'}</button>
                      </div>
                      {listing.ai_seo_draft ? (
                        <div className="mt-2 space-y-2 text-[11px] text-violet-900">
                          <p className="text-violet-700">Nguồn: {listing.ai_seo_draft.provenance.provider} · {new Date(listing.ai_seo_draft.provenance.generated_at).toLocaleString('vi-VN')}</p>
                          <p><b>Tags:</b> {listing.ai_seo_draft.tags.join(', ') || '—'}</p>
                          <p><b>Meta title:</b> {listing.ai_seo_draft.meta_title || '—'}</p>
                          <p><b>Meta description:</b> {listing.ai_seo_draft.meta_description || '—'}</p>
                          <div className="flex gap-2 pt-1">
                            <button
                              onClick={() => handleApplySeo(listing.id)}
                              disabled={seoProcessingId === listing.id}
                              className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >Áp dụng SEO</button>
                            <button
                              onClick={() => handleRejectSeo(listing.id)}
                              disabled={seoProcessingId === listing.id}
                              className="rounded-lg border border-violet-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-violet-700 hover:bg-violet-100 disabled:opacity-60"
                            >Bỏ bản nháp</button>
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-[11px] text-violet-700">Tạo bản nháp để xem xét trước khi duyệt. Bản nháp không tự xuất bản.</p>
                      )}
                    </div>
                  )}
                  <div className="flex flex-col gap-2 flex-shrink-0 items-stretch">
                    {listing.status === 'pending' && (
                      <>
                        <button onClick={() => setEditingListing(listing)}
                          className="flex items-center justify-center gap-1 border border-blue-300 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-50 transition-colors">
                          <Pencil className="w-3.5 h-3.5" />Xem & chỉnh
                        </button>
                        <button onClick={() => handleApprove(listing.id)} disabled={processingId === listing.id}
                          className="flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
                          <CheckCircle className="w-3.5 h-3.5" />Duyệt
                        </button>
                        <button onClick={() => { setRejectModal(listing.id); setRejectReason(''); }}
                          className="flex items-center justify-center gap-1 border border-red-300 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                          <XCircle className="w-3.5 h-3.5" />Từ chối
                        </button>
                      </>
                    )}
                    {listing.status === 'approved' && (
                      <>
                        {isCanonicalLocationCorrectionCandidate(listing) && (
                          <button
                            onClick={() => handleCanonicalLocationCorrection(listing)}
                            disabled={processingId === listing.id}
                            data-testid={`canonical-location-correction-${listing.id}`}
                            className="flex items-center justify-center gap-1 border border-amber-300 bg-amber-50 text-amber-800 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-amber-100 transition-colors disabled:opacity-60"
                            title="Đồng bộ 6 trường location theo property canonical"
                          >
                            <MapPin className="w-3.5 h-3.5" />
                            {processingId === listing.id ? 'Đang đồng bộ...' : 'Sửa location canonical'}
                          </button>
                        )}
                        <div className="flex flex-col gap-1 items-end">
                          <label className="text-[10px] text-gray-400 font-medium">Ngày hết hạn</label>
                          <input type="date" disabled={processingId === listing.id}
                            defaultValue={listing.expires_at ? listing.expires_at.slice(0, 10) : ''}
                            onChange={e => handleSetExpiry(listing.id, e.target.value)}
                            className="border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-60" />
                        </div>
                      </>
                    )}
                    {(listing.status === 'rejected' || listing.status === 'expired') && (
                      <>
                        <button onClick={() => handleRestore(listing.id)} disabled={processingId === listing.id}
                          className="flex items-center justify-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
                          title="Duyệt lại tin này (khôi phục lên công khai với hạn mới)">
                          <RotateCcw className="w-3.5 h-3.5" />Duyệt lại
                        </button>
                        <button onClick={() => setDeleteModal(listing.id)} disabled={processingId === listing.id}
                          className="flex items-center justify-center gap-1 border border-gray-300 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-60"
                          title="Xóa vĩnh viễn tin này">
                          <Trash2 className="w-3.5 h-3.5" />Xóa hẳn
                        </button>
                      </>
                    )}
                    <button onClick={() => openHistory(listing)}
                      className="flex items-center justify-center gap-1 border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:border-gray-400 hover:bg-gray-50 transition-colors"
                      aria-label={`Xem lịch sử ${listing.title}`}>
                      <History className="w-3.5 h-3.5" />Lịch sử
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      {historyListing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="listing-history-title">
          <div className="absolute inset-0 bg-black/50" onClick={closeHistory} />
          <div className="relative bg-gray-50 rounded-xl shadow-2xl max-w-lg w-full max-h-[85vh] overflow-hidden flex flex-col">
            <div className="bg-white border-b border-gray-200 px-5 py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 id="listing-history-title" className="font-bold text-gray-900">Lịch sử vòng đời</h3>
                <p className="text-xs text-gray-500 mt-0.5 truncate">{historyListing.title}</p>
              </div>
              <button onClick={closeHistory} aria-label="Đóng lịch sử tin đăng" className="text-gray-400 hover:text-gray-700 flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              {historyLoading ? (
                <div className="space-y-3" aria-label="Đang tải lịch sử">
                  {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-gray-200 rounded-xl animate-pulse" />)}
                </div>
              ) : historyError ? (
                <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
                  <p className="font-semibold">Không tải được lịch sử</p>
                  <p className="text-xs mt-1 break-words">{historyError}</p>
                  <button onClick={() => openHistory(historyListing)} className="mt-3 text-xs font-semibold underline">Thử lại</button>
                </div>
              ) : historyEvents.length === 0 ? (
                <div className="bg-white border border-gray-200 rounded-xl p-6 text-center">
                  <History className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-gray-700">Chưa có sự kiện được ghi nhận</p>
                  <p className="text-xs text-gray-400 mt-1">Nhật ký chỉ bắt đầu từ khi migration P3B được cài đặt.</p>
                </div>
              ) : (
                <ol className="space-y-3">
                  {historyEvents.map(event => {
                    const transition = listingLifecycleTransition(event);
                    const expiry = listingLifecycleExpiryMetadata(event.metadata);
                    return (
                      <li key={event.id} className="bg-white border border-gray-200 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900">{listingLifecycleEventLabel(event.event_type)}</p>
                            {transition && <p className="text-xs text-gray-600 mt-0.5">{transition}</p>}
                          </div>
                          <time className="text-[10px] text-gray-400 flex-shrink-0" dateTime={event.occurred_at}>
                            {new Date(event.occurred_at).toLocaleString('vi-VN')}
                          </time>
                        </div>
                        {event.reason && <p className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mt-2 break-words">Lý do: {event.reason}</p>}
                        {expiry && (
                          <p className="text-xs text-gray-600 bg-gray-50 rounded-lg px-3 py-2 mt-2">
                            Hạn hiển thị: {formatLifecycleDate(expiry.oldExpiresAt)} → {formatLifecycleDate(expiry.newExpiresAt)}
                          </p>
                        )}
                        <p className="text-[10px] text-gray-400 mt-2">Thực hiện bởi: {listingLifecycleActorLabel(event.actor_role)}</p>
                      </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>
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

      {deleteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDeleteModal(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-gray-900 mb-2">Xóa vĩnh viễn tin đăng?</h3>
            <p className="text-gray-500 text-sm mb-4">Tin sẽ bị gỡ hẳn khỏi hệ thống. Hành động này không thể hoàn tác.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteModal(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm">Hủy</button>
              <button onClick={handleDeleteForever} disabled={!!processingId}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60">
                {processingId ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function formatLifecycleDate(value: string | null): string {
  return value ? new Date(value).toLocaleString('vi-VN') : 'Không đặt';
}
