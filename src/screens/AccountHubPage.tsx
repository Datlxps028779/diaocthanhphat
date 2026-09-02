'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Building2, ImageIcon, Heart, User as UserIcon, Trash2, Save, ClipboardList, Search, Headset, AlertTriangle } from 'lucide-react';
import { type Page, scrollTop } from '../lib/router';
import { Breadcrumb } from '../components/Layout';
import { MyListingsPage } from './MyListingsPage';
import { AccountPage } from './AccountPage';
import {
  getUserMedia, deleteUserMedia, getUserMediaUsage,
  getProfile, getMyAgentProfile, saveMyProfileAndAgentProfile, updateProfile,
  getMyAccountSummary,
} from '../lib/api';
import { type UserMedia, type Profile, type AgentProfileStatus } from '../lib/supabase';
import { buildUniqueSlug } from '../lib/slug';

export type AccountHubTab = 'listings' | 'media' | 'favorites' | 'profile';

interface AccountHubPageProps {
  onNavigate: (p: Page) => void;
  initialTab?: AccountHubTab;
}

const TABS: { id: AccountHubTab; label: string; icon: React.ReactNode }[] = [
  { id: 'listings', label: 'Tin đăng', icon: <Building2 className="w-4 h-4" /> },
  { id: 'media', label: 'Kho ảnh', icon: <ImageIcon className="w-4 h-4" /> },
  { id: 'favorites', label: 'Yêu thích', icon: <Heart className="w-4 h-4" /> },
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
          <AccountSummary />
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
        {tab === 'media' && <MediaTab />}
        {tab === 'profile' && <ProfileTab />}
      </div>
    </div>
  );
}

