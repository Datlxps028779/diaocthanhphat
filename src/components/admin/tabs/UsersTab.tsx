import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Building2, Check, ImageIcon, Mail, MessageSquare, Phone, RefreshCw, Tag, Trash2, UserCheck, Users, X } from 'lucide-react';
import {
  addCustomerCoAssignee,
  addCustomerNote,
  assignCustomerPrimary,
  endCustomerAssignment,
  getCustomerDetail,
  getCustomerStaff,
  getCustomerWorkspace,
  updateCustomerStatusTags,
  approveUserListing,
  deleteMyListing,
  deleteUserMedia,
  rejectUserListing,
  type CustomerDetail,
  type CustomerListRow,
  type CustomerStatus,
} from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';

const STATUS_LABEL: Record<CustomerStatus, string> = {
  new: 'Mới',
  active: 'Đang chăm sóc',
  qualified: 'Đủ điều kiện',
  inactive: 'Không hoạt động',
  blocked: 'Đã chặn',
};
const STATUS_BADGE: Record<CustomerStatus, string> = {
  new: 'bg-sky-100 text-sky-700',
  active: 'bg-emerald-100 text-emerald-700',
  qualified: 'bg-violet-100 text-violet-700',
  inactive: 'bg-gray-100 text-gray-600',
  blocked: 'bg-red-100 text-red-700',
};
const LISTING_STATUS: Record<string, string> = { pending: 'Chờ duyệt', approved: 'Đã duyệt', rejected: 'Từ chối', expired: 'Hết hạn' };

type StaffOption = { id: string; display_name: string | null; is_available: boolean; max_active_customers: number };

