import { useState, useEffect } from 'react';
import { Users, Shield, ShieldOff, Ban, CheckCircle2, RefreshCw, ArrowLeft, ImageIcon, Building2, Phone, Mail, Clock, AlertTriangle } from 'lucide-react';
import { getAdminUsers, getUserActivity, setUserRole, banUser, unbanUser, type AdminUserRow, type UserActivity } from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';

const STATUS_LABEL: Record<string, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };

// Tab quản lý người dùng. Danh sách + chi tiết hoạt động (tin đăng, kho ảnh) + hành
// động (đổi role, khóa/mở khóa). Email & khóa cần server có SUPABASE_SERVICE_ROLE_KEY;
// thiếu key thì danh sách vẫn hiện (không email) và hành động khóa báo lỗi rõ ràng.
export function UsersTab() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [serviceRole, setServiceRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [selected, setSelected] = useState<AdminUserRow | null>(null);
  const [confirm, setConfirm] = useState<{ msg: string; run: () => Promise<void> } | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const { users, serviceRole } = await getAdminUsers();
      setUsers(users); setServiceRole(serviceRole);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const runAction = async (userId: string, fn: () => Promise<void>) => {
    setBusy(userId); setError('');
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại.'); }
    finally { setBusy(null); }
  };

  const handleToggleRole = (u: AdminUserRow) => {
    const next = u.role === 'admin' ? 'user' : 'admin';
    setConfirm({
      msg: next === 'admin'
        ? `Cấp quyền QUẢN TRỊ cho "${u.display_name || u.email || u.id}"? Tài khoản này sẽ vào được trang quản trị.`
        : `Gỡ quyền quản trị của "${u.display_name || u.email || u.id}"?`,
      run: () => runAction(u.id, () => setUserRole(u.id, next)),
    });
  };

  const handleToggleBan = (u: AdminUserRow) => {
    setConfirm({
      msg: u.banned
        ? `Mở khóa tài khoản "${u.display_name || u.email || u.id}"?`
        : `KHÓA tài khoản "${u.display_name || u.email || u.id}"? Người dùng sẽ không đăng nhập được.`,
      run: () => runAction(u.id, () => (u.banned ? unbanUser(u.id) : banUser(u.id))),
    });
  };

  if (selected) {
    return <UserDetail user={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-red-500" />
          <h2 className="font-black text-xl text-gray-900">Quản lý người dùng</h2>
          <span className="text-gray-400 text-sm">({users.length})</span>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 text-sm transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </button>
      </div>

      {!serviceRole && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-xs rounded-xl px-3 py-2.5 mb-4">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>Chưa cấu hình <b>SUPABASE_SERVICE_ROLE_KEY</b> trên server. Cột email và chức năng khóa tài khoản chưa dùng được — thêm khóa vào biến môi trường rồi Redeploy để bật.</span>
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2.5 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Đang tải...</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Người dùng</th>
                <th className="text-left font-semibold px-4 py-3 hidden md:table-cell">Liên hệ</th>
                <th className="text-left font-semibold px-4 py-3">Quyền</th>
                <th className="text-right font-semibold px-4 py-3">Hành động</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(u => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button onClick={() => setSelected(u)} className="text-left">
                      <div className="font-semibold text-gray-900 hover:text-red-600 flex items-center gap-1.5">
                        {u.display_name || '(Chưa đặt tên)'}
                        {u.banned && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Đã khóa</span>}
                      </div>
                      <div className="text-gray-400 text-xs flex items-center gap-1">
                        <Mail className="w-3 h-3" />{u.email ?? '—'}
                      </div>
                    </button>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell text-gray-600">
                    <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{u.phone || '—'}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${u.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                      {u.role === 'admin' ? 'Quản trị' : 'Người dùng'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button disabled={busy === u.id} onClick={() => handleToggleRole(u)}
                        title={u.role === 'admin' ? 'Gỡ quyền quản trị' : 'Cấp quyền quản trị'}
                        className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-amber-600 transition-colors disabled:opacity-40">
                        {u.role === 'admin' ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
                      </button>
                      <button disabled={busy === u.id} onClick={() => handleToggleBan(u)}
                        title={u.banned ? 'Mở khóa' : 'Khóa tài khoản'}
                        className={`p-1.5 rounded-lg transition-colors disabled:opacity-40 ${u.banned ? 'text-emerald-600 hover:bg-emerald-50' : 'text-gray-500 hover:bg-red-50 hover:text-red-600'}`}>
                        {u.banned ? <CheckCircle2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr><td colSpan={4} className="text-center text-gray-400 py-8">Chưa có người dùng nào.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          message={confirm.msg}
          onConfirm={() => { const run = confirm.run; setConfirm(null); run(); }}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

// Chi tiết hoạt động của 1 user: tin đăng + kho ảnh (đọc qua RLS admin).
function UserDetail({ user, onBack }: { user: AdminUserRow; onBack: () => void }) {
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getUserActivity(user.id).then(setActivity).catch(() => setActivity({ listings: [], media: [] })).finally(() => setLoading(false));
  }, [user.id]);

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 text-sm mb-4 transition-colors">
        <ArrowLeft className="w-4 h-4" /> Danh sách người dùng
      </button>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
            <span className="text-red-600 font-bold text-lg">{(user.display_name || user.email || '?').charAt(0).toUpperCase()}</span>
          </div>
          <div>
            <h2 className="font-black text-xl text-gray-900 flex items-center gap-2">
              {user.display_name || '(Chưa đặt tên)'}
              {user.banned && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">Đã khóa</span>}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${user.role === 'admin' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>
                {user.role === 'admin' ? 'Quản trị' : 'Người dùng'}
              </span>
            </h2>
            <div className="text-gray-500 text-sm flex flex-wrap gap-x-4 gap-y-0.5 mt-0.5">
              <span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />{user.email ?? '—'}</span>
              <span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{user.phone || '—'}</span>
              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{new Date(user.created_at).toLocaleDateString('vi-VN')}</span>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-10">Đang tải hoạt động...</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-red-500" /> Tin đăng ({activity?.listings.length ?? 0})
            </h3>
            <div className="space-y-2 max-h-80 overflow-auto">
              {(activity?.listings ?? []).map(l => (
                <div key={l.id} className="flex items-center justify-between text-sm border-b border-gray-50 pb-2">
                  <span className="text-gray-800 truncate mr-2">{l.title}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${l.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : l.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {STATUS_LABEL[l.status] ?? l.status}
                  </span>
                </div>
              ))}
              {(activity?.listings.length ?? 0) === 0 && <p className="text-gray-400 text-sm">Chưa có tin đăng.</p>}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
              <ImageIcon className="w-4 h-4 text-red-500" /> Kho ảnh ({activity?.media.length ?? 0})
            </h3>
            <div className="grid grid-cols-3 gap-2 max-h-80 overflow-auto">
              {(activity?.media ?? []).map(m => (
                <img key={m.id} src={m.url} alt={m.filename} loading="lazy"
                  className="w-full aspect-square object-cover rounded-lg border border-gray-100" />
              ))}
              {(activity?.media.length ?? 0) === 0 && <p className="text-gray-400 text-sm col-span-3">Chưa có ảnh.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
