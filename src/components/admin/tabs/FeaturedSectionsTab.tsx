import { useState, useEffect } from 'react';
import { X, Plus, Edit2, Trash2, Search, Save, AlertCircle, ArrowUp, ArrowDown, Layers, Filter, List, LayoutGrid, GripVertical } from 'lucide-react';
import type { FeaturedSection, FeaturedSectionItem, Property, Area, PropertyType, District, Ward } from '../../../lib/supabase';
import { adminGetAllProperties, getAreas, getDistricts, getWards, getPropertyTypes, adminGetFeaturedSections, adminCreateFeaturedSection, adminUpdateFeaturedSection, adminDeleteFeaturedSection, adminGetSectionItems, adminSetSectionItems } from '../../../lib/api';
import { ConfirmDialog } from '../shared/ConfirmDialog';

// ─── FeaturedSectionsTab ──────────────────────────────────────────────────────
const BLANK_SECTION: Omit<FeaturedSection, 'id' | 'created_at' | 'updated_at'> = {
  title: '', subtitle: null, mode: 'auto',
  filter_area_id: null, filter_district: null, filter_ward: null,
  filter_listing_type: null, filter_property_type_id: null,
  filter_is_hot: false, filter_is_featured: false,
  auto_sort: 'newest', display_count: 8, display_style: 'grid',
  is_active: true, order_index: 0,
};

