'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, ImageIcon, Heart, User as UserIcon, Trash2, Save, Bell, BellOff, Search as SearchIcon } from 'lucide-react';
import { type Page, scrollTop } from '../lib/router';
import { Breadcrumb } from '../components/Layout';
import { MyListingsPage } from './MyListingsPage';
import { AccountPage } from './AccountPage';
import {
  getUserMedia, deleteUserMedia, getUserMediaUsage,
  getProfile, updateProfile,
  listSavedSearches, updateSavedSearch, deleteSavedSearch,
} from '../lib/api';
import { type UserMedia, type Profile, type UserSavedSearch } from '../lib/supabase';
import { filtersToPage, CADENCE_LABELS, isAlertCadence, type SavedFilters, type AlertCadence } from '../lib/savedSearch';

export type AccountHubTab = 'listings' | 'media' | 'favorites' | 'profile' | 'saved';

interface AccountHubPageProps {
  onNavigate: (p: Page) => void;
  initialTab?: AccountHubTab;
}

const TABS: { id: AccountHubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'listings', label: 'Tin đăng', icon: <Building2 className="w-4 h-4" /> },
  { id: 'media', label: 'Kho ảnh', icon: <ImageIcon className="w-4 h-4" /> },
  { id: 'favorites', label: 'Yêu thích', icon: <Heart className="w-4 h-4" /> },
  { id: 'saved', label: 'Tìm kiếm đã lưu', icon: <SearchIcon className="w-4 h-4" /> },
  { id: 'profile', label: 'Hồ sơ', icon: <UserIcon className="w-4 h-4" /> },
];

