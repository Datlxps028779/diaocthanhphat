import { useEffect, useState } from 'react';
import { Activity, CheckCircle2, ExternalLink, FileText, History, RefreshCw, Search, UserCog, XCircle } from 'lucide-react';
import { getAgentProfileAudit, getAgentProfileDirectory, updateAgentProfile } from '../../../lib/api';
import { parseAgentProfileWorkspaceSearch, updateAgentProfileWorkspaceSearch, type AgentProfileWorkspaceTab } from '../../../lib/agentProfileWorkspaceUrl';
import type { AgentProfile, AgentProfileAuditEvent, AgentProfileDirectoryRow } from '../../../lib/supabase';

type Props = { role: 'user' | 'staff' | 'admin' };
type WorkspaceTab = AgentProfileWorkspaceTab;

const STATUS_LABEL: Record<AgentProfile['status'], string> = {
  draft: 'Bản nháp',
  published: 'Đang xuất bản',
  disabled: 'Đã tắt',
};

const MISSING_LABEL: Record<string, string> = {
  display_name: 'Tên hiển thị',
  bio: 'Giới thiệu',
  avatar_url: 'Ảnh đại diện',
  contact: 'Kênh liên hệ',
  approved_listing: 'Tin đăng đã duyệt',
};

const AUDIT_LABEL: Record<AgentProfileAuditEvent['action'], string> = {
  created: 'Tạo hồ sơ',
  updated: 'Cập nhật',
  published: 'Xuất bản',
  disabled: 'Tắt xuất bản',
  deleted: 'Xóa hồ sơ',
};

export function AgentProfilesTab({ role }: Props) {
  const [rows, setRows] = useState<AgentProfileDirectoryRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(() => (
    typeof window === 'undefined' ? null : parseAgentProfileWorkspaceSearch(window.location.search).profileId
  ));
  const [, refreshWorkspaceUrlState] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<AgentProfile['status'] | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const selected = selectedId ? rows.find(row => row.profile_id === selectedId) ?? null : null;
  const workspaceTab = typeof window === 'undefined' ? 'overview' : parseAgentProfileWorkspaceSearch(window.location.search).tab;

  const syncWorkspaceUrl = (profileId: string | null, tab: WorkspaceTab = 'overview', mode: 'push' | 'replace' = 'push') => {
    if (typeof window === 'undefined') return;
    const nextSearch = updateAgentProfileWorkspaceSearch(window.location.search, profileId, tab);
    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    if (`${window.location.pathname}${window.location.search}${window.location.hash}` === nextUrl) return;
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', nextUrl);
    refreshWorkspaceUrlState(value => value + 1);
  };

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const next = await getAgentProfileDirectory({ search, status });
      setRows(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được directory hồ sơ.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onPopState = () => {
      setSelectedId(parseAgentProfileWorkspaceSearch(window.location.search).profileId);
      refreshWorkspaceUrlState(value => value + 1);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => { void load(); }, [search, status]);

  useEffect(() => {
    if (!loading && selectedId && !rows.some(row => row.profile_id === selectedId)) {
      setSelectedId(null);
      syncWorkspaceUrl(null, 'overview', 'replace');
    }
  }, [loading, rows, selectedId]);

  if (selected) {
    return <AgentProfileWorkspace
      key={`${selected.profile_id}:${workspaceTab}`}
      profile={selected}
      role={role}
      initialTab={workspaceTab}
      onBack={() => { setSelectedId(null); syncWorkspaceUrl(null, 'overview', 'replace'); }}
      onChanged={load}
      onTabChange={(tab) => syncWorkspaceUrl(selected.profile_id, tab)}
    />;
  }

  const published = rows.filter(row => row.status === 'published').length;
  const needsWork = rows.filter(row => row.completeness_score < 100).length;
  const activeListings = rows.reduce((sum, row) => sum + row.listing_count, 0);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <UserCog className="w-5 h-5 text-red-500" />
          <div><h2 className="font-black text-xl text-gray-900">Hồ sơ người đăng tin</h2><p className="text-xs text-gray-500">Directory, chất lượng và hoạt động theo quyền truy cập</p></div>
        </div>
        <button onClick={() => void load()} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới</button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <Metric label="Hồ sơ trong phạm vi" value={rows.length} />
        <Metric label="Đang xuất bản" value={published} />
        <Metric label="Cần hoàn thiện" value={needsWork} />
        <Metric label="Tin đang hiển thị" value={activeListings} />
      </div>

      <div className="flex flex-wrap gap-2 mb-4">
        <label className="flex items-center gap-2 flex-1 min-w-[220px] border border-gray-200 rounded-xl px-3 py-2 bg-white"><Search className="w-4 h-4 text-gray-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên hoặc slug..." className="min-w-0 flex-1 text-sm outline-none" /></label>
        <select value={status} onChange={e => setStatus(e.target.value as AgentProfile['status'] | 'all')} className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"><option value="all">Mọi trạng thái</option><option value="published">Đang xuất bản</option><option value="draft">Bản nháp</option><option value="disabled">Đã tắt</option></select>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2.5 mb-4">{error}</div>}
      {loading ? <div className="text-center text-gray-400 py-10">Đang tải hồ sơ...</div> : rows.length === 0 ? <div className="text-center text-gray-400 py-10 bg-white rounded-2xl border border-gray-100">Không có hồ sơ trong phạm vi truy cập.</div> : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 text-gray-500 text-xs"><tr><th className="text-left px-4 py-3">Hồ sơ</th><th className="text-left px-4 py-3">Trạng thái</th><th className="text-left px-4 py-3">Chất lượng</th><th className="text-left px-4 py-3">Phạm vi</th><th className="text-right px-4 py-3">Mở</th></tr></thead><tbody className="divide-y divide-gray-100">
            {rows.map(row => <tr key={row.profile_id} className="hover:bg-gray-50"><td className="px-4 py-3"><button onClick={() => { setSelectedId(row.profile_id); syncWorkspaceUrl(row.profile_id); }} className="text-left"><div className="font-semibold text-gray-900 hover:text-red-600">{row.display_name}</div><div className="text-xs text-gray-400">/{row.slug} · {row.owner_role}</div></button></td><td className="px-4 py-3"><StatusBadge status={row.status} /></td><td className="px-4 py-3"><div className="flex items-center gap-2"><div className="h-2 w-20 rounded-full bg-gray-100 overflow-hidden"><div className={`h-full ${row.completeness_score === 100 ? 'bg-emerald-500' : 'bg-amber-400'}`} style={{ width: `${row.completeness_score}%` }} /></div><span className="text-xs text-gray-600">{row.completeness_score}%</span></div></td><td className="px-4 py-3 text-gray-600">{row.listing_count} tin · {row.lead_count} lead</td><td className="px-4 py-3 text-right"><button onClick={() => { setSelectedId(row.profile_id); syncWorkspaceUrl(row.profile_id); }} className="text-xs font-semibold text-red-600 hover:text-red-700">Mở workspace</button></td></tr>)}
          </tbody></table></div>
        </div>
      )}
    </div>
  );
}