export function UsersTab() {
  const [customers, setCustomers] = useState<CustomerListRow[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [canManageAssignments, setCanManageAssignments] = useState(false);
  const [selected, setSelected] = useState<CustomerListRow | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<CustomerStatus | 'all'>('all');
  const [assignment, setAssignment] = useState<'all' | 'assigned' | 'unassigned'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [workspace, staffResult] = await Promise.all([
        getCustomerWorkspace({ search, status, assignment }),
        getCustomerStaff(),
      ]);
      setCustomers(workspace.customers);
      setStaff(staffResult.staff);
      setCanManageAssignments(staffResult.canManageAssignments);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được workspace customer.');
    } finally {
      setLoading(false);
    }
  }, [search, status, assignment]);

  useEffect(() => { void load(); }, [load]);

  if (selected) {
    return (
      <CustomerDetailView
        customerId={selected.user_id}
        staff={staff}
        canManageAssignments={canManageAssignments}
        onBack={() => setSelected(null)}
        onChanged={load}
      />
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-red-500" />
          <h2 className="font-black text-xl text-gray-900">Người dùng / Customer</h2>
          <span className="text-gray-400 text-sm">({customers.length})</span>
        </div>
        <button onClick={() => void load()} className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 text-sm">
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Làm mới
        </button>
      </div>

      <div className="grid sm:grid-cols-3 gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên hoặc số điện thoại..." className="sm:col-span-1 border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-red-300" />
        <select value={status} onChange={e => setStatus(e.target.value as CustomerStatus | 'all')} className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-red-300">
          <option value="all">Mọi trạng thái</option>
          {Object.entries(STATUS_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select>
        <select value={assignment} onChange={e => setAssignment(e.target.value as typeof assignment)} className="border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white outline-none focus:ring-2 focus:ring-red-300">
          <option value="all">Mọi phân công</option>
          <option value="assigned">Đã có người phụ trách</option>
          <option value="unassigned">Chưa phân công</option>
        </select>
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2.5 mb-4">{error}</div>}
      {loading ? <div className="text-center text-gray-400 py-10">Đang tải customer...</div> : (
        <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-500 text-xs">
                <tr>
                  <th className="text-left font-semibold px-4 py-3">Customer</th>
                  <th className="text-left font-semibold px-4 py-3">Trạng thái</th>
                  <th className="text-left font-semibold px-4 py-3 hidden md:table-cell">Phụ trách</th>
                  <th className="text-right font-semibold px-4 py-3">Hoạt động</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {customers.map(customer => (
                  <tr key={customer.user_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <button onClick={() => setSelected(customer)} className="text-left">
                        <div className="font-semibold text-gray-900 hover:text-red-600">{customer.display_name || '(Chưa đặt tên)'}</div>
                        <div className="text-gray-400 text-xs flex items-center gap-1 mt-0.5"><Phone className="w-3 h-3" />{customer.phone || 'Chưa có số điện thoại'}</div>
                      </button>
                    </td>
                    <td className="px-4 py-3"><span className={`text-xs font-semibold px-2 py-1 rounded-full ${STATUS_BADGE[customer.status]}`}>{STATUS_LABEL[customer.status]}</span></td>
                    <td className="px-4 py-3 hidden md:table-cell text-gray-600">{customer.primary_staff_name || <span className="text-gray-400">Chưa phân công</span>}{customer.active_assignment_count > 1 && <span className="text-xs text-gray-400 ml-1">+{customer.active_assignment_count - 1}</span>}</td>
                    <td className="px-4 py-3 text-right"><button onClick={() => setSelected(customer)} className="text-xs font-semibold text-red-600 hover:text-red-700">Mở hồ sơ</button></td>
                  </tr>
                ))}
                {customers.length === 0 && <tr><td colSpan={4} className="text-center text-gray-400 py-10">Chưa có customer phù hợp.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function CustomerDetailView({ customerId, staff, canManageAssignments, onBack, onChanged }: {
  customerId: string;
  staff: StaffOption[];
  canManageAssignments: boolean;
  onBack: () => void;
  onChanged: () => Promise<void>;
}) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [status, setStatus] = useState<CustomerStatus>('new');
  const [primaryStaffId, setPrimaryStaffId] = useState('');
  const [coAssigneeId, setCoAssigneeId] = useState('');
  const [confirm, setConfirm] = useState<{ message: string; run: () => Promise<void> } | null>(null);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const detail = await getCustomerDetail(customerId);
      setCustomer(detail);
      setStatus(detail.status);
      setTags(detail.tags.join(', '));
      setPrimaryStaffId(detail.assignments.find(a => a.assignment_kind === 'primary' && !a.ended_at)?.staff_user_id ?? '');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được hồ sơ customer.');
    } finally {
      setLoading(false);
    }
  }, [customerId]);
  useEffect(() => { void load(); }, [load]);

  const run = async (action: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await action(); await load(); await onChanged(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại.'); }
    finally { setBusy(false); }
  };

  const saveStatusTags = () => run(() => updateCustomerStatusTags(customerId, status, tags.split(',').map(tag => tag.trim()).filter(Boolean)));
  const saveNote = async () => {
    if (!note.trim()) return;
    await run(() => addCustomerNote(customerId, note.trim()));
    setNote('');
  };
  const assignPrimary = () => primaryStaffId ? run(() => assignCustomerPrimary(customerId, primaryStaffId)) : Promise.resolve();
  const addCoAssignee = () => coAssigneeId ? run(() => addCustomerCoAssignee(customerId, coAssigneeId)) : Promise.resolve();

  const doReject = async () => {
    if (!rejectId) return;
    const id = rejectId;
    setRejectId(null);
    await run(() => rejectUserListing(id, rejectReason || 'Không đáp ứng yêu cầu đăng tin'));
    setRejectReason('');
  };

  if (loading) return <div className="text-center text-gray-400 py-10">Đang tải hồ sơ customer...</div>;
  if (!customer) return <div className="text-center text-red-600 py-10">Không tìm thấy customer.</div>;

  const activeAssignments = customer.assignments.filter(a => !a.ended_at);
  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 text-sm mb-4"><ArrowLeft className="w-4 h-4" /> Danh sách customer</button>
      {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2.5 mb-4">{error}</div>}

      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center text-red-600 font-bold text-lg">{(customer.display_name || '?').charAt(0).toUpperCase()}</div>
            <div>
              <h2 className="font-black text-xl text-gray-900">{customer.display_name || '(Chưa đặt tên)'}</h2>
              <div className="text-gray-500 text-sm flex flex-wrap gap-x-4 gap-y-1 mt-1"><span className="flex items-center gap-1"><Phone className="w-3.5 h-3.5" />{customer.phone || '—'}</span><span className="flex items-center gap-1"><Mail className="w-3.5 h-3.5" />Tài khoản đăng ký</span></div>
            </div>
          </div>
          <span className={`text-xs font-semibold px-2.5 py-1.5 rounded-full ${STATUS_BADGE[customer.status]}`}>{STATUS_LABEL[customer.status]}</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-5 mb-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><Tag className="w-4 h-4 text-red-500" /> Trạng thái & tags</h3>
          <select value={status} onChange={e => setStatus(e.target.value as CustomerStatus)} disabled={!canManageAssignments || busy} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white mb-2"><option value="new">Mới</option><option value="active">Đang chăm sóc</option><option value="qualified">Đủ điều kiện</option><option value="inactive">Không hoạt động</option><option value="blocked">Đã chặn</option></select>
          <input value={tags} onChange={e => setTags(e.target.value)} disabled={!canManageAssignments || busy} placeholder="buyer, vay-ngan-hang" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm mb-2" />
          {canManageAssignments && <button disabled={busy} onClick={() => void saveStatusTags()} className="w-full bg-red-600 hover:bg-red-700 text-white rounded-xl py-2 text-sm font-semibold disabled:opacity-50">Lưu customer</button>}
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 p-5 lg:col-span-2">
          <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><UserCheck className="w-4 h-4 text-red-500" /> Nhân viên phụ trách</h3>
          {canManageAssignments ? <div className="grid sm:grid-cols-2 gap-2">
            <div><label className="text-xs text-gray-500">Phụ trách chính</label><div className="flex gap-2 mt-1"><select value={primaryStaffId} onChange={e => setPrimaryStaffId(e.target.value)} disabled={busy} className="min-w-0 flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"><option value="">Chưa phân công</option>{staff.map(person => <option key={person.id} value={person.id}>{person.display_name || person.id}</option>)}</select><button disabled={busy || !primaryStaffId} onClick={() => void assignPrimary()} className="px-3 rounded-xl bg-red-600 text-white text-sm disabled:opacity-40">Lưu</button></div></div>
            <div><label className="text-xs text-gray-500">Thêm đồng phụ trách</label><div className="flex gap-2 mt-1"><select value={coAssigneeId} onChange={e => setCoAssigneeId(e.target.value)} disabled={busy} className="min-w-0 flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm bg-white"><option value="">Chọn nhân viên</option>{staff.filter(person => !activeAssignments.some(a => a.staff_user_id === person.id)).map(person => <option key={person.id} value={person.id}>{person.display_name || person.id}</option>)}</select><button disabled={busy || !coAssigneeId} onClick={() => void addCoAssignee()} className="px-3 rounded-xl bg-gray-800 text-white text-sm disabled:opacity-40">Thêm</button></div></div>
          </div> : <p className="text-sm text-gray-500">Bạn chỉ xem được customer đã được giao cho mình.</p>}
          <div className="flex flex-wrap gap-2 mt-3">{activeAssignments.map(assignment => <span key={assignment.id} className="inline-flex items-center gap-1.5 bg-gray-50 border border-gray-100 rounded-lg px-2.5 py-1.5 text-xs text-gray-700">{assignment.staff_display_name || 'Nhân viên'} ({assignment.assignment_kind === 'primary' ? 'chính' : 'đồng phụ trách'}){canManageAssignments && <button onClick={() => setConfirm({ message: 'Kết thúc phân công này?', run: () => run(() => endCustomerAssignment(assignment.id)) })} className="text-red-500 hover:text-red-700"><X className="w-3 h-3" /></button>}</span>)}</div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-5 mb-5">
        <h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><MessageSquare className="w-4 h-4 text-red-500" /> Ghi chú nội bộ</h3>
        <div className="flex gap-2"><textarea value={note} onChange={e => setNote(e.target.value)} disabled={busy} rows={2} placeholder="Ghi chú chỉ dành cho đội ngũ phụ trách..." className="min-w-0 flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none" /><button disabled={busy || !note.trim()} onClick={() => void saveNote()} className="self-end bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40">Thêm note</button></div>
        <div className="space-y-2 mt-4">{customer.activities.map(activity => <div key={activity.id} className="border-l-2 border-red-100 pl-3"><div className="text-xs text-gray-400">{new Date(activity.created_at).toLocaleString('vi-VN')} · {activity.kind}</div><div className="text-sm text-gray-700">{activity.body}</div></div>)}{customer.activities.length === 0 && <p className="text-sm text-gray-400">Chưa có hoạt động nội bộ.</p>}</div>
      </div>

      <div className="grid md:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 p-5"><h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><Building2 className="w-4 h-4 text-red-500" /> Tin đăng ({customer.listings.length})</h3><div className="space-y-2 max-h-96 overflow-auto">{customer.listings.map(listing => { const id = String(listing.id); const listingStatus = String(listing.status ?? ''); const title = String(listing.title ?? 'Tin đăng'); return <div key={id} className="border-b border-gray-50 pb-2"><div className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{title}</span><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-600">{LISTING_STATUS[listingStatus] ?? listingStatus}</span></div>{listingStatus === 'pending' && <div className="flex gap-2 mt-1.5"><button disabled={busy} onClick={() => void run(() => approveUserListing(id))} className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-1 rounded-lg"><Check className="w-3 h-3 inline" /> Duyệt</button><button disabled={busy} onClick={() => { setRejectId(id); setRejectReason(''); }} className="text-[11px] text-amber-700 bg-amber-50 px-2 py-1 rounded-lg"><X className="w-3 h-3 inline" /> Từ chối</button></div>}<button disabled={busy} onClick={() => setConfirm({ message: `Xóa tin "${title}"? Không thể hoàn tác.`, run: () => run(() => deleteMyListing(id)) })} className="text-[11px] text-red-600 mt-1"><Trash2 className="w-3 h-3 inline" /> Xóa</button></div>; })}{customer.listings.length === 0 && <p className="text-sm text-gray-400">Chưa có tin đăng.</p>}</div></div>
        <div className="bg-white rounded-2xl border border-gray-100 p-5"><h3 className="font-bold text-gray-900 flex items-center gap-2 mb-3"><ImageIcon className="w-4 h-4 text-red-500" /> Kho ảnh ({customer.media.length})</h3><div className="grid grid-cols-3 gap-2 max-h-96 overflow-auto">{customer.media.map(media => { const id = String(media.id); const url = String(media.url ?? ''); return <div key={id} className="relative group"><img src={url} alt={String(media.filename ?? 'Ảnh')} loading="lazy" className="w-full aspect-square object-cover rounded-lg border border-gray-100" /><button disabled={busy} onClick={() => setConfirm({ message: 'Xóa ảnh này khỏi kho?', run: () => run(() => deleteUserMedia(id)) })} className="absolute top-1 right-1 w-6 h-6 bg-white/90 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100"><Trash2 className="w-3 h-3 text-red-500" /></button></div>; })}{customer.media.length === 0 && <p className="text-sm text-gray-400 col-span-3">Chưa có ảnh.</p>}</div></div>
      </div>

      {confirm && <ConfirmDialog message={confirm.message} onConfirm={() => { const runConfirm = confirm.run; setConfirm(null); void runConfirm(); }} onCancel={() => setConfirm(null)} />}
      {rejectId && <div className="fixed inset-0 z-50 flex items-center justify-center"><div className="absolute inset-0 bg-black/50" onClick={() => setRejectId(null)} /><div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4"><h3 className="font-bold text-gray-900 mb-2">Từ chối tin đăng</h3><textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3} placeholder="Lý do từ chối..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm resize-none mb-4" /><div className="flex gap-3"><button onClick={() => setRejectId(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm">Hủy</button><button onClick={() => void doReject()} className="flex-1 bg-amber-600 text-white font-bold py-2.5 rounded-xl text-sm">Từ chối</button></div></div></div>}
    </div>
  );
}