// Hub tài khoản người dùng: gộp tin đăng, kho ảnh, yêu thích, hồ sơ vào 1 nơi có tab.
// /tin-cua-toi mở tab 'listings', /tai-khoan mở tab 'favorites' (qua initialTab).
export function AccountHubPage({ onNavigate, initialTab = 'listings' }: AccountHubPageProps) {
  const [tab, setTab] = useState<AccountHubTab>(initialTab);
  // Route /tin-cua-toi & /tai-khoan là static nên không đọc searchParams ở server —
  // seed tab từ ?tab= phía client sau khi mount (tránh lệch hydration). seeded chặn
  // effect ghi URL chạy trước khi seed xong (khỏi ghi đè ?tab= thật bằng tab mặc định).
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab');
      if (t && TABS.some(x => x.id === t)) setTab(t as AccountHubTab);
    }
    setSeeded(true);
  }, []);
  useEffect(() => {
    if (!seeded || typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    params.set('tab', tab);
    const next = `${window.location.pathname}?${params.toString()}`;
    if (window.location.pathname + window.location.search !== next) {
      window.history.replaceState(null, '', next);
    }
  }, [tab, seeded]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4">
          <Breadcrumb items={[
            { label: 'Trang chủ', onClick: () => { onNavigate({ name: 'home' }); scrollTop(); } },
            { label: 'Tài khoản của tôi' },
          ]} />
          <h1 className="font-black text-xl text-gray-900">Tài khoản của tôi</h1>
          <p className="text-gray-500 text-xs mt-0.5">Quản lý tin đăng, kho ảnh, BĐS yêu thích và hồ sơ</p>
        </div>
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 flex-shrink-0 transition-colors ${tab === t.id ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>
                {t.icon}{t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-5">
        {tab === 'listings' && <MyListingsPage onNavigate={onNavigate} embedded />}
        {tab === 'favorites' && <AccountPage onNavigate={onNavigate} embedded />}
        {tab === 'saved' && <SavedSearchesTab onNavigate={onNavigate} />}
        {tab === 'media' && <MediaTab />}
        {tab === 'profile' && <ProfileTab />}
      </div>
    </div>
  );
}

// ─── Kho ảnh ──────────────────────────────────────────────────────────────────
function MediaTab() {
  const queryClient = useQueryClient();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const { data: media = [], isLoading } = useQuery({
    queryKey: ['userMedia', 'all'],
    queryFn: () => getUserMedia(),
  });
  const { data: usage } = useQuery({
    queryKey: ['userMediaUsage'],
    queryFn: getUserMediaUsage,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUserMedia(id),
    onSuccess: () => {
      setConfirmDelete(null);
      queryClient.invalidateQueries({ queryKey: ['userMedia'] });
      queryClient.invalidateQueries({ queryKey: ['userMediaUsage'] });
    },
  });

  const usedMb = usage ? (usage.used / 1024 / 1024).toFixed(1) : '0';
  const totalMb = usage ? (usage.total / 1024 / 1024).toFixed(0) : '0';

  return (
    <div>
      {usage && (
        <div className="mb-4 bg-white rounded-xl border border-gray-100 p-4">
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="text-gray-600 font-medium">Dung lượng đã dùng</span>
            <span className="text-gray-800 font-semibold">{usedMb} / {totalMb} MB</span>
          </div>
          <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
            <div className="h-full bg-red-500 rounded-full"
              style={{ width: `${usage.total ? Math.min(100, (usage.used / usage.total) * 100) : 0}%` }} />
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square bg-white rounded-xl animate-pulse border border-gray-100" />
          ))}
        </div>
      ) : media.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <ImageIcon className="w-14 h-14 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-600 font-semibold">Kho ảnh trống</p>
          <p className="text-gray-400 text-sm mt-1">Ảnh bạn tải lên khi đăng tin sẽ xuất hiện ở đây</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
          {media.map((m: UserMedia) => (
            <div key={m.id} className="relative group">
              <img src={m.url} alt={m.filename} loading="lazy"
                className="w-full aspect-square object-cover rounded-xl border border-gray-100" />
              <button onClick={() => setConfirmDelete(m.id)}
                className="absolute top-1.5 right-1.5 w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all"
                title="Xóa ảnh">
                <Trash2 className="w-3.5 h-3.5 text-red-500" />
              </button>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDelete(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-gray-900 mb-2">Xóa ảnh?</h3>
            <p className="text-gray-500 text-sm mb-4">Ảnh sẽ bị xóa khỏi kho lưu trữ. Hành động này không thể hoàn tác.</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">Hủy</button>
              <button onClick={() => deleteMutation.mutate(confirmDelete)} disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60">Xóa</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Hồ sơ ────────────────────────────────────────────────────────────────────
function ProfileTab() {
  const queryClient = useQueryClient();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [phone, setPhone] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const { data: profile, isLoading } = useQuery<Profile | null>({
    queryKey: ['myProfile'],
    queryFn: getProfile,
  });

  // Giá trị hiển thị: state nếu user đã gõ, ngược lại lấy từ profile đã tải.
  const nameVal = displayName ?? profile?.display_name ?? '';
  const phoneVal = phone ?? profile?.phone ?? '';

  const saveMutation = useMutation({
    mutationFn: () => updateProfile({ display_name: nameVal, phone: phoneVal }),
    onSuccess: () => {
      setSaved(true);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Không lưu được hồ sơ.'),
  });

  if (isLoading) {
    return <div className="bg-white rounded-2xl border border-gray-100 h-64 animate-pulse" />;
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 max-w-lg">
      <h3 className="font-bold text-gray-900 mb-4">Thông tin cá nhân</h3>
      <div className="space-y-4">
        <div>
          <label className="text-gray-600 text-sm font-medium block mb-1.5">Họ và tên</label>
          <input value={nameVal} onChange={e => { setDisplayName(e.target.value); setSaved(false); }}
            placeholder="Nguyễn Văn A"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
        <div>
          <label className="text-gray-600 text-sm font-medium block mb-1.5">Số điện thoại</label>
          <input type="tel" value={phoneVal} onChange={e => { setPhone(e.target.value); setSaved(false); }}
            placeholder="0901 234 567"
            className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2.5">{error}</div>
        )}
        <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60">
          <Save className="w-4 h-4" />
          {saveMutation.isPending ? 'Đang lưu...' : saved ? 'Đã lưu ✓' : 'Lưu thay đổi'}
        </button>
      </div>
    </div>
  );
}

// ─── Tìm kiếm đã lưu ──────────────────────────────────────────────────────────
// Danh sách bộ lọc đã lưu: bật/tắt cảnh báo tin mới, đổi tần suất, xem lại, xóa.
// Slice này chỉ quản lý; gửi cảnh báo thật là foundation cho bước sau.
function SavedSearchesTab({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const queryClient = useQueryClient();
  const { data: searches = [], isLoading } = useQuery({
    queryKey: ['savedSearches'],
    queryFn: listSavedSearches,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['savedSearches'] });

  const toggleMutation = useMutation({
    mutationFn: ({ id, alert_enabled }: { id: string; alert_enabled: boolean }) =>
      updateSavedSearch(id, { alert_enabled }),
    onMutate: async ({ id, alert_enabled }) => {
      const prev = queryClient.getQueryData<UserSavedSearch[]>(['savedSearches']);
      queryClient.setQueryData<UserSavedSearch[]>(['savedSearches'],
        (old) => (old ?? []).map(s => s.id === id ? { ...s, alert_enabled } : s));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) queryClient.setQueryData(['savedSearches'], ctx.prev); },
    onSettled: invalidate,
  });

  const cadenceMutation = useMutation({
    mutationFn: ({ id, cadence }: { id: string; cadence: AlertCadence }) =>
      updateSavedSearch(id, { cadence }),
    onMutate: async ({ id, cadence }) => {
      const prev = queryClient.getQueryData<UserSavedSearch[]>(['savedSearches']);
      queryClient.setQueryData<UserSavedSearch[]>(['savedSearches'],
        (old) => (old ?? []).map(s => s.id === id ? { ...s, cadence } : s));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) queryClient.setQueryData(['savedSearches'], ctx.prev); },
    onSettled: invalidate,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSavedSearch(id),
    onMutate: async (id) => {
      const prev = queryClient.getQueryData<UserSavedSearch[]>(['savedSearches']);
      queryClient.setQueryData<UserSavedSearch[]>(['savedSearches'],
        (old) => (old ?? []).filter(s => s.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => { if (ctx?.prev) queryClient.setQueryData(['savedSearches'], ctx.prev); },
    onSettled: invalidate,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 h-24 animate-pulse" />
        ))}
      </div>
    );
  }

  if (searches.length === 0) {
    return (
      <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
        <SearchIcon className="w-14 h-14 text-gray-200 mx-auto mb-3" />
        <p className="text-gray-600 font-semibold">Chưa có tìm kiếm nào được lưu</p>
        <p className="text-gray-400 text-sm mt-1">Khi bạn lọc/tìm trên trang danh sách, hệ thống tự lưu nhu cầu để cảnh báo tin mới phù hợp</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {searches.map((s: UserSavedSearch) => (
        <div key={s.id} className="bg-white rounded-2xl border border-gray-100 p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <p className="font-bold text-gray-900 truncate">{s.name}</p>
              <button
                onClick={() => { onNavigate(filtersToPage(s.filters as SavedFilters)); scrollTop(); }}
                className="inline-flex items-center gap-1 text-red-600 hover:text-red-700 text-sm font-semibold mt-1">
                <SearchIcon className="w-3.5 h-3.5" />Xem lại kết quả
              </button>
            </div>
            <button onClick={() => deleteMutation.mutate(s.id)} title="Xóa tìm kiếm"
              className="text-gray-400 hover:text-red-600 transition-colors flex-shrink-0 p-1">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-3 pt-3 border-t border-gray-50">
            <button
              onClick={() => toggleMutation.mutate({ id: s.id, alert_enabled: !s.alert_enabled })}
              className={`inline-flex items-center gap-1.5 text-sm font-semibold px-2.5 py-1.5 rounded-lg transition-colors ${s.alert_enabled ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
              {s.alert_enabled ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
              {s.alert_enabled ? 'Đang bật cảnh báo' : 'Đã tắt cảnh báo'}
            </button>

            <label className="inline-flex items-center gap-1.5 text-sm text-gray-500">
              Tần suất:
              <select
                value={isAlertCadence(s.cadence) ? s.cadence : 'daily'}
                disabled={!s.alert_enabled}
                onChange={e => cadenceMutation.mutate({ id: s.id, cadence: e.target.value as AlertCadence })}
                className="border border-gray-200 rounded-lg px-2 py-1 text-sm font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400 disabled:opacity-50">
                {Object.entries(CADENCE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}
