import { useState, useEffect } from 'react';
import { UserCog, UserPlus, RefreshCw, AlertTriangle, Ban, CheckCircle2, Mail, Phone, Shield, X, Search, KeyRound } from 'lucide-react';
import type { Area, District, Ward, Neighborhood } from '../../../lib/supabase';
import { getAreas, getDistricts, getWards, getNeighborhoods } from '../../../lib/api';
import {
  STAFF_PERMISSION_ACTION_LABELS,
  STAFF_PERMISSION_CATALOG,
  STAFF_PERMISSION_SCOPE_LABELS,
  type StaffPermission,
  type StaffPermissionAction,
  type StaffPermissionScopeKind,
} from '../../../lib/staffPermissions';
import { getAdminUsers, getCustomerStaff, upsertStaffCustomerSettings, setUserRole, banUser, unbanUser, createStaff, getStaffPermissions, replaceStaffPermissions, type AdminUserRow, type StaffCustomerScope } from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';

// Nhãn + màu badge cho role đội ngũ.
const ROLE_META: Record<string, { label: string; badge: string }> = {
  admin: { label: 'Quản trị', badge: 'bg-amber-100 text-amber-700' },
  staff: { label: 'Nhân viên', badge: 'bg-blue-100 text-blue-700' },
  user: { label: 'Người dùng', badge: 'bg-gray-100 text-gray-600' },
};
const roleMeta = (r: string) => ROLE_META[r] ?? ROLE_META.user;

type CustomerStaffSetting = { is_available: boolean; max_active_customers: number };

