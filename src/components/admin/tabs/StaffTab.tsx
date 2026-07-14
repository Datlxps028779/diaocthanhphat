import { useState, useEffect } from 'react';
import { UserCog, UserPlus, RefreshCw, AlertTriangle, Ban, CheckCircle2, Mail, Phone, Shield, X, Search } from 'lucide-react';
import { getAdminUsers, setUserRole, banUser, unbanUser, createStaff, type AdminUserRow } from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';

// Nhãn + màu badge cho role đội ngũ.
const ROLE_META: Record<string, { label: string; badge: string }> = {
  admin: { label: 'Quản trị', badge: 'bg-amber-100 text-amber-700' },
  staff: { label: 'Nhân viên', badge: 'bg-blue-100 text-blue-700' },
  user: { label: 'Người dùng', badge: 'bg-gray-100 text-gray-600' },
};
const roleMeta = (r: string) => ROLE_META[r] ?? ROLE_META.user;

// Tab Nhân viên (chỉ admin). Quản lý ĐỘI NGŨ (role admin/staff): tạo tài khoản NV mới
// bằng email/mật khẩu, nâng người dùng đã đăng ký lên NV, đổi quyền, khóa/mở khóa.
// Tách khỏi tab Người dùng (chỉ hiện role=user — khách tự đăng ký).
export function StaffTab() {
  const [all, setAll] = useState<AdminUserRow[]>([]);
  const [serviceRole, setServiceRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ msg: string; run: () => Promise<void> } | null>(null);
  const [creating, setCreating] = useState(false);
  const [promoting, setPromoting] = useState(false);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const { users, serviceRole } = await getAdminUsers();
      setAll(users); setServiceRole(serviceRole);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const team = all.filter(u => u.role === 'admin' || u.role === 'staff');

  const runAction = async (userId: string, fn: () => Promise<void>) => {
    setBusy(userId); setError('');
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại.'); }
    finally { setBusy(null); }
  };

  const handleSetRole = (u: AdminUserRow, next: 'user' | 'staff' | 'admin') => {
    if (next === u.role) return;
    const who = u.display_name || u.email || u.id;
    const msg = next === 'admin'
      ? `Cấp quyền QUẢN TRỊ cho "${who}"? Toàn quyền vào trang quản trị.`
      : next === 'staff'
        ? `Đặt "${who}" làm NHÂN VIÊN?`
        : `Đưa "${who}" RA KHỎI đội ngũ (về người dùng thường)? Sẽ mất quyền vào trang quản trị.`;
    setConfirm({ msg, run: () => runAction(u.id, () => setUserRole(u.id, next)) });
  };

  const handleToggleBan = (u: AdminUserRow) => {
    setConfirm({
      msg: u.banned
        ? `Mở khóa tài khoản "${u.display_name || u.email || u.id}"?`
        : `KHÓA tài khoản "${u.display_name || u.email || u.id}"? Người dùng sẽ không đăng nhập được.`,
      run: () => runAction(u.id, () => (u.banned ? unbanUser(u.id) : banUser(u.id))),
    });
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <UserCog className="w-5 h-5 text-red-500" />
          <h2 className="font-black text-xl text-gray-900">Nhân viên</h2>
          <span className="text-gray-400 text-sm">({team.length})</span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPromoting(true)}
            className="flex items-center gap-1.5 text-sm font-semibold border border-gray-200 text-gray-700 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors">
            <Shield className="w-4 h-4" />Nâng từ người dùng
          </button>
          <button onClick={() => setCreating(true)}
            className="flex items-center gap-1.5 text-sm font-semibold bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded-lg transition-colors">
            <UserPlus className="w-4 h-4" />Thêm nhân viên
          </button>
          <button onClick={load} className="p-2 text-gray-500 hover:text-red-600 transition-colors" title="Làm mới">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {!serviceRole && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-3 py-2.5 mb-4">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Chưa cấu hình <b>SUPABASE_SERVICE_ROLE_KEY</b> trên server. Tạo tài khoản mới, cột email và khóa tài khoản chưa dùng được — thêm khóa vào biến môi trường rồi Redeploy để bật.</span>
        </div>
      )}

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2.5 mb-4">{error}</div>}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Đang tải...</div>
      ) : team.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 text-gray-400">
          <UserCog className="w-10 h-10 mx-auto mb-2 opacity-30" />
          <p className="text-sm">Chưa có nhân viên nào. Bấm "Thêm nhân viên" để tạo tài khoản.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Nhân viên</th>
                <th className="text-left font-semibold px-4 py-3 hidden md:table-cell">Liên hệ</th>
                <th className="text-left font-semibold px-4 py-3">Quyền</th>
                <th className="text-right font-semibold px-4 py-3">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {team.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-gray-900 flex items-center gap-1.5">
                      {u.display_name || '(Chưa đặt tên)'}
                      {u.banned && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Đã khóa</span>}
                    </div>
                    <div className="text-gray-400 text-xs flex items-center gap-1"><Mail className="w-3 h-3" />{u.email ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-600">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{u.phone || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${roleMeta(u.role).badge}`}>{roleMeta(u.role).label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <select disabled={busy === u.id} value={u.role}
                        onChange={e => handleSetRole(u, e.target.value as 'user' | 'staff' | 'admin')}
                        title="Đổi quyền"
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:ring-1 focus:ring-red-400 outline-none disabled:opacity-40">
                        <option value="staff">Nhân viên</option>
                        <option value="admin">Quản trị</option>
                        <option value="user">Đưa ra khỏi đội ngũ</option>
                      </select>
                      <button disabled={busy === u.id} onClick={() => handleToggleBan(u)}
                        title={u.banned ? 'Mở khóa' : 'Khóa tài khoản'}
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${u.banned ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-500 hover:bg-red-50 hover:text-red-600'}`}>
                        {u.banned ? <CheckCircle2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <ConfirmDialog message={confirm.msg}
          onConfirm={() => { const run = confirm.run; setConfirm(null); run(); }}
          onCancel={() => setConfirm(null)} />
      )}

      {creating && (
        <CreateStaffModal serviceRole={serviceRole} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load(); }} />
      )}

      {promoting && (
        <PromoteUserModal candidates={all.filter(u => u.role === 'user')}
          busyId={busy} onClose={() => setPromoting(false)}
          onPromote={(u, role) => { setPromoting(false); handleSetRole(u, role); }} />
      )}
    </div>
  );
}

