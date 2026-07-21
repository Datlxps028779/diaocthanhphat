import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Eye, Plus, Edit2, Trash2, CheckCircle, XCircle, MapPin, Search, Save, Zap, Flame, Star, ShieldCheck, Wand2 } from 'lucide-react';
import type { District, Ward, Property, Area, PropertyType } from '../../../lib/supabase';
import { adminGetAllProperties, getAreas, getPropertyTypes, createProperty, updateProperty, deleteProperty, getDistricts, getWards, bulkUpdateProperties, bulkDeleteProperties } from '../../../lib/api';
import { ImageUpload, ImageUrlInput } from '../../ImageUpload';
import { useSEOAutofill, SEOPreview, generateSlug } from '../../../lib/useSEOAutofill';
import { buildPropertyMetadata, buildPropertyJsonLd } from '../../../lib/seo';
import { parseSeoSchema } from '../shared/SeoFields';
import { buildPropertyFaq, type FaqItem } from '../../../lib/propertyFaq';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { LEGAL_OPTIONS } from '../../../lib/legalOptions';
import { clearIncompatibleSpecValues, getCompatibleSpecFields, type SpecFieldKey } from '../../../lib/propertySpecs';

// Dựng Property tạm từ form state để tái dùng builder public (buildPropertyMetadata +
// buildPropertyJsonLd) — SEO/GEO form fill khớp 1:1 JSON-LD public /bat-dong-san/[slug].
// Field số trong form là chuỗi → đổi về number | null; field không có trong form → null.
function formToProperty(
  form: Record<string, unknown>,
  property: Property | null,
  types: PropertyType[],
  faq: FaqItem[],
): Property {
  const num = (v: unknown) => {
    if (v === '' || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const str = (v: unknown) => (v === '' || v === null || v === undefined ? null : String(v));
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : null);
  const slug = (str(form.slug) || generateSlug(String(form.title ?? '')) || 'slug') as string;
  const now = new Date().toISOString();
  const typeId = str(form.property_type_id);
  const propertyType = types.find(t => t.id === typeId) ?? null;
  return {
    id: property?.id ?? 'draft',
    title: String(form.title ?? ''),
    description: str(form.description),
    price: num(form.price) ?? 0,
    price_unit: String(form.price_unit ?? 'tỷ'),
    price_label: str(form.price_label),
    price_per_month: num(form.price_per_month),
    listing_type: (form.listing_type as Property['listing_type']) ?? 'mua_ban',
    area_sqm: num(form.area_sqm),
    address: str(form.address),
    city: String(form.city ?? ''),
    district: str(form.district),
    ward: str(form.ward),
    area_id: str(form.area_id),
    district_id: property?.district_id ?? null,
    property_type_id: typeId,
    image_url: str(form.image_url),
    images: arr(form.images),
    badge: str(form.badge),
    badge_color: str(form.badge_color),
    legal_status: str(form.legal_status),
    is_featured: Boolean(form.is_featured),
    is_hot: Boolean(form.is_hot),
    is_active: Boolean(form.is_active),
    is_verified: Boolean(form.is_verified),
    views: property?.views ?? 0,
    contact_name: str(form.contact_name),
    contact_phone: str(form.contact_phone),
    bedrooms: num(form.bedrooms),
    bathrooms: num(form.bathrooms),
    floor_count: num(form.floor_count),
    floor_number: num(form.floor_number),
    direction: str(form.direction),
    road_width: num(form.road_width),
    frontage: num(form.frontage),
    amenities: property?.amenities ?? null,
    latitude: num(form.latitude),
    longitude: num(form.longitude),
    formatted_address: property?.formatted_address ?? null,
    vr_tour_url: str(form.vr_tour_url),
    video_url: str(form.video_url),
    contact_zalo: str(form.contact_zalo),
    tags: property?.tags ?? null,
    meta_title: str(form.meta_title),
    meta_description: str(form.meta_description),
    focus_keywords: str(form.focus_keywords),
    schema_markup: null,
    slug,
    faq: (() => {
      const valid = faq
        .map(it => ({ question: it.question.trim(), answer: it.answer.trim() }))
        .filter(it => it.question && it.answer);
      return valid.length ? valid : null;
    })(),
    created_at: property?.created_at ?? now,
    updated_at: now,
    property_types: propertyType,
  };
}

// ─── Properties Tab ───────────────────────────────────────────────────────────
export function PropertiesTab({ onStatsRefresh }: { onStatsRefresh?: () => void }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [types, setTypes] = useState<PropertyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [editing, setEditing] = useState<Property | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Bulk selection (Sprint 3c)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const load = async () => {
    setLoading(true);
    const [p, a, t] = await Promise.all([adminGetAllProperties(), getAreas(), getPropertyTypes()]);
    setProperties(p); setAreas(a); setTypes(t);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = properties.filter(p =>
    (!search || p.title.toLowerCase().includes(search.toLowerCase()) || p.city.toLowerCase().includes(search.toLowerCase())) &&
    (!filterType || p.listing_type === filterType)
  );

  // ─── Bulk helpers ─────────────────────────────────────────────────────────
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const filteredIds = filtered.map(p => p.id);
  const allFilteredSelected = filteredIds.length > 0 && filteredIds.every(id => selected.has(id));
  const toggleAll = () => setSelected(prev => {
    if (allFilteredSelected) {
      const next = new Set(prev);
      filteredIds.forEach(id => next.delete(id));
      return next;
    }
    return new Set([...prev, ...filteredIds]);
  });
  const clearSelection = () => setSelected(new Set());

  const runBulk = async (fn: () => Promise<number>, label: string) => {
    setBulkBusy(true);
    try {
      const n = await fn();
      clearSelection();
      await load(); onStatsRefresh?.();
      console.info(`[AdminPanel] Bulk ${label}: ${n} BĐS`);
    } catch (e) {
      console.error(`[AdminPanel] Bulk ${label} thất bại:`, e);
      alert(`Thao tác hàng loạt thất bại: ${(e as { message?: string })?.message ?? 'Lỗi không xác định'}`);
    } finally { setBulkBusy(false); }
  };
  const selectedIds = () => Array.from(selected);

  const handleSave = async (data: Partial<Property>) => {
    setSaving(true);
    try {
      if (creating) await createProperty(data as Omit<Property, 'id' | 'created_at' | 'updated_at' | 'views' | 'areas' | 'property_types'>);
      else if (editing) await updateProperty(editing.id, data);
      await load(); onStatsRefresh?.();
      setEditing(null); setCreating(false);
    } catch (e) {
      console.error("[AdminPanel] Lưu BĐS thất bại:", e);
      const err = e as { message?: string; code?: string; details?: string };
      const msg = err?.message ?? 'Lỗi không xác định';
      const code = err?.code ? ` [${err.code}]` : '';
      alert('Lưu thất bại: ' + msg + code + (err?.details ? '\n' + err.details : ''));
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await deleteProperty(id);
    setConfirmDelete(null);
    await load(); onStatsRefresh?.();
  };

  if (editing || creating) {
    return (
      <PropertyForm
        property={creating ? null : editing}
        areas={areas} types={types}
        saving={saving}
        onSave={handleSave}
        onCancel={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm BĐS..." className="pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white w-56" />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none">
            <option value="">Tất cả loại</option>
            <option value="mua_ban">Mua bán</option>
            <option value="cho_thue">Cho thuê</option>
          </select>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />Thêm BĐS
        </button>
      </div>

      {/* Bulk action bar (Sprint 3c) — hiện khi có chọn */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-gray-900 text-white rounded-xl px-4 py-2.5 animate-fade-in">
          <span className="text-sm font-semibold mr-1">Đã chọn {selected.size}</span>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateProperties(selectedIds(), { is_active: true }), 'hiện')}
            className="flex items-center gap-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <CheckCircle className="w-3.5 h-3.5" />Hiện
          </button>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateProperties(selectedIds(), { is_active: false }), 'ẩn')}
            className="flex items-center gap-1 text-xs font-medium bg-gray-600 hover:bg-gray-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <XCircle className="w-3.5 h-3.5" />Ẩn
          </button>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateProperties(selectedIds(), { is_hot: true }), 'gắn HOT')}
            className="flex items-center gap-1 text-xs font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <Flame className="w-3.5 h-3.5" />HOT
          </button>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateProperties(selectedIds(), { is_featured: true }), 'gắn nổi bật')}
            className="flex items-center gap-1 text-xs font-medium bg-amber-500 hover:bg-amber-400 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <Star className="w-3.5 h-3.5" />Nổi bật
          </button>
          <button disabled={bulkBusy} onClick={() => runBulk(() => bulkUpdateProperties(selectedIds(), { is_verified: true }), 'xác minh')}
            className="flex items-center gap-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <ShieldCheck className="w-3.5 h-3.5" />Xác minh
          </button>
          <button disabled={bulkBusy} onClick={() => setConfirmBulkDelete(true)}
            className="flex items-center gap-1 text-xs font-medium bg-red-800 hover:bg-red-700 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />Xóa
          </button>
          <button onClick={clearSelection} className="ml-auto text-xs text-gray-300 hover:text-white transition-colors">Bỏ chọn</button>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox" checked={allFilteredSelected} onChange={toggleAll}
                      aria-label="Chọn tất cả" className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer" />
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Tiêu đề</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Loại</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Khu vực</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Giá</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase hidden sm:table-cell">Trạng thái</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase hidden lg:table-cell">Lượt xem</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => (
                  <tr key={p.id} className={`transition-colors ${selected.has(p.id) ? 'bg-red-50' : 'hover:bg-gray-50'}`}>
                    <td className="px-4 py-3">
                      <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggleOne(p.id)}
                        aria-label={`Chọn ${p.title}`} className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer" />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={p.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'} alt="" className="w-12 h-10 object-cover rounded-lg flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate max-w-[200px]">{p.title}</p>
                          <div className="flex gap-1 mt-0.5">
                            {p.is_featured && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Nổi bật</span>}
                            {p.is_hot && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">HOT</span>}
                            {p.is_verified && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Đã xác minh</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.listing_type === 'cho_thue' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                        {p.listing_type === 'mua_ban' ? 'Mua bán' : 'Cho thuê'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-gray-600 text-xs">{p.city}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-red-600 text-sm">{p.price_label ?? `${p.price} ${p.price_unit}`}</span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <button onClick={async () => { await updateProperty(p.id, { is_active: !p.is_active }); await load(); }}
                        className={`flex items-center justify-center mx-auto gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${p.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {p.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {p.is_active ? 'Hiển thị' : 'Ẩn'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 text-xs hidden lg:table-cell">
                      <span className="flex items-center justify-center gap-1"><Eye className="w-3 h-3" />{p.views}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setEditing(p)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Sửa">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setConfirmDelete(p.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Xóa">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">Không tìm thấy bất động sản nào</div>}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog message="Bạn có chắc chắn muốn xóa bất động sản này?"
          onConfirm={() => handleDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      )}

      {confirmBulkDelete && (
        <ConfirmDialog message={`Xóa ${selected.size} bất động sản đã chọn? Thao tác không thể hoàn tác.`}
          onConfirm={() => { setConfirmBulkDelete(false); runBulk(() => bulkDeleteProperties(selectedIds()), 'xóa'); }}
          onCancel={() => setConfirmBulkDelete(false)} />
      )}
    </div>
  );
}

// ─── SEO Score ────────────────────────────────────────────────────────────────
function calcSeoScore(title: string, description: string, imageUrl: string, areaSqm: unknown, price: unknown): number {
  let score = 0;
  const titleLen = title.trim().length;
  if (titleLen >= 30 && titleLen <= 65) score += 30;
  else if (titleLen >= 15) score += 15;
  const descLen = (description ?? '').trim().length;
  if (descLen >= 120) score += 30;
  else if (descLen >= 60) score += 15;
  if (imageUrl) score += 15;
  if (areaSqm) score += 10;
  if (price) score += 15;
  return Math.min(score, 100);
}

// ─── Admin Pin Map ─────────────────────────────────────────────────────────────
function AdminPinMap({ lat, lng, searchQuery, onChange }: {
  lat: string; lng: string; searchQuery: string;
  onChange: (lat: string, lng: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);
  const searchRef = useRef('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    import('leaflet').then(module => {
      const L = module.default;
      import('leaflet/dist/leaflet.css');
      const map = L.map(containerRef.current!, { center: [10.9804, 106.6519], zoom: 10, attributionControl: false });
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      L.control.attribution({ prefix: '© OpenStreetMap' }).addTo(map);
      const pinIcon = L.divIcon({
        className: '',
        html: `<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0z" fill="#dc2626"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`,
        iconSize: [28, 36], iconAnchor: [14, 36],
      });
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
        else {
          markerRef.current = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
          markerRef.current.on('dragend', () => {
            const pos = markerRef.current!.getLatLng();
            onChangeRef.current(pos.lat.toFixed(6), pos.lng.toFixed(6));
          });
        }
        onChangeRef.current(lat.toFixed(6), lng.toFixed(6));
      });
    });
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !lat || !lng) return;
    const latN = parseFloat(lat), lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN)) return;
    import('leaflet').then(module => {
      const L = module.default;
      if (markerRef.current) {
        markerRef.current.setLatLng([latN, lngN]);
      } else {
        const pinIcon = L.divIcon({ className: '', html: `<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0z" fill="#dc2626"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`, iconSize: [28, 36], iconAnchor: [14, 36] });
        markerRef.current = L.marker([latN, lngN], { icon: pinIcon, draggable: true }).addTo(map);
        markerRef.current.on('dragend', () => { const pos = markerRef.current!.getLatLng(); onChangeRef.current(pos.lat.toFixed(6), pos.lng.toFixed(6)); });
      }
      map.setView([latN, lngN], Math.max(map.getZoom(), 14));
    });
  }, [lat, lng]);

  useEffect(() => {
    if (!searchQuery || searchQuery === searchRef.current) return;
    searchRef.current = searchQuery;
    const map = mapRef.current;
    if (!map) return;
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery + ', Vietnam')}&format=json&limit=1`)
      .then(r => r.json()).then((results: Array<{ lat: string; lon: string }>) => {
        if (results.length > 0) map.flyTo([parseFloat(results[0].lat), parseFloat(results[0].lon)], 13, { duration: 1.2 });
      }).catch(() => {});
  }, [searchQuery]);

  return <div ref={containerRef} style={{ width: '100%', height: '220px' }} className="rounded-lg overflow-hidden border border-gray-200" />;
}

const SPEC_LABELS: Record<SpecFieldKey, string> = {
  area_sqm: 'Diện tích (m²)',
  bedrooms: 'Phòng ngủ',
  bathrooms: 'Phòng tắm',
  frontage: 'Mặt tiền (m)',
  road_width: 'Đường rộng (m)',
  floor_count: 'Số tầng',
  floor_number: 'Tầng căn hộ',
  legal_status: 'Pháp lý',
  direction: 'Hướng nhà',
};

const SPEC_PLACEHOLDERS: Partial<Record<SpecFieldKey, string>> = {
  area_sqm: '120',
  bedrooms: '3',
  bathrooms: '2',
  frontage: '5',
  road_width: '8',
  floor_count: '3',
  floor_number: '12',
};

const DIRECTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Nam', 'Đông Bắc', 'Tây Nam', 'Tây Bắc'];

// ─── Property Form ────────────────────────────────────────────────────────────
function PropertyForm({ property, areas, types, saving, onSave, onCancel }: {
  property: Property | null; areas: Area[]; types: PropertyType[];
  saving: boolean; onSave: (data: Partial<Property>) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: property?.title ?? '',
    slug: property?.slug ?? '',
    description: property?.description ?? '',
    listing_type: property?.listing_type ?? 'mua_ban',
    price: property?.price ?? 0,
    price_unit: property?.price_unit ?? 'tỷ',
    price_label: property?.price_label ?? '',
    price_per_month: property?.price_per_month ?? '',
    area_sqm: property?.area_sqm ?? '',
    address: property?.address ?? '',
    city: property?.city ?? '',
    district: property?.district ?? '',
    ward: property?.ward ?? '',
    area_id: property?.area_id ?? '',
    property_type_id: property?.property_type_id ?? '',
    image_url: property?.image_url ?? '',
    images: property?.images ?? [] as string[],
    badge: property?.badge ?? '',
    badge_color: property?.badge_color ?? 'red',
    legal_status: property?.legal_status ?? '',
    is_featured: property?.is_featured ?? false,
    is_hot: property?.is_hot ?? false,
    is_active: property?.is_active ?? true,
    is_verified: property?.is_verified ?? false,
    contact_name: property?.contact_name ?? '',
    contact_phone: property?.contact_phone ?? '',
    contact_zalo: property?.contact_zalo ?? '',
    bedrooms: property?.bedrooms ?? '',
    bathrooms: property?.bathrooms ?? '',
    direction: property?.direction ?? '',
    road_width: property?.road_width ?? '',
    frontage: property?.frontage ?? '',
    floor_count: property?.floor_count ?? '',
    floor_number: property?.floor_number ?? '',
    latitude: property?.latitude ? String(property.latitude) : '',
    longitude: property?.longitude ? String(property.longitude) : '',
    vr_tour_url: property?.vr_tour_url ?? '',
    video_url: property?.video_url ?? '',
    meta_title: property?.meta_title ?? '',
    meta_description: property?.meta_description ?? '',
    focus_keywords: property?.focus_keywords ?? '',
    schema_markup: property?.schema_markup ? JSON.stringify(property.schema_markup, null, 2) : '',
  });
  const [faq, setFaq] = useState<FaqItem[]>(property?.faq ?? []);

  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [mapSearchQuery, setMapSearchQuery] = useState(property?.city ?? '');
  const [typeError, setTypeError] = useState('');
  const isRent = form.listing_type === 'cho_thue';
  const selectedPropertyType = types.find(t => t.id === form.property_type_id);
  const visibleSpecFields = getCompatibleSpecFields(selectedPropertyType, 'admin_property');
  const showSpec = (field: SpecFieldKey) => visibleSpecFields.includes(field);
  const seoScore = calcSeoScore(form.title, form.description, form.image_url, form.area_sqm, form.price);

  // ─── SEO Autofill ───────────────────────────────────────────────────────────
  const seo = useSEOAutofill({
    title: form.title,
    description: form.description,
    price: form.price,
    price_unit: form.price_unit,
    listing_type: form.listing_type,
    city: form.city,
    district: form.district,
    area_sqm: form.area_sqm,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    image_url: form.image_url,
    images: form.images,
    address: form.address,
    latitude: form.latitude,
    longitude: form.longitude,
    contact_name: form.contact_name,
    contact_phone: form.contact_phone,
    property_type_name: types.find(t => t.id === form.property_type_id)?.name ?? '',
  });
  const seoSchemaState = useMemo(() => parseSeoSchema(seo.schemaMarkup, 'property'), [seo.schemaMarkup]);
  // Sync SEO vào form
  useEffect(() => { setForm(f => ({ ...f, meta_title: seo.metaTitle })); }, [seo.metaTitle]);
  useEffect(() => { setForm(f => ({ ...f, meta_description: seo.metaDescription })); }, [seo.metaDescription]);
  useEffect(() => { setForm(f => ({ ...f, focus_keywords: seo.focusKeywords })); }, [seo.focusKeywords]);
  // Schema auto = đúng builder public (buildPropertyJsonLd, đã GEO contentLocation/
  // spatialCoverage/about/areaServed + video + offers VND). Khớp 1:1 JSON-LD public page.
  useEffect(() => {
    const temp = formToProperty(form as Record<string, unknown>, property, types, faq);
    const autoSchema = buildPropertyJsonLd(temp);
    setForm(f => {
      const generated = JSON.stringify(autoSchema, null, 2);
      const current = f.schema_markup.trim();
      const previousAuto = seo.schemaMarkup.trim();
      return { ...f, schema_markup: !current || current === previousAuto ? generated : f.schema_markup };
    });
  }, [form.title, form.description, form.image_url, form.images, form.listing_type, form.price, form.price_unit, form.price_per_month, form.city, form.district, form.ward, form.area_sqm, form.bedrooms, form.bathrooms, form.address, form.latitude, form.longitude, form.contact_name, form.legal_status, form.direction, form.video_url, form.slug, faq, property, types]);

  // Nút "Điền mẫu từ dữ liệu": dựng record tạm → fill meta (buildPropertyMetadata) + schema
  // (buildPropertyJsonLd) đầy đủ GEO. Setter của useSEOAutofill tự mark touched → ghi đè an toàn.
  const fillPropertyFromData = () => {
    const temp = formToProperty(form as Record<string, unknown>, property, types, faq);
    const meta = buildPropertyMetadata(temp);
    seo.setMetaTitle((meta.title as string).slice(0, 60));
    seo.setMetaDescription((meta.description as string).slice(0, 155));
    seo.setFocusKeywords((meta.keywords as string) || '');
    seo.setSchemaMarkup(JSON.stringify(buildPropertyJsonLd(temp), null, 2));
  };

  const setField = (name: string, value: unknown) => setForm(f => ({ ...f, [name]: value }));
  const setPropertyType = (id: string) => {
    const nextType = types.find(t => t.id === id);
    setTypeError('');
    setForm(f => clearIncompatibleSpecValues({ ...f, property_type_id: id }, nextType, 'admin_property'));
  };

  const handleAreaChange = useCallback((areaId: string) => {
    const area = areas.find(a => a.id === areaId);
    setField('area_id', areaId);
    setField('city', area?.name ?? '');
    setField('district', '');
    setField('ward', '');
    setWards([]);
    if (areaId) {
      getDistricts(areaId).then(setDistricts).catch(() => setDistricts([]));
      if (area?.name) setMapSearchQuery(area.name);
    } else {
      setDistricts([]);
    }
  }, [areas]);

  const handleDistrictChange = useCallback((districtName: string) => {
    setField('district', districtName);
    setField('ward', '');
    const d = districts.find(x => x.name === districtName);
    if (d) getWards(d.id).then(setWards).catch(() => setWards([]));
    else setWards([]);
    if (districtName && form.city) setMapSearchQuery(`${districtName}, ${form.city}`);
  }, [form.city, districts]);

  useEffect(() => {
    if (property?.area_id) getDistricts(property.area_id).then(setDistricts).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Nạp wards khi sửa BĐS có sẵn district (districts vừa load xong → map tên ra id).
  useEffect(() => {
    if (!property?.district || districts.length === 0) return;
    const d = districts.find(x => x.name === property.district);
    if (d) getWards(d.id).then(setWards).catch(() => {});
  }, [districts, property?.district]);

  const seoColor = seoScore >= 70 ? 'text-emerald-600' : seoScore >= 40 ? 'text-amber-600' : 'text-red-600';
  const seoBarColor = seoScore >= 70 ? 'bg-emerald-500' : seoScore >= 40 ? 'bg-amber-500' : 'bg-red-500';
  const seoLabel = seoScore >= 70 ? 'Tốt' : seoScore >= 40 ? 'Trung bình' : 'Cần cải thiện';

  // ─── Handle Save Click an toàn ──────────────────────────────────────────────
  const handleSaveClick = () => {
    if (!form.property_type_id) {
      setTypeError('Vui lòng chọn loại BĐS');
      return;
    }
    const specForm = clearIncompatibleSpecValues(form, selectedPropertyType, 'admin_property');
    let parsedSchema: Record<string, unknown> | null = null;
    if (specForm.schema_markup && specForm.schema_markup.trim()) {
      try { parsedSchema = JSON.parse(specForm.schema_markup); }
      catch { parsedSchema = null; console.error('[PropertyForm] schema_markup JSON không hợp lệ'); }
    }
    const cs = (v: string) => v?.trim() || null;
    const cn = (v: string | number) => (v !== '' && v != null && !isNaN(Number(v))) ? Number(v) : null;
    onSave({
      // Để trống → createProperty tự sinh slug duy nhất; có nhập → dùng nguyên
      slug: cs(specForm.slug),
      title: specForm.title,
      description: cs(specForm.description),
      listing_type: specForm.listing_type,
      price: Number(specForm.price) || 0,
      price_unit: specForm.price_unit,
      price_label: cs(specForm.price_label),
      price_per_month: cn(specForm.price_per_month),
      area_sqm: cn(specForm.area_sqm),
      address: cs(specForm.address),
      city: specForm.city,
      district: cs(specForm.district),
      ward: cs(specForm.ward),
      area_id: cs(specForm.area_id),
      property_type_id: cs(specForm.property_type_id),
      image_url: cs(specForm.image_url),
      images: specForm.images.length > 0 ? specForm.images : null,
      badge: cs(specForm.badge),
      badge_color: specForm.badge_color || null,
      legal_status: cs(specForm.legal_status),
      is_featured: specForm.is_featured,
      is_hot: specForm.is_hot,
      is_active: specForm.is_active,
      is_verified: specForm.is_verified,
      contact_name: cs(specForm.contact_name),
      contact_phone: cs(specForm.contact_phone),
      contact_zalo: cs(specForm.contact_zalo),
      bedrooms: cn(specForm.bedrooms),
      bathrooms: cn(specForm.bathrooms),
      direction: cs(specForm.direction),
      road_width: cn(specForm.road_width),
      frontage: cn(specForm.frontage),
      floor_count: cn(specForm.floor_count),
      floor_number: cn(specForm.floor_number),
      latitude: cn(specForm.latitude),
      longitude: cn(specForm.longitude),
      vr_tour_url: cs(specForm.vr_tour_url),
      video_url: cs(specForm.video_url),
      meta_title: cs(specForm.meta_title),
      meta_description: cs(specForm.meta_description),
      focus_keywords: cs(specForm.focus_keywords),
      schema_markup: parsedSchema,
      faq: (() => {
        const valid = faq
          .map(it => ({ question: it.question.trim(), answer: it.answer.trim() }))
          .filter(it => it.question && it.answer);
        return valid.length ? valid : null;
      })(),
    } as Partial<Property>);
  };

  const addFaq = () => setFaq(prev => [...prev, { question: '', answer: '' }]);
  const removeFaq = (idx: number) => setFaq(prev => prev.filter((_, i) => i !== idx));
  const updateFaq = (idx: number, key: keyof FaqItem, value: string) =>
    setFaq(prev => prev.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));
  const suggestFaq = () => setFaq(prev => {
    const generated = buildPropertyFaq(form);
    const existing = new Set(prev.map(it => it.question.trim()));
    const merged = [...prev, ...generated.filter(g => !existing.has(g.question.trim()))];
    return merged;
  });

  const fld = (lbl: string, key: string, opts?: { type?: string; placeholder?: string; rows?: number; options?: string[] }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{lbl}</label>
      {opts?.rows ? (
        <textarea value={String(form[key as keyof typeof form] ?? '')} onChange={e => setField(key, e.target.value)}
          rows={opts.rows} placeholder={opts?.placeholder}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
      ) : opts?.options ? (
        <select value={String(form[key as keyof typeof form] ?? '')} onChange={e => setField(key, e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
          <option value="">-- Chọn --</option>
          {opts.options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input type={opts?.type ?? 'text'} value={String(form[key as keyof typeof form] ?? '')}
          onChange={e => setField(key, e.target.value)} placeholder={opts?.placeholder}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
      )}
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <div>
          <h2 className="font-bold text-gray-900 text-lg">{property ? 'Chỉnh sửa BĐS' : 'Thêm BĐS mới'}</h2>
          <p className="text-gray-400 text-xs mt-0.5">Điền đầy đủ thông tin để tăng điểm SEO và tỷ lệ chuyển đổi</p>
        </div>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex gap-0">
        {/* Main form */}
        <div className="flex-1 p-6 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>

          {/* Listing type */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Loại tin đăng *</label>
            <div className="flex gap-2">
              {[{ v: 'mua_ban', l: 'Mua bán' }, { v: 'cho_thue', l: 'Cho thuê' }].map(({ v, l }) => (
                <button key={v} type="button" onClick={() => setField('listing_type', v)}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg border-2 transition-colors ${form.listing_type === v ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 text-gray-600 hover:border-red-400'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Tiêu đề *
              <span className={`ml-2 text-[10px] font-normal ${form.title.length >= 30 && form.title.length <= 65 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {form.title.length}/65 ký tự
              </span>
            </label>
            <input value={form.title} onChange={e => setField('title', e.target.value)}
              placeholder="Tiêu đề BĐS (30–65 ký tự tối ưu SEO)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>

          {/* Price row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">{isRent ? 'Giá thuê' : 'Giá bán'} *</label>
              <div className="flex gap-2">
                <input type="number" value={String(form.price)} onChange={e => setField('price', parseFloat(e.target.value) || 0)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                <select value={form.price_unit} onChange={e => setField('price_unit', e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                  <option value="tỷ">tỷ</option>
                  <option value="triệu">triệu</option>
                  {isRent && <option value="triệu/tháng">tr/tháng</option>}
                </select>
              </div>
            </div>
            {fld('Nhãn giá', 'price_label', { placeholder: '2.5 tỷ, Thỏa thuận...' })}
          </div>

          {/* Province → District cascade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Tỉnh/Thành phố *</label>
              <select value={form.area_id} onChange={e => handleAreaChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                <option value="">-- Chọn tỉnh/thành --</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Quận/Huyện</label>
              {districts.length > 0 ? (
                <select value={form.district} onChange={e => handleDistrictChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                  <option value="">-- Chọn quận/huyện --</option>
                  {districts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              ) : (
                <input value={form.district} onChange={e => handleDistrictChange(e.target.value)}
                  placeholder="Nhập quận/huyện..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Phường/Xã</label>
              {wards.length > 0 ? (
                <select value={form.ward} onChange={e => setField('ward', e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                  <option value="">-- Chọn phường/xã --</option>
                  {wards.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                </select>
              ) : (
                <input value={form.ward} onChange={e => setField('ward', e.target.value)}
                  placeholder="Nhập phường/xã..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              )}
            </div>
          </div>

          {fld('Địa chỉ chi tiết', 'address', { placeholder: 'Số nhà, tên đường...' })}

          {/* Pin-drop map */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-red-500" />
              Xác định vị trí trên bản đồ
              <span className="font-normal text-gray-400 text-[10px]">(click để đặt ghim)</span>
            </label>
            <AdminPinMap
              lat={String(form.latitude)}
              lng={String(form.longitude)}
              searchQuery={mapSearchQuery}
              onChange={(lat, lng) => { setField('latitude', lat); setField('longitude', lng); }}
            />
            <div className="grid grid-cols-2 gap-3 mt-2">
              <input type="number" step="any" value={String(form.latitude)} onChange={e => setField('latitude', e.target.value)}
                placeholder="Vĩ độ (latitude)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400" />
              <input type="number" step="any" value={String(form.longitude)} onChange={e => setField('longitude', e.target.value)}
                placeholder="Kinh độ (longitude)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
          </div>

          {/* Area + type — fix: dùng id thay vì name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Loại BĐS *</label>
              <select value={form.property_type_id} onChange={e => setPropertyType(e.target.value)}
                className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 ${typeError ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                <option value="">-- Chọn loại --</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              {typeError && <p className="text-xs text-red-500 mt-1">{typeError}</p>}
            </div>
            {showSpec('area_sqm') && fld('Diện tích (m²)', 'area_sqm', { type: 'number', placeholder: '120' })}
          </div>

          {/* Specs */}
          <div className="grid grid-cols-4 gap-3">
            {(['bedrooms', 'bathrooms', 'floor_count', 'floor_number', 'frontage', 'road_width'] as SpecFieldKey[])
              .filter(showSpec)
              .map(field => fld(SPEC_LABELS[field], field, { type: 'number', placeholder: SPEC_PLACEHOLDERS[field] }))}
          </div>

          {/* Legal + direction */}
          <div className="grid grid-cols-2 gap-3">
            {showSpec('legal_status') && fld('Pháp lý', 'legal_status', { options: LEGAL_OPTIONS })}
            {showSpec('direction') && fld('Hướng nhà', 'direction', { options: DIRECTIONS })}
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            {fld('Tên người liên hệ', 'contact_name')}
            {fld('SĐT liên hệ', 'contact_phone')}
          </div>
          {fld('Zalo liên hệ', 'contact_zalo', { placeholder: '0901234567 hoặc https://zalo.me/...' })}

          {/* Images */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Ảnh đại diện</label>
            <ImageUrlInput value={form.image_url} onChange={url => setField('image_url', url)} placeholder="URL ảnh đại diện" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Thư viện ảnh</label>
            <ImageUpload images={form.images} onChange={imgs => setField('images', imgs)} maxImages={15} folder="properties" isAdmin />
          </div>

          {/* Media */}
          {fld('Link video thực tế (YouTube hoặc MP4)', 'video_url', { type: 'url', placeholder: 'https://youtube.com/...' })}
          {fld('Link VR Tour 360°', 'vr_tour_url', { type: 'url', placeholder: 'https://...' })}

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Mô tả chi tiết
              <span className={`ml-2 text-[10px] font-normal ${form.description.length >= 120 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {form.description.length} ký tự (tối thiểu 120)
              </span>
            </label>
            <textarea value={form.description} onChange={e => setField('description', e.target.value)} rows={12}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-y min-h-[10rem]" />
          </div>

          {/* FAQ nhập tay — ưu tiên hơn FAQ tự-sinh khi render public */}
          <div className="rounded-2xl border border-violet-100 bg-violet-50/50 p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Câu hỏi thường gặp (FAQ)</p>
                <p className="mt-1 text-[11px] text-violet-700/80">Hiển thị cuối trang chi tiết + sinh schema FAQPage. Để trống sẽ tự sinh từ dữ liệu tin. Chỉ câu đủ hỏi + đáp mới được lưu.</p>
              </div>
              <button type="button" onClick={suggestFaq}
                className="inline-flex flex-shrink-0 items-center gap-1 rounded-lg bg-violet-100 px-2.5 py-1.5 text-xs font-bold text-violet-700 hover:bg-violet-200">
                <Zap className="h-3.5 w-3.5" /> Gợi ý hỏi + đáp
              </button>
            </div>
            <div className="space-y-3">
              {faq.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-violet-100 bg-white p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-violet-600">Câu {idx + 1}</span>
                    <button type="button" onClick={() => removeFaq(idx)} className="text-red-500 hover:text-red-700" aria-label="Xóa câu hỏi">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <input value={item.question} onChange={e => updateFaq(idx, 'question', e.target.value)} placeholder="Câu hỏi..."
                    className="mb-2 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                  <textarea value={item.answer} onChange={e => updateFaq(idx, 'answer', e.target.value)} rows={2} placeholder="Câu trả lời (bắt buộc để lưu)..."
                    className="w-full resize-none rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400" />
                </div>
              ))}
              <button type="button" onClick={addFaq}
                className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-white px-3 py-1.5 text-xs font-semibold text-violet-700 hover:bg-violet-50">
                <Plus className="h-3.5 w-3.5" /> Thêm câu hỏi
              </button>
            </div>
          </div>

          {/* Badge */}
          <div className="grid grid-cols-2 gap-3">
            {fld('Badge nhãn', 'badge', { placeholder: 'Độc quyền, Giảm giá...' })}
            {fld('Màu badge', 'badge_color', { options: ['red', 'green', 'blue', 'orange'] })}
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-100">
            {[{ key: 'is_active', label: 'Đang hiển thị' }, { key: 'is_featured', label: 'Nổi bật' }, { key: 'is_hot', label: 'HOT' }, { key: 'is_verified', label: 'Đã xác minh' }].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!form[key as keyof typeof form]}
                  onChange={e => setField(key, e.target.checked)} className="accent-red-500 w-4 h-4" />
                <span className="text-sm text-gray-700 font-medium">{label}</span>
              </label>
            ))}
          </div>

          {/* ─── SEO Configuration ─────────────────────────────────────────────── */}
          <div className="pt-4 border-t border-gray-100">
            <h3 className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2">
              <Search className="w-4 h-4 text-red-500" />Cấu hình SEO
            </h3>
            <div className="mb-3 rounded-xl border border-amber-100 bg-amber-50/60 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-700">
                    <Wand2 className="h-3.5 w-3.5" /> Tự sinh SEO / GEO / schema
                  </p>
                  <p className="mt-1 text-[11px] text-amber-700/80">Sinh title/description/keywords + RealEstateListing JSON-LD (GEO contentLocation/spatialCoverage/about/areaServed + offers + video) từ dữ liệu BĐS thật. Bấm nút để điền, hoặc sửa tay bất kỳ ô nào.</p>
                </div>
                <button type="button" onClick={fillPropertyFromData}
                  className="inline-flex flex-shrink-0 items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white hover:bg-amber-700">
                  <Wand2 className="h-3.5 w-3.5" /> Điền mẫu từ dữ liệu
                </button>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tiêu đề SEO (tối đa 60 ký tự)
                  <span className={`ml-2 text-[10px] font-normal ${seo.titleValid ? 'text-emerald-600' : 'text-amber-600'}`}>{seo.titleLength}/60</span>
                </label>
                <input value={seo.metaTitle} onChange={e => seo.setMetaTitle(e.target.value)} maxLength={70}
                  placeholder="Tự động từ tiêu đề..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Meta Description (tối đa 155 ký tự)
                  <span className={`ml-2 text-[10px] font-normal ${seo.descValid ? 'text-emerald-600' : 'text-amber-600'}`}>{seo.descLength}/155</span>
                </label>
                <textarea value={seo.metaDescription} onChange={e => seo.setMetaDescription(e.target.value)} rows={2} maxLength={170}
                  placeholder="Tự động từ mô tả..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Từ khóa chính (Focus Keywords)</label>
                <input value={seo.focusKeywords} onChange={e => seo.setFocusKeywords(e.target.value)}
                  placeholder="bất động sản, Bình Dương, ..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">URL thân thiện (Slug)</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 flex-shrink-0">/bat-dong-san/</span>
                  <input value={form.slug} placeholder={generateSlug(form.title) || 'tu-dong-tao-tu-tieu-de'}
                    onChange={e => setField('slug', generateSlug(e.target.value))}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Để trống sẽ tự tạo từ tiêu đề (kèm mã ngắn đảm bảo duy nhất). URL: /bat-dong-san/{form.slug || (generateSlug(form.title) ? generateSlug(form.title) + '-xxxx' : 'slug')}</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Schema Markup (JSON-LD)</label>
                <textarea value={seo.schemaMarkup} onChange={e => seo.setSchemaMarkup(e.target.value)} rows={6}
                  className={`w-full border rounded-lg px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 resize-none ${seoSchemaState.error ? 'border-red-200 bg-red-50 focus:ring-red-300' : 'border-gray-200 focus:ring-red-400'}`} />
                <p className={`mt-1 text-[10px] ${seoSchemaState.error ? 'text-red-600' : 'text-emerald-600'}`}>{seoSchemaState.error || 'Schema BĐS tự sinh hợp lệ theo dữ liệu đang nhập.'}</p>
              </div>
              <button type="button" onClick={seo.resetAuto} className="text-xs text-red-600 hover:underline">↻ Tự động điền lại schema/SEO</button>
              <SEOPreview metaTitle={seo.metaTitle} metaDescription={seo.metaDescription} focusKeywords={seo.focusKeywords} />
            </div>
          </div>
        </div>

        {/* SEO Score Sidebar */}
        <div className="w-56 flex-shrink-0 bg-gray-50 border-l border-gray-200 p-4 space-y-4" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
          <div>
            <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />Điểm SEO
            </p>
            <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-3xl font-black ${seoColor}`}>{seoScore}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${seoScore >= 70 ? 'bg-emerald-100 text-emerald-700' : seoScore >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                  {seoLabel}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${seoBarColor} rounded-full transition-all duration-500`}
                  style={{ width: `${seoScore}%` }} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Checklist SEO</p>
            {[
              { label: 'Tiêu đề 30–65 ký tự', ok: form.title.length >= 30 && form.title.length <= 65 },
              { label: 'Mô tả ≥ 120 ký tự', ok: form.description.length >= 120 },
              { label: 'Ảnh đại diện', ok: !!form.image_url },
              { label: 'Diện tích', ok: !!form.area_sqm },
              { label: 'Giá bán', ok: Number(form.price) > 0 },
              { label: 'Vị trí bản đồ', ok: !!form.latitude && !!form.longitude },
              { label: 'Pháp lý', ok: !!form.legal_status },
              { label: 'Người liên hệ', ok: !!form.contact_phone },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-2">
                {ok
                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  : <div className="w-3.5 h-3.5 border-2 border-gray-300 rounded-full flex-shrink-0" />}
                <span className={`text-[11px] ${ok ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5">
            <p className="text-[10px] font-bold text-blue-800 mb-1">Mẹo tăng điểm</p>
            {form.title.length < 30 && <p className="text-[10px] text-blue-700 mb-0.5">• Tiêu đề quá ngắn — thêm khu vực & diện tích</p>}
            {form.description.length < 120 && <p className="text-[10px] text-blue-700 mb-0.5">• Mô tả thêm tiện ích, vị trí, ưu điểm</p>}
            {!form.latitude && <p className="text-[10px] text-blue-700 mb-0.5">• Click bản đồ để lấy tọa độ</p>}
            {!form.image_url && <p className="text-[10px] text-blue-700">• Thêm ảnh đại diện</p>}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
        <button onClick={onCancel} className="border border-gray-200 text-gray-600 px-5 py-2.5 rounded-lg text-sm hover:bg-gray-100 transition-colors">Hủy</button>
        <button onClick={handleSaveClick} disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2 shadow-sm">
          <Save className="w-4 h-4" />{saving ? 'Đang lưu...' : 'Lưu BĐS'}
        </button>
      </div>
    </div>
  );
}