// ─── Tổng quan ────────────────────────────────────────────────────────────────
function AccountSummary() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['myAccountSummary'],
    queryFn: getMyAccountSummary,
  });

  if (isLoading) {
    return <div className="grid sm:grid-cols-3 gap-2 mt-4"><div className="h-16 bg-gray-100 rounded-xl animate-pulse" /><div className="h-16 bg-gray-100 rounded-xl animate-pulse" /><div className="h-16 bg-gray-100 rounded-xl animate-pulse" /></div>;
  }
  if (isError || !data) {
    return <div className="mt-4 flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2"><AlertTriangle className="w-4 h-4" />Không tải được tổng quan tài khoản. Hãy thử làm mới trang.</div>;
  }

  const listingTotal = Object.values(data.listingCounts).reduce((sum, count) => sum + count, 0);
  const approved = data.listingCounts.approved ?? 0;
  const supportName = data.support[0]?.staff_display_name;
  return (
    <div className="grid sm:grid-cols-3 gap-2 mt-4">
      <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 flex items-center gap-2"><ClipboardList className="w-4 h-4 text-red-500" /><div><div className="text-[11px] text-gray-500">Tin đăng</div><div className="font-bold text-gray-900 text-sm">{listingTotal} <span className="font-normal text-gray-400">({approved} đã duyệt)</span></div></div></div>
      <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 flex items-center gap-2"><Search className="w-4 h-4 text-red-500" /><div><div className="text-[11px] text-gray-500">Tìm kiếm đã lưu</div><div className="font-bold text-gray-900 text-sm">{data.savedSearchCount}</div></div></div>
      <div className="bg-gray-50 border border-gray-100 rounded-xl px-3 py-2.5 flex items-center gap-2"><Headset className="w-4 h-4 text-red-500" /><div><div className="text-[11px] text-gray-500">Hỗ trợ tài khoản</div><div className="font-bold text-gray-900 text-sm">{supportName || (data.supportAvailable ? 'Chưa phân công' : 'Đang kích hoạt')}</div></div></div>
    </div>
  );
}

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
  const [agentSlug, setAgentSlug] = useState<string | null>(null);
  const [agentDisplayName, setAgentDisplayName] = useState<string | null>(null);
  const [agentBio, setAgentBio] = useState<string | null>(null);
  const [agentPhone, setAgentPhone] = useState<string | null>(null);
  const [agentZalo, setAgentZalo] = useState<string | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentProfileStatus | null>(null);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  const { data: profile, isLoading: profileLoading, isError: profileError } = useQuery<Profile | null>({
    queryKey: ['myProfile'],
    queryFn: getProfile,
  });
  const { data: agentProfile, isLoading: agentLoading, isError: agentError } = useQuery({
    queryKey: ['myAgentProfile'],
    queryFn: getMyAgentProfile,
  });

  const nameVal = displayName ?? profile?.display_name ?? '';
  const phoneVal = phone ?? profile?.phone ?? '';
  const agentNameVal = agentDisplayName ?? agentProfile?.display_name ?? nameVal;
  const agentBioVal = agentBio ?? agentProfile?.bio ?? '';
  const agentPhoneVal = agentPhone ?? agentProfile?.public_phone ?? '';
  const agentZaloVal = agentZalo ?? agentProfile?.public_zalo ?? '';
  const agentStatusVal = agentStatus ?? agentProfile?.status ?? 'draft';
  const agentSlugVal = agentSlug ?? agentProfile?.slug ?? '';
  const wantsAgentProfile = Boolean(
    agentProfile
      || agentDisplayName?.trim()
      || agentBio?.trim()
      || agentSlug?.trim()
      || agentPhone?.trim()
      || agentZalo?.trim()
      || agentStatus !== null,
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!wantsAgentProfile) {
        await updateProfile({ display_name: nameVal, phone: phoneVal });
        return null;
      }
      if (!agentNameVal.trim()) {
        throw new Error('Hãy nhập tên hiển thị công khai trước khi lưu hồ sơ người đăng tin.');
      }
      return saveMyProfileAndAgentProfile({
        display_name: nameVal,
        phone: phoneVal,
        slug: agentSlugVal || buildUniqueSlug(agentNameVal || 'nguoi-dang-tin'),
        agent_display_name: agentNameVal,
        bio: agentBioVal,
        public_phone: agentPhone ?? agentProfile?.public_phone ?? null,
        public_zalo: agentZaloVal,
        status: agentStatusVal,
      });
    },
    onSuccess: () => {
      setSaved(true);
      setError('');
      queryClient.invalidateQueries({ queryKey: ['myProfile'] });
      queryClient.invalidateQueries({ queryKey: ['myAgentProfile'] });
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (e) => setError(e instanceof Error ? e.message : 'Không lưu được hồ sơ.'),
  });

  if (profileLoading || agentLoading) {
    return <div className="bg-white rounded-2xl border border-gray-100 h-64 animate-pulse" />;
  }
  if (profileError || agentError) {
    return <div className="bg-amber-50 border border-amber-100 text-amber-800 rounded-2xl p-5 text-sm">Không tải được hồ sơ. Hãy thử làm mới trang.</div>;
  }

  return (
    <div className="space-y-5 max-w-2xl">
      <div className="bg-white rounded-2xl border border-gray-100 p-6">
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
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-6">
        <div className="flex items-start justify-between gap-4 mb-2">
          <div>
            <h3 className="font-bold text-gray-900">Hồ sơ người đăng công khai</h3>
            <p className="text-gray-500 text-xs mt-1 leading-relaxed">
              Tùy chọn hiển thị trên các tin đăng đã được duyệt của bạn. Hồ sơ này tách biệt với quyền nhân viên quản trị.
            </p>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 whitespace-nowrap">
            <input
              type="checkbox"
              checked={agentStatusVal === 'published'}
              onChange={e => { setAgentStatus(e.target.checked ? 'published' : 'draft'); setSaved(false); }}
              className="h-4 w-4 accent-red-600"
            />
            Công khai
          </label>
        </div>
        <div className="space-y-4 mt-5">
          <div>
            <label className="text-gray-600 text-sm font-medium block mb-1.5">Tên hiển thị công khai</label>
            <input value={agentNameVal} onChange={e => { setAgentDisplayName(e.target.value); setSaved(false); }}
              placeholder="Tên tư vấn viên"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>
          <div>
            <label className="text-gray-600 text-sm font-medium block mb-1.5">Slug hồ sơ</label>
            <input value={agentSlugVal} onChange={e => { setAgentSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')); setSaved(false); }}
              placeholder="ten-tu-van-vien"
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            <p className="text-gray-400 text-[11px] mt-1">Chỉ dùng chữ thường, số và dấu gạch ngang.</p>
          </div>
          <div>
            <label className="text-gray-600 text-sm font-medium block mb-1.5">Giới thiệu ngắn</label>
            <textarea value={agentBioVal} onChange={e => { setAgentBio(e.target.value); setSaved(false); }}
              maxLength={2000} rows={4} placeholder="Kinh nghiệm hoặc khu vực bạn tư vấn..."
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="text-gray-600 text-sm font-medium block mb-1.5">Số điện thoại công khai</label>
              <input type="tel" value={agentPhoneVal} onChange={e => { setAgentPhone(e.target.value); setSaved(false); }}
                placeholder="Để trống dùng số cá nhân"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
            <div>
              <label className="text-gray-600 text-sm font-medium block mb-1.5">Zalo công khai</label>
              <input value={agentZaloVal} onChange={e => { setAgentZalo(e.target.value); setSaved(false); }}
                placeholder="Số hoặc tên Zalo"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
          </div>
        </div>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2.5">{error}</div>}
      <button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}
        className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60">
        <Save className="w-4 h-4" />
        {saveMutation.isPending ? 'Đang lưu...' : saved ? 'Đã lưu ✓' : 'Lưu thay đổi'}
      </button>
    </div>
  );
}