function AgentProfileWorkspace({ profile, role, initialTab, onBack, onChanged, onTabChange }: {
  profile: AgentProfileDirectoryRow;
  role: 'user' | 'staff' | 'admin';
  initialTab: WorkspaceTab;
  onBack: () => void;
  onChanged: () => Promise<void>;
  onTabChange: (tab: WorkspaceTab) => void;
}) {
  const [tab, setTab] = useState<WorkspaceTab>(initialTab);
  const [audit, setAudit] = useState<AgentProfileAuditEvent[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(false);
  const [error, setError] = useState('');
  const isAdmin = role === 'admin';

  const loadAudit = async () => {
    setLoadingAudit(true);
    try { setAudit(await getAgentProfileAudit(profile.profile_id)); } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được lịch sử.'); } finally { setLoadingAudit(false); }
  };
  useEffect(() => { setTab(initialTab); }, [initialTab]);
  useEffect(() => { if (tab === 'history') void loadAudit(); }, [tab, profile.profile_id]);

  const selectTab = (nextTab: WorkspaceTab) => {
    setTab(nextTab);
    onTabChange(nextTab);
  };

  return (
    <div>
      <button onClick={onBack} className="text-sm text-gray-500 hover:text-red-600 mb-4">← Directory hồ sơ</button>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2.5 mb-4">{error}</div>}
      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-4"><div className="flex flex-wrap items-start justify-between gap-4"><div><div className="flex items-center gap-2"><h2 className="font-black text-xl text-gray-900">{profile.display_name}</h2><StatusBadge status={profile.status} /></div><p className="text-sm text-gray-500 mt-1">/{profile.slug} · tài khoản {profile.owner_role}</p></div><a href={`/nguoi-dang-tin/${encodeURIComponent(profile.slug)}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-sm text-red-600 hover:text-red-700">Xem trang công khai <ExternalLink className="w-3.5 h-3.5" /></a></div></div>
      <div className="flex flex-wrap gap-2 border-b border-gray-200 mb-5">{([['overview', 'Tổng quan'], ['public', 'Thông tin công khai'], ['activity', 'Hoạt động'], ['history', 'Lịch sử']] as Array<[WorkspaceTab, string]>).map(([key, label]) => <button key={key} onClick={() => selectTab(key)} className={`px-3 py-2.5 text-sm font-semibold border-b-2 ${tab === key ? 'border-red-600 text-red-600' : 'border-transparent text-gray-500 hover:text-gray-800'}`}>{label}</button>)}</div>
      {tab === 'overview' && <Overview profile={profile} />}
      {tab === 'public' && <PublicEditor profile={profile} isAdmin={isAdmin} onSaved={async () => { await onChanged(); }} />}
      {tab === 'activity' && <ActivityView profile={profile} />}
      {tab === 'history' && <HistoryView audit={audit} loading={loadingAudit} />}
    </div>
  );
}

function Overview({ profile }: { profile: AgentProfileDirectoryRow }) {
  return <div className="grid lg:grid-cols-3 gap-4"><div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2"><h3 className="font-bold text-gray-900 mb-3">Việc cần làm</h3>{profile.missing_fields.length === 0 ? <p className="flex items-center gap-2 text-sm text-emerald-700"><CheckCircle2 className="w-4 h-4" /> Hồ sơ đã đủ các trường chất lượng cơ bản.</p> : <div className="space-y-2">{profile.missing_fields.map(field => <div key={field} className="flex items-center gap-2 text-sm text-amber-700"><XCircle className="w-4 h-4" /> Bổ sung {MISSING_LABEL[field] ?? field}</div>)}</div>}</div><div className="bg-white rounded-2xl border border-gray-100 p-5"><h3 className="font-bold text-gray-900 mb-3">Số liệu thật</h3><div className="space-y-3 text-sm"><Stat label="Tin đã duyệt/đang hiển thị" value={profile.listing_count} /><Stat label="Lead từ phạm vi tin" value={profile.lead_count} /><Stat label="Điểm hoàn thiện" value={`${profile.completeness_score}%`} /></div></div></div>;
}

function PublicEditor({ profile, isAdmin, onSaved }: { profile: AgentProfileDirectoryRow; isAdmin: boolean; onSaved: () => Promise<void> }) {
  const [form, setForm] = useState({ slug: profile.slug, display_name: profile.display_name, bio: profile.bio ?? '', avatar_url: profile.avatar_url ?? '', public_phone: profile.public_phone ?? '', public_zalo: profile.public_zalo ?? '', status: profile.status });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const set = (key: keyof typeof form, value: string) => setForm(current => ({ ...current, [key]: value }));
  const save = async () => {
    setBusy(true); setMessage(''); setError('');
    try {
      await updateAgentProfile(profile.profile_id, { ...form, status: isAdmin ? form.status : undefined });
      await onSaved();
      setMessage('Đã lưu hồ sơ.');
    } catch (e) { setError(e instanceof Error ? e.message : 'Không lưu được hồ sơ.'); } finally { setBusy(false); }
  };
  return <div className="bg-white rounded-2xl border border-gray-100 p-5 max-w-3xl"><div className="flex items-center gap-2 mb-4"><FileText className="w-4 h-4 text-red-500" /><h3 className="font-bold text-gray-900">Thông tin công khai</h3></div>{error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2 mb-3">{error}</p>}{message && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg px-3 py-2 mb-3">{message}</p>}<div className="grid md:grid-cols-2 gap-3"><Field label="Tên hiển thị" value={form.display_name} onChange={value => set('display_name', value)} /><Field label="Slug" value={form.slug} onChange={value => set('slug', value)} /><Field label="Ảnh đại diện URL" value={form.avatar_url} onChange={value => set('avatar_url', value)} /><Field label="Số điện thoại công khai" value={form.public_phone} onChange={value => set('public_phone', value)} /><Field label="Zalo công khai" value={form.public_zalo} onChange={value => set('public_zalo', value)} />{isAdmin && <label className="text-sm text-gray-600">Trạng thái<select value={form.status} onChange={e => set('status', e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 bg-white text-gray-900"><option value="draft">Bản nháp</option><option value="published">Đang xuất bản</option><option value="disabled">Đã tắt</option></select></label>}</div><label className="block text-sm text-gray-600 mt-3">Giới thiệu<textarea value={form.bio} onChange={e => set('bio', e.target.value)} rows={5} maxLength={2000} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-y" /></label><div className="flex items-center justify-between mt-4"><p className="text-xs text-gray-400">{isAdmin ? 'Admin có thể thay đổi trạng thái xuất bản.' : 'Staff chỉ chỉnh nội dung hồ sơ của chính mình.'}</p><button disabled={busy} onClick={() => void save()} className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50">{busy ? 'Đang lưu...' : 'Lưu hồ sơ'}</button></div></div>;
}

function ActivityView({ profile }: { profile: AgentProfileDirectoryRow }) { return <div className="grid md:grid-cols-2 gap-4"><div className="bg-white rounded-2xl border border-gray-100 p-5"><h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-red-500" /> Hoạt động gần nhất</h3><p className="text-sm text-gray-600">{profile.last_seen_at ? new Date(profile.last_seen_at).toLocaleString('vi-VN') : 'Chưa ghi nhận hoạt động.'}</p></div><div className="bg-white rounded-2xl border border-gray-100 p-5"><h3 className="font-bold text-gray-900 mb-3">Phạm vi nhiệm vụ</h3><p className="text-sm text-gray-600">{profile.listing_count} tin đang hiển thị và {profile.lead_count} lead phát sinh từ phạm vi tin của hồ sơ.</p></div></div>; }

const AUDIT_FIELDS: Array<[keyof AgentProfileAuditState, string]> = [
  ['slug', 'Slug'],
  ['display_name', 'Tên hiển thị'],
  ['bio', 'Giới thiệu'],
  ['avatar_url', 'Ảnh đại diện URL'],
  ['public_phone', 'Số điện thoại công khai'],
  ['public_zalo', 'Zalo công khai'],
  ['status', 'Trạng thái'],
];

type AgentProfileAuditState = {
  slug?: unknown;
  display_name?: unknown;
  bio?: unknown;
  avatar_url?: unknown;
  public_phone?: unknown;
  public_zalo?: unknown;
  status?: unknown;
};

function auditValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function AuditState({ title, state }: { title: string; state: Record<string, unknown> | null }) {
  const safeState = (state ?? {}) as AgentProfileAuditState;
  return <div><p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-1">{title}</p><dl className="space-y-1">{AUDIT_FIELDS.map(([field, label]) => <div key={field} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-2 text-xs"><dt className="text-gray-500">{label}</dt><dd className="min-w-0 truncate text-gray-800" title={auditValue(safeState[field])}>{auditValue(safeState[field])}</dd></div>)}</dl></div>;
}

function HistoryView({ audit, loading }: { audit: AgentProfileAuditEvent[]; loading: boolean }) {
  return <div className="bg-white rounded-2xl border border-gray-100 p-5"><h3 className="font-bold text-gray-900 flex items-center gap-2 mb-4"><History className="w-4 h-4 text-red-500" /> Lịch sử thay đổi</h3>{loading ? <p className="text-sm text-gray-400">Đang tải lịch sử...</p> : audit.length === 0 ? <p className="text-sm text-gray-400">Chưa có lịch sử.</p> : <div className="space-y-4">{audit.map(event => <div key={event.id} className="border-l-2 border-red-100 pl-3"><p className="text-sm font-semibold text-gray-800">{AUDIT_LABEL[event.action]}</p><p className="text-xs text-gray-400">{new Date(event.created_at).toLocaleString('vi-VN')} · {event.actor_display_name ?? event.actor_id ?? 'system'}{event.actor_role ? ` · ${event.actor_role}` : ''}</p><div className="mt-3 grid gap-4 rounded-xl bg-gray-50 p-3 md:grid-cols-2"><AuditState title="Trước thay đổi" state={event.before_state} /><AuditState title="Sau thay đổi" state={event.after_state} /></div></div>)}</div>}</div>;
}

function Metric({ label, value }: { label: string; value: number }) { return <div className="bg-white rounded-2xl border border-gray-100 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-1 text-2xl font-black text-gray-900">{value}</p></div>; }
function Stat({ label, value }: { label: string; value: string | number }) { return <div className="flex items-center justify-between gap-2"><span className="text-gray-500">{label}</span><strong className="text-gray-900">{value}</strong></div>; }
function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label className="text-sm text-gray-600">{label}<input value={value} onChange={e => onChange(e.target.value)} className="mt-1 w-full border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-900" /></label>; }
function StatusBadge({ status }: { status: AgentProfile['status'] }) { return <span className={`text-xs font-semibold px-2 py-1 rounded-full ${status === 'published' ? 'bg-emerald-100 text-emerald-700' : status === 'disabled' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{STATUS_LABEL[status]}</span>; }
