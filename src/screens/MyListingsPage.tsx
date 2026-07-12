'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, CheckCircle, XCircle, Trash2, Plus, AlertCircle, Building2, RefreshCw, Pencil } from 'lucide-react';
import { type UserListing } from '../lib/supabase';
import { getMyListings, deleteMyListing, submitUserListing } from '../lib/api';
import { qk } from '../lib/queryKeys';
import { type Page, scrollTop } from '../lib/router';
import { Breadcrumb } from '../components/Layout';

interface MyListingsPageProps {
  onNavigate: (p: Page) => void;
  embedded?: boolean;   // true = render trong hub Tài khoản, bỏ header riêng
}

const STATUS_MAP = {
  pending: { label: 'Chờ duyệt', icon: <Clock className="w-3.5 h-3.5" />, cls: 'bg-amber-100 text-amber-700' },
  approved: { label: 'Đã duyệt', icon: <CheckCircle className="w-3.5 h-3.5" />, cls: 'bg-emerald-100 text-emerald-700' },
  rejected: { label: 'Từ chối', icon: <XCircle className="w-3.5 h-3.5" />, cls: 'bg-red-100 text-red-700' },
};

export function MyListingsPage({ onNavigate, embedded }: MyListingsPageProps) {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [tab, setTab] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [resubmitting, setResubmitting] = useState<string | null>(null);

  const { data: listings = [], isLoading: loading } = useQuery({
    queryKey: qk.myListings(),
    queryFn: getMyListings,
  });

  const filtered = tab === 'all' ? listings : listings.filter(l => l.status === tab);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteMyListing(id),
    onSuccess: () => {
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: qk.myListings() });
    },
  });
  const handleDelete = (id: string) => deleteMutation.mutate(id);

  const resubmitMutation = useMutation({
    mutationFn: async (listing: UserListing) => {
      // Xóa tin bị từ chối rồi đăng lại mới
      await deleteMyListing(listing.id);
      const { id, user_id, status, reject_reason, created_at, updated_at, areas, property_types, profiles, ...rest } = listing;
      await submitUserListing(rest);
    },
    onMutate: (listing) => setResubmitting(listing.id),
    onSettled: () => {
      setResubmitting(null);
      queryClient.invalidateQueries({ queryKey: qk.myListings() });
    },
  });
  const handleResubmit = (listing: UserListing) => resubmitMutation.mutate(listing);

  const counts = {
    all: listings.length,
    pending: listings.filter(l => l.status === 'pending').length,
    approved: listings.filter(l => l.status === 'approved').length,
    rejected: listings.filter(l => l.status === 'rejected').length,
  };

  return (
    <div className={embedded ? '' : 'min-h-screen bg-gray-50'}>
      {!embedded && (
        <div className="bg-white border-b border-gray-100 shadow-sm">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <Breadcrumb items={[
              { label: 'Trang chủ', onClick: () => { onNavigate({ name: 'home' }); scrollTop(); } },
              { label: 'Tin đăng của tôi' },
            ]} />
            <div className="flex items-center justify-between">
              <div>
                <h1 className="font-black text-xl text-gray-900">Tin đăng của tôi</h1>
                <p className="text-gray-500 text-xs mt-0.5">Quản lý và theo dõi trạng thái tin đăng</p>
              </div>
              <button onClick={() => { onNavigate({ name: 'post-listing' }); scrollTop(); }}
                className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
                <Plus className="w-4 h-4" />Đăng tin mới
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={embedded ? '' : 'max-w-5xl mx-auto px-4 py-5'}>
        {embedded && (
          <div className="flex justify-end mb-4">
            <button onClick={() => { onNavigate({ name: 'post-listing' }); scrollTop(); }}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors">
              <Plus className="w-4 h-4" />Đăng tin mới
            </button>
          </div>
        )}
        {/* Tabs */}
        <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
          {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
            <button key={s} onClick={() => setTab(s)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold flex-shrink-0 transition-colors ${tab === s ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-red-400'}`}>
              {s === 'all' ? 'Tất cả' : STATUS_MAP[s].label}
              <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${tab === s ? 'bg-white/20 text-white' : 'bg-gray-100 text-gray-600'}`}>
                {counts[s]}
              </span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl h-28 animate-pulse border border-gray-100" />
          ))}</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
            <Building2 className="w-14 h-14 text-gray-200 mx-auto mb-3" />
            <p className="text-gray-600 font-semibold">Chưa có tin đăng nào</p>
            <p className="text-gray-400 text-sm mt-1">Bắt đầu đăng tin để tiếp cận hàng nghìn người mua</p>
            <button onClick={() => { onNavigate({ name: 'post-listing' }); scrollTop(); }}
              className="mt-4 bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-xl text-sm transition-colors">
              Đăng tin ngay
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map(listing => {
              const status = STATUS_MAP[listing.status];
              return (
                <div key={listing.id} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition-shadow">
                  <div className="flex gap-4">
                    <div className="w-24 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100">
                      {listing.image_url
                        ? <img src={listing.image_url} alt={listing.title} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><Building2 className="w-8 h-8 text-gray-300" /></div>
                      }
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-gray-900 text-sm line-clamp-2">{listing.title}</h3>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${status.cls}`}>
                          {status.icon}{status.label}
                        </span>
                      </div>
                      <p className="text-red-600 font-bold text-base mt-0.5">
                        {listing.price} {listing.price_unit}
                      </p>
                      <div className="flex items-center gap-3 text-gray-400 text-xs mt-1 flex-wrap">
                        <span>{listing.city}</span>
                        {listing.area_sqm && <span>{listing.area_sqm} m²</span>}
                        <span>{new Date(listing.created_at).toLocaleDateString('vi-VN')}</span>
                      </div>
                      {listing.status === 'rejected' && listing.reject_reason && (
                        <div className="mt-2 bg-red-50 border border-red-100 text-red-700 text-xs rounded-lg px-3 py-2 flex items-start gap-1.5">
                          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <span><strong>Lý do từ chối:</strong> {listing.reject_reason}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => { onNavigate({ name: 'post-listing', id: listing.id }); scrollTop(); }}
                        className="p-2 text-gray-500 hover:bg-gray-100 hover:text-red-600 rounded-lg transition-colors" title="Sửa tin">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => setConfirmDelete(listing.id)}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Xóa">
                        <Trash2 className="w-4 h-4" />
                      </button>
                      {listing.status === 'rejected' && (
                        <button
                          onClick={() => handleResubmit(listing)}
                          disabled={resubmitting === listing.id}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
                          title="Gửi lại để xét duyệt"
                        >
                          {resubmitting === listing.id
                            ? <><div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />Đang gửi...</>
                            : <><RefreshCw className="w-3 h-3" />Gửi lại</>
                          }
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-gray-900 mb-2">Xóa tin đăng?</h3>
            <p className="text-gray-500 text-sm mb-4">Hành động này không thể hoàn tác.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">Hủy</button>
              <button onClick={() => handleDelete(confirmDelete)} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}