export function FeaturedSectionsTab() {
  const [sections, setSections] = useState<FeaturedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSection, setEditingSection] = useState<Partial<FeaturedSection> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [manualItems, setManualItems] = useState<FeaturedSectionItem[]>([]);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [propSearch, setPropSearch] = useState('');
  const [areas, setAreas] = useState<Area[]>([]);
  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [types, setTypes] = useState<PropertyType[]>([]);

  const load = () => {
    setLoading(true);
    Promise.all([adminGetFeaturedSections(), getAreas(), getPropertyTypes()])
      .then(([s, a, t]) => { setSections(s); setAreas(a); setTypes(t); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setIsNew(true);
    setEditingSection({ ...BLANK_SECTION, order_index: sections.length });
    setManualItems([]);
    setError('');
  };

  const openEdit = async (s: FeaturedSection) => {
    setIsNew(false);
    setEditingSection({ ...s });
    setError('');
    if (s.mode === 'manual') {
      const items = await adminGetSectionItems(s.id);
      setManualItems(items);
    } else {
      setManualItems([]);
    }
    if (s.filter_area_id) {
      const nextDistricts = await getDistricts(s.filter_area_id).catch(() => []);
      setDistricts(nextDistricts);
      const selectedDistrict = nextDistricts.find(d => d.name === s.filter_district);
      if (selectedDistrict) setWards(await getWards(selectedDistrict.id).catch(() => []));
      else setWards([]);
    } else {
      setDistricts([]);
      setWards([]);
    }
    if (allProperties.length === 0) {
      adminGetAllProperties().then(setAllProperties);
    }
  };

  const openManualPicker = async () => {
    if (allProperties.length === 0) {
      const props = await adminGetAllProperties();
      setAllProperties(props);
    }
  };

  const handleSave = async () => {
    if (!editingSection?.title?.trim()) { setError('Tiêu đề không được để trống'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        title: editingSection.title!,
        subtitle: editingSection.subtitle ?? null,
        mode: editingSection.mode ?? 'auto',
        filter_area_id: editingSection.filter_area_id ?? null,
        filter_district: editingSection.filter_district ?? null,
        filter_ward: editingSection.filter_ward ?? null,
        filter_listing_type: editingSection.filter_listing_type ?? null,
        filter_property_type_id: editingSection.filter_property_type_id ?? null,
        filter_is_hot: editingSection.filter_is_hot ?? false,
        filter_is_featured: editingSection.filter_is_featured ?? false,
        auto_sort: editingSection.auto_sort ?? 'newest',
        display_count: editingSection.display_count ?? 8,
        display_style: editingSection.display_style ?? 'grid',
        is_active: editingSection.is_active ?? true,
        order_index: editingSection.order_index ?? 0,
      };
      if (isNew) {
        const created = await adminCreateFeaturedSection(payload);
        if (editingSection.mode === 'manual') {
          await adminSetSectionItems(created.id, manualItems.map(i => i.property_id));
        }
      } else {
        await adminUpdateFeaturedSection(editingSection.id!, payload);
        if (editingSection.mode === 'manual') {
          await adminSetSectionItems(editingSection.id!, manualItems.map(i => i.property_id));
        }
      }
      setEditingSection(null);
      load();
    } catch (e: any) {
      setError(e.message ?? 'Lỗi khi lưu');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await adminDeleteFeaturedSection(id);
    setConfirmDelete(null);
    load();
  };

  const moveSection = async (index: number, dir: 'up' | 'down') => {
    const arr = [...sections];
    const swap = dir === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= arr.length) return;
    [arr[index], arr[swap]] = [arr[swap], arr[index]];
    setSections(arr);
    await Promise.all([
      adminUpdateFeaturedSection(arr[index].id, { order_index: index }),
      adminUpdateFeaturedSection(arr[swap].id, { order_index: swap }),
    ]);
  };

  const addManualItem = (prop: Property) => {
    if (manualItems.some(i => i.property_id === prop.id)) return;
    const newItem: FeaturedSectionItem = {
      id: `temp-${prop.id}`, section_id: editingSection?.id ?? '', property_id: prop.id,
      order_index: manualItems.length, created_at: '',
      properties: prop,
    };
    setManualItems(prev => [...prev, newItem]);
  };

  const removeManualItem = (propertyId: string) => {
    setManualItems(prev => prev.filter(i => i.property_id !== propertyId).map((i, idx) => ({ ...i, order_index: idx })));
  };

  const moveManualItem = (index: number, dir: 'up' | 'down') => {
    const arr = [...manualItems];
    const swap = dir === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= arr.length) return;
    [arr[index], arr[swap]] = [arr[swap], arr[index]];
    setManualItems(arr.map((i, idx) => ({ ...i, order_index: idx })));
  };

  const filteredProps = allProperties.filter(p =>
    !propSearch || p.title.toLowerCase().includes(propSearch.toLowerCase()) ||
    (p.city ?? '').toLowerCase().includes(propSearch.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900 text-lg">Quản lý Tin đăng nổi bật</h2>
          <p className="text-gray-500 text-sm mt-0.5">Tạo và sắp xếp các nhóm tin hiển thị trên trang chủ</p>
        </div>
        <button onClick={openCreate} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" />Thêm nhóm mới
        </button>
      </div>

      {sections.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Chưa có nhóm tin nào. Nhấn "Thêm nhóm mới" để bắt đầu.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((s, i) => (
            <div key={s.id} className={`bg-white rounded-xl border ${s.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'} p-4 flex items-center gap-4`}>
              <div className="flex flex-col gap-1">
                <button onClick={() => moveSection(i, 'up')} disabled={i === 0} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => moveSection(i, 'down')} disabled={i === sections.length - 1} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors"><ArrowDown className="w-3.5 h-3.5" /></button>
              </div>
              <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Layers className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-sm">{s.title}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.mode === 'auto' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {s.mode === 'auto' ? 'Tự động' : 'Thủ công'}
                  </span>
                  {!s.is_active && <span className="text-[10px] bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-full">Tắt</span>}
                </div>
                {s.subtitle && <p className="text-gray-500 text-xs mt-0.5 truncate">{s.subtitle}</p>}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                  <span>{s.display_count} tin</span>
                  <span className="flex items-center gap-1">{s.display_style === 'grid' ? <LayoutGrid className="w-3 h-3" /> : <List className="w-3 h-3" />}{s.display_style === 'grid' ? 'Dạng lưới' : 'Dạng ngang'}</span>
                  {s.mode === 'auto' && s.filter_is_hot && <span className="text-orange-500 font-semibold">HOT</span>}
                  {s.mode === 'auto' && s.filter_is_featured && <span className="text-amber-600 font-semibold">Nổi bật</span>}
                  {s.mode === 'auto' && s.filter_district && <span>Q/H: {s.filter_district}</span>}
                  {s.mode === 'auto' && s.filter_ward && <span>P/X: {s.filter_ward}</span>}
                  {s.mode === 'auto' && s.filter_listing_type && <span>{s.filter_listing_type === 'mua_ban' ? 'Mua bán' : 'Cho thuê'}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adminUpdateFeaturedSection(s.id, { is_active: !s.is_active }).then(load)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${s.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {s.is_active ? 'Bật' : 'Tắt'}
                </button>
                <button onClick={() => openEdit(s)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => setConfirmDelete(s.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Create Modal */}
      {editingSection && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-10">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingSection(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-base">{isNew ? 'Thêm nhóm tin mới' : 'Chỉnh sửa nhóm tin'}</h3>
              <button onClick={() => setEditingSection(null)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}

            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tiêu đề *</label>
                <input value={editingSection.title ?? ''} onChange={e => setEditingSection(p => ({ ...p, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" placeholder="Tin đăng nổi bật" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Mô tả phụ</label>
                <input value={editingSection.subtitle ?? ''} onChange={e => setEditingSection(p => ({ ...p, subtitle: e.target.value || null }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" placeholder="Hiển thị bên dưới tiêu đề" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Số lượng hiển thị</label>
                <input type="number" min={1} max={24} value={editingSection.display_count ?? 8} onChange={e => setEditingSection(p => ({ ...p, display_count: parseInt(e.target.value) || 8 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Kiểu hiển thị</label>
                <select value={editingSection.display_style ?? 'grid'} onChange={e => setEditingSection(p => ({ ...p, display_style: e.target.value as 'grid' | 'horizontal' }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                  <option value="grid">Dạng lưới</option>
                  <option value="horizontal">Dạng ngang (cuộn)</option>
                </select>
              </div>
            </div>

            {/* Mode */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Chế độ lấy tin</label>
              <div className="flex gap-3">
                {(['auto', 'manual'] as const).map(m => (
                  <button key={m} onClick={() => { setEditingSection(p => ({ ...p, mode: m })); if (m === 'manual') openManualPicker(); }}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${editingSection.mode === m ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {m === 'auto' ? 'Tự động (theo bộ lọc)' : 'Thủ công (chọn tay)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto filters */}
            {editingSection.mode === 'auto' && (
              <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-blue-700 flex items-center gap-1.5"><Filter className="w-3.5 h-3.5" />Bộ lọc tự động</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Khu vực</label>
                    <select value={editingSection.filter_area_id ?? ''} onChange={async e => {
                      const areaId = e.target.value || null;
                      setEditingSection(p => ({ ...p, filter_area_id: areaId, filter_district: null, filter_ward: null }));
                      if (areaId) { setDistricts(await getDistricts(areaId).catch(() => [])); setWards([]); }
                      else { setDistricts([]); setWards([]); }
                    }}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="">Tất cả khu vực</option>
                      {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Quận/Huyện</label>
                    <select value={editingSection.filter_district ?? ''} onChange={async e => {
                      const districtName = e.target.value || null;
                      setEditingSection(p => ({ ...p, filter_district: districtName, filter_ward: null }));
                      const next = districtName ? districts.find(d => d.name === districtName) : null;
                      setWards(next ? await getWards(next.id).catch(() => []) : []);
                    }}
                      disabled={!editingSection.filter_area_id}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white disabled:bg-gray-100">
                      <option value="">Tất cả quận/huyện</option>
                      {districts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Phường/Xã</label>
                    <select value={editingSection.filter_ward ?? ''} onChange={e => setEditingSection(p => ({ ...p, filter_ward: e.target.value || null }))}
                      disabled={!editingSection.filter_district}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white disabled:bg-gray-100">
                      <option value="">Tất cả phường/xã</option>
                      {wards.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Loại giao dịch</label>
                    <select value={editingSection.filter_listing_type ?? ''} onChange={e => setEditingSection(p => ({ ...p, filter_listing_type: e.target.value || null }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="">Tất cả</option>
                      <option value="mua_ban">Mua bán</option>
                      <option value="cho_thue">Cho thuê</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Loại BĐS</label>
                    <select value={editingSection.filter_property_type_id ?? ''} onChange={e => setEditingSection(p => ({ ...p, filter_property_type_id: e.target.value || null }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="">Tất cả loại</option>
                      {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Sắp xếp theo</label>
                    <select value={editingSection.auto_sort ?? 'newest'} onChange={e => setEditingSection(p => ({ ...p, auto_sort: e.target.value as FeaturedSection['auto_sort'] }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="newest">Mới nhất</option>
                      <option value="views">Lượt xem cao nhất</option>
                      <option value="price_asc">Giá thấp đến cao</option>
                      <option value="price_desc">Giá cao đến thấp</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editingSection.filter_is_featured ?? false} onChange={e => setEditingSection(p => ({ ...p, filter_is_featured: e.target.checked }))}
                      className="w-4 h-4 accent-red-600 rounded" />
                    <span className="text-sm text-gray-700">Chỉ tin nổi bật</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editingSection.filter_is_hot ?? false} onChange={e => setEditingSection(p => ({ ...p, filter_is_hot: e.target.checked }))}
                      className="w-4 h-4 accent-red-600 rounded" />
                    <span className="text-sm text-gray-700">Chỉ tin HOT</span>
                  </label>
                </div>
              </div>
            )}

            {/* Manual picker */}
            {editingSection.mode === 'manual' && (
              <div className="bg-purple-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-purple-700 flex items-center gap-1.5"><GripVertical className="w-3.5 h-3.5" />Chọn thủ công ({manualItems.length} tin đã chọn)</p>

                {/* Selected items */}
                {manualItems.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {manualItems.map((item, idx) => (
                      <div key={item.property_id} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-purple-100">
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => moveManualItem(idx, 'up')} disabled={idx === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                          <button onClick={() => moveManualItem(idx, 'down')} disabled={idx === manualItems.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                        </div>
                        {item.properties?.image_url && (
                          <img src={item.properties.image_url} alt="" className="w-10 h-8 object-cover rounded flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{item.properties?.title ?? item.property_id}</p>
                          <p className="text-[11px] text-gray-500">{item.properties?.city}</p>
                        </div>
                        <button onClick={() => removeManualItem(item.property_id)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Property search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input value={propSearch} onChange={e => setPropSearch(e.target.value)} placeholder="Tìm kiếm tin đăng để thêm..."
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                {propSearch && (
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {filteredProps.slice(0, 20).map(p => {
                      const already = manualItems.some(i => i.property_id === p.id);
                      return (
                        <button key={p.id} onClick={() => !already && addManualItem(p)} disabled={already}
                          className={`w-full flex items-center gap-2 p-2 rounded-lg text-left text-xs transition-colors ${already ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'bg-white hover:bg-purple-50 border border-gray-100'}`}>
                          {p.image_url && <img src={p.image_url} alt="" className="w-8 h-6 object-cover rounded flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800 truncate">{p.title}</p>
                            <p className="text-gray-400">{p.city} – {p.price_label ?? `${p.price} ${p.price_unit}`}</p>
                          </div>
                          {!already && <Plus className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input type="checkbox" checked={editingSection.is_active ?? true} onChange={e => setEditingSection(p => ({ ...p, is_active: e.target.checked }))}
                  className="w-4 h-4 accent-red-600 rounded" />
                <span className="text-sm text-gray-700">Hiển thị trên trang chủ</span>
              </label>
              <button onClick={() => setEditingSection(null)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">Hủy</button>
              <button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors disabled:opacity-60">
                {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Đang lưu...</> : <><Save className="w-3.5 h-3.5" />Lưu</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message="Bạn có chắc muốn xóa nhóm tin này?"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}