// Tab Nhân viên (chỉ owner). Quản lý tài khoản staff bằng email/mật khẩu, nâng người
// dùng đã đăng ký lên staff, đổi quyền và khóa/mở khóa. Owner không cấp được quyền admin.
export function StaffTab() {
  const [all, setAll] = useState<AdminUserRow[]>([]);
  const [serviceRole, setServiceRole] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ msg: string; run: () => Promise<void> } | null>(null);
  const [creating, setCreating] = useState(false);
  const [promoting, setPromoting] = useState(false);
  const [customerSettings, setCustomerSettings] = useState<Record<string, CustomerStaffSetting>>({});
  const [staffScopes, setStaffScopes] = useState<StaffCustomerScope[]>([]);
  const [settingsBusy, setSettingsBusy] = useState<string | null>(null);
  const [permissionEditor, setPermissionEditor] = useState<AdminUserRow | null>(null);

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [{ users, serviceRole }, staffResult] = await Promise.all([getAdminUsers(), getCustomerStaff()]);
      setAll(users); setServiceRole(serviceRole);
      setStaffScopes(staffResult.staffScopes);
      setCustomerSettings(Object.fromEntries(staffResult.staff.map(person => [person.id, {
        is_available: person.is_available,
        max_active_customers: person.max_active_customers,
      }])));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách.');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const team = all.filter(u => u.role === 'staff');

  const runAction = async (userId: string, fn: () => Promise<void>) => {
    setBusy(userId); setError('');
    try { await fn(); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Thao tác thất bại.'); }
    finally { setBusy(null); }
  };

  const updateCustomerSetting = async (userId: string, patch: Partial<CustomerStaffSetting>) => {
    const current = customerSettings[userId] ?? { is_available: true, max_active_customers: 50 };
    const next = { ...current, ...patch };
    if (!Number.isInteger(next.max_active_customers) || next.max_active_customers < 1 || next.max_active_customers > 10000) {
      setError('Sức chứa customer phải là số nguyên từ 1 đến 10.000.');
      return;
    }
    setCustomerSettings(prev => ({ ...prev, [userId]: next }));
    setSettingsBusy(userId); setError('');
    try {
      await upsertStaffCustomerSettings({
        staffUserId: userId,
        isAvailable: next.is_available,
        maxActiveCustomers: next.max_active_customers,
      });
    } catch (e) {
      setCustomerSettings(prev => ({ ...prev, [userId]: current }));
      setError(e instanceof Error ? e.message : 'Không lưu được cấu hình customer.');
    } finally { setSettingsBusy(null); }
  };

  const handleSetRole = (u: AdminUserRow, next: 'user' | 'staff') => {
    if (next === u.role) return;
    const who = u.display_name || u.email || u.id;
    const msg = next === 'staff'
      ? `Đặt "${who}" làm NHÂN VIÊN?`
      : `Đưa "${who}" RA KHỎI đội ngũ (về người dùng thường)? Sẽ mất quyền vào workspace nội bộ.`;
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
                <th className="text-left font-semibold px-4 py-3">Chăm sóc customer</th>
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
                    {(() => {
                      const setting = customerSettings[u.id] ?? { is_available: true, max_active_customers: 50 };
                      const settingBusy = settingsBusy === u.id;
                      const scopes = staffScopes.filter(scope => scope.staff_user_id === u.id);
                      const listingCount = scopes.reduce((sum, scope) => sum + scope.listing_count, 0);
                      const leadCount = scopes.reduce((sum, scope) => sum + scope.lead_count, 0);
                      return (
                        <div className="space-y-2">
                          <div className="text-xs text-gray-500">{scopes.length} customer · {listingCount} tin · {leadCount} lead</div>
                          <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                            <input type="checkbox" checked={setting.is_available} disabled={settingBusy}
                              onChange={e => void updateCustomerSetting(u.id, { is_available: e.target.checked })}
                              className="h-4 w-4 accent-red-600" />
                            Sẵn sàng
                          </label>
                          <label className="inline-flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                            Tối đa
                            <input type="number" min={1} max={10000} step={1} value={setting.max_active_customers} disabled={settingBusy}
                              onChange={e => setCustomerSettings(prev => ({ ...prev, [u.id]: { ...setting, max_active_customers: Number(e.target.value) } }))}
                              onBlur={e => void updateCustomerSetting(u.id, { max_active_customers: Number(e.target.value) })}
                              className="w-16 border border-gray-200 rounded-lg px-2 py-1 text-xs text-center disabled:opacity-50" />
                          </label>
                          {settingBusy && <RefreshCw className="w-3.5 h-3.5 text-gray-400 animate-spin" />}
                          </div>
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button disabled={busy === u.id} onClick={() => setPermissionEditor(u)}
                        title="Phân quyền theo tài khoản"
                        className="p-1.5 rounded-lg text-indigo-600 hover:bg-indigo-50 transition-colors disabled:opacity-40">
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <select value={u.role} disabled={busy === u.id}
                        onChange={e => handleSetRole(u, e.target.value as 'user' | 'staff')}
                        title="Đổi quyền"
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-gray-700 focus:ring-1 focus:ring-red-400 outline-none disabled:opacity-40">
                        <option value="staff">Nhân viên</option>
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

      {permissionEditor && (
        <PermissionEditorModal
          staff={permissionEditor}
          onClose={() => setPermissionEditor(null)}
          onSaved={() => { setPermissionEditor(null); load(); }}
        />
      )}

      {promoting && (
        <PromoteUserModal
          candidates={all.filter(u => u.role === 'user')}
          busyId={busy}
          onClose={() => setPromoting(false)}
          onPromote={(u, role) => { setPromoting(false); handleSetRole(u, role); }}
        />
      )}
    </div>
  );
}

function PermissionEditorModal({ staff, onClose, onSaved }: {
  staff: AdminUserRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  type ModuleDraft = {
    actions: StaffPermissionAction[];
    scope_kind: StaffPermissionScopeKind;
    scope_id: string | null;
    scope_area_id: string;
    scope_district_id: string;
    scope_ward_id: string;
  };
  const [draft, setDraft] = useState<Record<string, ModuleDraft>>({});
  const [areas, setAreas] = useState<Area[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([getStaffPermissions(staff.id), getAreas(), getDistricts(), getWards(), getNeighborhoods()])
      .then(([result, nextAreas, nextDistricts, nextWards, nextNeighborhoods]) => {
        const next: Record<string, ModuleDraft> = {};
        for (const item of STAFF_PERMISSION_CATALOG) {
          const permissions = result.permissions.filter(permission => permission.module === item.module);
          const first = permissions[0];
          const scope_kind = first?.scope_kind ?? 'global';
          const scope_id = first?.scope_id ?? null;
          const scope = resolveScopeParents(scope_kind, scope_id, nextAreas, nextDistricts, nextWards, nextNeighborhoods);
          next[item.module] = {
            actions: permissions.map(permission => permission.action),
            scope_kind,
            scope_id,
            ...scope,
          };
        }
        setDraft(next);
        setAreas(nextAreas);
        setDistricts(nextDistricts);
        setWards(nextWards);
        setNeighborhoods(nextNeighborhoods);
      })
      .catch(e => setError(e instanceof Error ? e.message : 'Không tải được phân quyền.'))
      .finally(() => setLoading(false));
  }, [staff.id]);

  const resolveScopeParents = (
    scope_kind: StaffPermissionScopeKind,
    scope_id: string | null,
    nextAreas: Area[],
    nextDistricts: District[],
    nextWards: Ward[],
    nextNeighborhoods: Neighborhood[],
  ) => {
    const empty = { scope_area_id: '', scope_district_id: '', scope_ward_id: '' };
    if (!scope_id || scope_kind === 'global') return empty;
    if (scope_kind === 'area') return { ...empty, scope_area_id: scope_id };
    if (scope_kind === 'district') {
      const district = nextDistricts.find(item => item.id === scope_id);
      return { ...empty, scope_area_id: district?.area_id ?? '', scope_district_id: scope_id };
    }
    if (scope_kind === 'ward') {
      const ward = nextWards.find(item => item.id === scope_id);
      const district = nextDistricts.find(item => item.id === ward?.district_id);
      return { ...empty, scope_area_id: district?.area_id ?? '', scope_district_id: ward?.district_id ?? '', scope_ward_id: scope_id };
    }
    const neighborhood = nextNeighborhoods.find(item => item.id === scope_id);
    const district = nextDistricts.find(item => item.id === neighborhood?.district_id);
    const areaId = neighborhood?.area_id ?? district?.area_id ?? '';
    return {
      scope_area_id: nextAreas.some(item => item.id === areaId) ? areaId : '',
      scope_district_id: neighborhood?.district_id ?? '',
      scope_ward_id: neighborhood?.ward_id ?? '',
    };
  };

  const updateModule = (module: string, patch: Partial<ModuleDraft>) => {
    setDraft(current => ({
      ...current,
      [module]: { ...current[module], ...patch },
    }));
  };

  const emptyDraft: ModuleDraft = {
    actions: [],
    scope_kind: 'global',
    scope_id: null,
    scope_area_id: '',
    scope_district_id: '',
    scope_ward_id: '',
  };

  const toggleAction = (module: string, action: StaffPermissionAction) => {
    const current = draft[module] ?? emptyDraft;
    const actions = current.actions.includes(action)
      ? current.actions.filter(item => item !== action)
      : [...current.actions, action];
    updateModule(module, { actions });
  };

  const changeScopeKind = (module: string, scope_kind: StaffPermissionScopeKind) => {
    updateModule(module, {
      scope_kind,
      scope_id: null,
      scope_area_id: '',
      scope_district_id: '',
      scope_ward_id: '',
    });
  };

  const changeScopeParent = (module: string, level: 'area' | 'district' | 'ward' | 'neighborhood', value: string) => {
    const current = draft[module] ?? emptyDraft;
    if (level === 'area') {
      updateModule(module, {
        scope_area_id: value,
        scope_district_id: '',
        scope_ward_id: '',
        scope_id: current.scope_kind === 'area' ? value || null : null,
      });
    } else if (level === 'district') {
      updateModule(module, {
        scope_district_id: value,
        scope_ward_id: '',
        scope_id: current.scope_kind === 'district' ? value || null : null,
      });
    } else if (level === 'ward') {
      updateModule(module, {
        scope_ward_id: value,
        scope_id: current.scope_kind === 'ward' ? value || null : null,
      });
    } else {
      updateModule(module, { scope_id: value || null });
    }
  };

  const save = async () => {
    setSaving(true); setError('');
    try {
      const assignments: StaffPermission[] = [];
      for (const item of STAFF_PERMISSION_CATALOG) {
        const value = draft[item.module];
        if (!value) continue;
        const scope_kind = item.locationScoped ? value.scope_kind : 'global';
        const scope_id = scope_kind === 'global' ? null : value.scope_id;
        for (const action of value.actions) {
          assignments.push({ module: item.module, action, scope_kind, scope_id });
        }
      }
      await replaceStaffPermissions(staff.id, assignments);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được phân quyền.');
    } finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-black/50" onClick={() => !saving && onClose()} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2"><KeyRound className="w-5 h-5 text-indigo-600" />Phân quyền theo tài khoản</h3>
            <p className="text-xs text-gray-500 mt-1">{staff.display_name || staff.email || staff.id} · Không có quyền nào được cấp mặc định.</p>
          </div>
          <button onClick={() => !saving && onClose()} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>
        {error && <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2.5">{error}</div>}
        <div className="overflow-y-auto px-6 py-4">
          {loading ? <div className="text-center text-gray-400 py-12">Đang tải phân quyền...</div> : (
            <div className="space-y-3">
              <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl px-3 py-2.5 text-xs">
                Quyền đăng bài, đăng sản phẩm, duyệt và quản lý media được kiểm tra ở server/database. AI Agent phải dùng chính account này, không có đường cấp quyền riêng.
              </div>
              {STAFF_PERMISSION_CATALOG.map(item => {
                const value = draft[item.module] ?? emptyDraft;
                const districtsForArea = value.scope_area_id
                  ? districts.filter(district => district.area_id === value.scope_area_id)
                  : [];
                const wardsForDistrict = value.scope_district_id
                  ? wards.filter(ward => ward.district_id === value.scope_district_id)
                  : [];
                const neighborhoodsForScope = neighborhoods.filter(neighborhood => {
                  if (value.scope_area_id && neighborhood.area_id !== value.scope_area_id) return false;
                  if (value.scope_district_id && neighborhood.district_id !== value.scope_district_id) return false;
                  if (value.scope_ward_id && neighborhood.ward_id !== value.scope_ward_id) return false;
                  return true;
                });
                const scopeSelectClass = 'text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white max-w-52';
                return (
                  <div key={item.module} className="border border-gray-200 rounded-xl p-3">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="w-44 font-semibold text-sm text-gray-800">{item.label}</div>
                      <div className="flex flex-wrap gap-x-3 gap-y-2 flex-1">
                        {item.actions.map(action => (
                          <label key={action} className="inline-flex items-center gap-1.5 text-xs text-gray-600 whitespace-nowrap">
                            <input type="checkbox" checked={value.actions.includes(action)} disabled={saving}
                              onChange={() => toggleAction(item.module, action)} className="h-4 w-4 accent-indigo-600" />
                            {STAFF_PERMISSION_ACTION_LABELS[action]}
                          </label>
                        ))}
                      </div>
                      {item.locationScoped && (
                        <div className="flex flex-wrap items-center gap-2 w-full">
                          <select value={value.scope_kind} disabled={saving}
                            onChange={event => changeScopeKind(item.module, event.target.value as StaffPermissionScopeKind)}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
                            {(['global', 'area', 'district', 'ward', 'neighborhood'] as StaffPermissionScopeKind[]).map(kind => (
                              <option key={kind} value={kind}>{STAFF_PERMISSION_SCOPE_LABELS[kind]}</option>
                            ))}
                          </select>
                          {value.scope_kind === 'area' && (
                            <select value={value.scope_id ?? ''} disabled={saving}
                              onChange={event => changeScopeParent(item.module, 'area', event.target.value)}
                              className={scopeSelectClass}>
                              <option value="">Chọn tỉnh/thành</option>
                              {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                            </select>
                          )}
                          {value.scope_kind === 'district' && (
                            <>
                              <select value={value.scope_area_id} disabled={saving}
                                onChange={event => changeScopeParent(item.module, 'area', event.target.value)}
                                className={scopeSelectClass}>
                                <option value="">Chọn tỉnh/thành</option>
                                {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                              </select>
                              <select value={value.scope_district_id} disabled={saving || !value.scope_area_id}
                                onChange={event => changeScopeParent(item.module, 'district', event.target.value)}
                                className={scopeSelectClass}>
                                <option value="">Chọn quận/huyện</option>
                                {districtsForArea.map(district => <option key={district.id} value={district.id}>{district.name}</option>)}
                              </select>
                            </>
                          )}
                          {value.scope_kind === 'ward' && (
                            <>
                              <select value={value.scope_area_id} disabled={saving}
                                onChange={event => changeScopeParent(item.module, 'area', event.target.value)}
                                className={scopeSelectClass}>
                                <option value="">Chọn tỉnh/thành</option>
                                {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                              </select>
                              <select value={value.scope_district_id} disabled={saving || !value.scope_area_id}
                                onChange={event => changeScopeParent(item.module, 'district', event.target.value)}
                                className={scopeSelectClass}>
                                <option value="">Chọn quận/huyện</option>
                                {districtsForArea.map(district => <option key={district.id} value={district.id}>{district.name}</option>)}
                              </select>
                              <select value={value.scope_ward_id} disabled={saving || !value.scope_district_id}
                                onChange={event => changeScopeParent(item.module, 'ward', event.target.value)}
                                className={scopeSelectClass}>
                                <option value="">Chọn phường/xã</option>
                                {wardsForDistrict.map(ward => <option key={ward.id} value={ward.id}>{ward.name}</option>)}
                              </select>
                            </>
                          )}
                          {value.scope_kind === 'neighborhood' && (
                            <>
                              <select value={value.scope_area_id} disabled={saving}
                                onChange={event => changeScopeParent(item.module, 'area', event.target.value)}
                                className={scopeSelectClass}>
                                <option value="">Chọn tỉnh/thành</option>
                                {areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
                              </select>
                              <select value={value.scope_district_id} disabled={saving || !value.scope_area_id}
                                onChange={event => changeScopeParent(item.module, 'district', event.target.value)}
                                className={scopeSelectClass}>
                                <option value="">Chọn quận/huyện</option>
                                {districtsForArea.map(district => <option key={district.id} value={district.id}>{district.name}</option>)}
                              </select>
                              <select value={value.scope_ward_id} disabled={saving || !value.scope_district_id}
                                onChange={event => changeScopeParent(item.module, 'ward', event.target.value)}
                                className={scopeSelectClass}>
                                <option value="">Tất cả phường/xã</option>
                                {wardsForDistrict.map(ward => <option key={ward.id} value={ward.id}>{ward.name}</option>)}
                              </select>
                              <select value={value.scope_id ?? ''} disabled={saving || !value.scope_area_id}
                                onChange={event => changeScopeParent(item.module, 'neighborhood', event.target.value)}
                                className={scopeSelectClass}>
                                <option value="">Chọn khu dân cư</option>
                                {neighborhoodsForScope.map(neighborhood => <option key={neighborhood.id} value={neighborhood.id}>{neighborhood.name}</option>)}
                              </select>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button onClick={onClose} disabled={saving} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg">Hủy</button>
          <button onClick={save} disabled={saving || loading} className="px-5 py-2 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg">
            {saving ? 'Đang lưu...' : 'Lưu phân quyền'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Modal tạo tài khoản NV mới (email/mật khẩu) ────────────────────────────────
function CreateStaffModal({ serviceRole, onClose, onCreated }: { serviceRole: boolean; onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState({ display_name: '', email: '', password: '', role: 'staff' as const });
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
          <p className="text-xs bg-blue-50 border border-blue-100 text-blue-800 rounded-lg px-3 py-2">Tài khoản mới chỉ có quyền nhân viên: CRM khách hàng và phiên chat. Console chủ hệ thống yêu cầu UUID owner và MFA riêng.</p>
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
  onClose: () => void; onPromote: (u: AdminUserRow, role: 'staff') => void;
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