// ─── Modal tạo tài khoản NV mới (email/mật khẩu) ────────────────────────────────
function CreateStaffModal({ serviceRole, onClose, onCreated }: { serviceRole: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ display_name: '', email: '', password: '', role: 'staff' as 'staff' | 'admin' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!form.email.trim() || form.password.length < 6) {
      setErr('Nhập email hợp lệ và mật khẩu tối thiểu 6 ký tự.');
      return;
    }
    setBusy(true); setErr('');
    try {
      await createStaff({ email: form.email.trim(), password: form.password, role: form.role, display_name: form.display_name.trim() || null });
      onCreated();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Tạo tài khoản thất bại.');
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={() => !busy && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><UserPlus className="w-5 h-5 text-red-600" />Thêm nhân viên mới</h3>
          <button onClick={() => !busy && onClose()} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {!serviceRole && (
          <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
            Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY — không tạo được tài khoản mới. Dùng "Nâng từ người dùng" thay thế.
          </p>
        )}
        {err && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{err}</p>}

        <div className="space-y-3">
          <input value={form.display_name} onChange={e => setForm(f => ({ ...f, display_name: e.target.value }))}
            placeholder="Họ và tên" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 outline-none" />
          <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="Email đăng nhập *" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 outline-none" />
          <input type="text" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
            placeholder="Mật khẩu (tối thiểu 6 ký tự) *" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-400 outline-none" />
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as 'staff' | 'admin' }))}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-red-400 outline-none">
            <option value="staff">Nhân viên (CRM + duyệt tin)</option>
            <option value="admin">Quản trị (toàn quyền)</option>
          </select>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} disabled={busy} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Hủy</button>
          <button onClick={submit} disabled={busy || !serviceRole}
            className="px-5 py-2 text-sm font-semibold bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg transition-colors">
            {busy ? 'Đang tạo...' : 'Tạo tài khoản'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal nâng người dùng đã đăng ký lên NV ────────────────────────────────────
function PromoteUserModal({ candidates, busyId, onClose, onPromote }: {
  candidates: AdminUserRow[]; busyId: string | null;
  onClose: () => void; onPromote: (u: AdminUserRow, role: 'staff' | 'admin') => void;
}) {
  const [kw, setKw] = useState('');
  const filtered = candidates.filter(u => {
    const q = kw.trim().toLowerCase();
    if (!q) return true;
    return (u.display_name ?? '').toLowerCase().includes(q) || (u.email ?? '').toLowerCase().includes(q) || (u.phone ?? '').includes(q);
  }).slice(0, 50);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><Shield className="w-5 h-5 text-red-600" />Nâng người dùng lên nhân viên</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-2">
          <Search className="w-4 h-4 text-gray-400 flex-shrink-0" />
          <input autoFocus value={kw} onChange={e => setKw(e.target.value)} placeholder="Tìm theo tên / email / SĐT..." className="flex-1 text-sm outline-none" />
        </div>
        <div className="max-h-72 overflow-y-auto -mx-1">
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Không có người dùng phù hợp.</p>
          ) : filtered.map(u => (
            <div key={u.id} className="flex items-center gap-2 px-1 py-2 border-b border-gray-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-800 truncate">{u.display_name || '(Chưa đặt tên)'}</p>
                <p className="text-xs text-gray-400 truncate">{u.email ?? u.phone ?? '—'}</p>
              </div>
              <button disabled={busyId === u.id} onClick={() => onPromote(u, 'staff')}
                className="text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 px-2.5 py-1 rounded-lg transition-colors disabled:opacity-40">
                Làm NV
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
