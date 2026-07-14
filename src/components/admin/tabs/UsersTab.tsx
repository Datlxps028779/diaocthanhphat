import { useState, useEffect, useCallback } from 'react';
import { Users, Ban, CheckCircle2, RefreshCw, ArrowLeft, ImageIcon, Building2, Phone, Mail, Clock, AlertTriangle, Trash2, Check, X } from 'lucide-react';
import { getAdminUsers, getUserActivity, setUserRole, banUser, unbanUser, deleteMyListing, deleteUserMedia, approveUserListing, rejectUserListing, type AdminUserRow, type UserActivity } from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';

const STATUS_LABEL: Record<string, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối' };

// Nhãn + màu badge cho từng role (user/staff/admin).
const ROLE_META: Record<string, { label: string; badge: string }> = {
  admin: { label: 'Quản trị', badge: 'bg-amber-100 text-amber-700' },
  staff: { label: 'Nhân viên', badge: 'bg-blue-100 text-blue-700' },
  user: { label: 'Người dùng', badge: 'bg-gray-100 text-gray-600' },
};
const roleMeta = (r: string) => ROLE_META[r] ?? ROLE_META.user;

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

  const handleSetRole = (u: AdminUserRow, next: 'user' | 'staff' | 'admin') => {
    if (next === u.role) return;
    const who = u.display_name || u.email || u.id;
    const msg = next === 'admin'
      ? `Cấp quyền QUẢN TRỊ cho "${who}"? Toàn quyền vào trang quản trị.`
      : next === 'staff'
        ? `Đặt "${who}" làm NHÂN VIÊN? Chỉ vào được CRM khách hàng + duyệt tin đăng.`
        : `Chuyển "${who}" về người dùng thường? Sẽ mất quyền vào trang quản trị.`;
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
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${roleMeta(u.role).badge}`}>
                      {roleMeta(u.role).label}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <select disabled={busy === u.id} value={u.role}
                        onChange={e => handleSetRole(u, e.target.value as 'user' | 'staff' | 'admin')}
                        title="Đổi quyền"
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:ring-1 focus:ring-red-400 outline-none disabled:opacity-40">
                        <option value="user">Người dùng</option>
                        <option value="staff">Nhân viên</option>
                        <option value="admin">Quản trị</option>
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

// Chi tiết hoạt động của 1 user: tin đăng + kho ảnh (đọc qua RLS admin) + hành động
// quản lý tại chỗ (xóa tin, xóa ảnh, duyệt/từ chối tin chờ). Các thao tác ghi dùng
// RLS admin sẵn có (user_listings_admin_delete/update, um_delete_admin).
function UserDetail({ user, onBack }: { user: AdminUserRow; onBack: () => void }) {
  const [activity, setActivity] = useState<UserActivity | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState<{ msg: string; run: () => Promise<void> } | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    getUserActivity(user.id)
      .then(setActivity)
      .catch(() => setActivity({ listings: [], media: [] }))
      .finally(() => setLoading(false));
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key); setError('');
    try { await fn(); load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại.'); }
    finally { setBusy(null); }
  };

  const doReject = async () => {
    if (!rejectId) return;
    const id = rejectId;
    setRejectId(null);
    await run(id, () => rejectUserListing(id, rejectReason || 'Không đáp ứng yêu cầu đăng tin'));
    setRejectReason('');
  };

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
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${roleMeta(user.role).badge}`}>
                {roleMeta(user.role).label}
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

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2.5 mb-4">{error}</div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-10">Đang tải hoạt động...</div>
      ) : (
        <div className="grid md:grid-cols-2 gap-5">
          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
              <Building2 className="w-4 h-4 text-red-500" /> Tin đăng ({activity?.listings.length ?? 0})
            </h3>
            <div className="space-y-2 max-h-96 overflow-auto">
              {(activity?.listings ?? []).map(l => (
                <div key={l.id} className="border-b border-gray-50 pb-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-800 truncate mr-2">{l.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full flex-shrink-0 ${l.status === 'approved' ? 'bg-emerald-100 text-emerald-700' : l.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {STATUS_LABEL[l.status] ?? l.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    {l.status === 'pending' && (
                      <>
                        <button disabled={busy === l.id} onClick={() => run(l.id, () => approveUserListing(l.id))}
                          className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg transition-colors disabled:opacity-40">
                          <Check className="w-3 h-3" />Duyệt
                        </button>
                        <button disabled={busy === l.id} onClick={() => { setRejectId(l.id); setRejectReason(''); }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 px-2 py-1 rounded-lg transition-colors disabled:opacity-40">
                          <X className="w-3 h-3" />Từ chối
                        </button>
                      </>
                    )}
                    <button disabled={busy === l.id}
                      onClick={() => setConfirm({ msg: `Xóa tin "${l.title}" của người dùng này? Không thể hoàn tác.`, run: () => run(l.id, () => deleteMyListing(l.id)) })}
                      className="flex items-center gap-1 text-[11px] font-semibold text-red-600 bg-red-50 hover:bg-red-100 px-2 py-1 rounded-lg transition-colors disabled:opacity-40">
                      <Trash2 className="w-3 h-3" />Xóa
                    </button>
                  </div>
                </div>
              ))}
              {(activity?.listings.length ?? 0) === 0 && <p className="text-gray-400 text-sm">Chưa có tin đăng.</p>}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-5">
            <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3">
              <ImageIcon className="w-4 h-4 text-red-500" /> Kho ảnh ({activity?.media.length ?? 0})
            </h3>
            <div className="grid grid-cols-3 gap-2 max-h-96 overflow-auto">
              {(activity?.media ?? []).map(m => (
                <div key={m.id} className="relative group">
                  <img src={m.url} alt={m.filename} loading="lazy"
                    className="w-full aspect-square object-cover rounded-lg border border-gray-100" />
                  <button disabled={busy === m.id}
                    onClick={() => setConfirm({ msg: 'Xóa ảnh này khỏi kho của người dùng? Không thể hoàn tác.', run: () => run(m.id, () => deleteUserMedia(m.id)) })}
                    className="absolute top-1 right-1 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center shadow opacity-0 group-hover:opacity-100 hover:bg-red-50 transition-all disabled:opacity-40"
                    title="Xóa ảnh">
                    <Trash2 className="w-3 h-3 text-red-500" />
                  </button>
                </div>
              ))}
              {(activity?.media.length ?? 0) === 0 && <p className="text-gray-400 text-sm col-span-3">Chưa có ảnh.</p>}
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          message={confirm.msg}
          onConfirm={() => { const r = confirm.run; setConfirm(null); r(); }}
          onCancel={() => setConfirm(null)}
        />
      )}

      {rejectId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRejectId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-gray-900 mb-2">Từ chối tin đăng</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Lý do từ chối (không bắt buộc)..." rows={3}
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setRejectId(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm hover:bg-gray-50 transition-colors">Hủy</button>
              <button onClick={doReject} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors">Từ chối</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
