import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { X, Eye, Plus, Edit2, Trash2, CheckCircle, XCircle, MapPin, Search, Zap, Flame, Star, Wand2, Code2 } from 'lucide-react';
import type { District, Ward, Property, Area, PropertyType, Neighborhood } from '../../../lib/supabase';
import { normalizePublicVerificationSummary } from '../../../lib/propertyVerification';
import {
  adminGetPropertiesPage, getAreas, getPropertyTypes, createProperty, updateProperty, deleteProperty,
  getDistricts, getWards, getNeighborhoods, bulkUpdateProperties, bulkDeleteProperties,
  propertyRevalidationSnapshot, revalidatePropertyContent, type AdminPropertyFilters,
} from '../../../lib/api';
import { ImageUpload, ImageUrlInput } from '../../ImageUpload';
import { useSEOAutofill, SEOPreview, generateSlug } from '../../../lib/useSEOAutofill';
import { buildPropertyMetadata, buildPropertyJsonLd } from '../../../lib/seo';
import { parseSeoSchema } from '../shared/SeoFields';
import { buildPropertyFaq, type FaqItem } from '../../../lib/propertyFaq';
import { formToProperty } from '../../../lib/listingForm';
import { LocationPicker, type GeocodeTarget, type TaxonomyScope } from '../../LocationPicker';
import { PropertyDetailPage } from '../../../screens/PropertyDetailPage';
import { ConfirmDialog } from '../shared/ConfirmDialog';
import { PublicUrlPreview } from '../shared/PublicUrlPreview';
import { LEGAL_OPTIONS } from '../../../lib/legalOptions';
import { clearIncompatibleSpecValues, getCompatibleSpecFields, type SpecFieldKey } from '../../../lib/propertySpecs';
import { RichTextEditor } from '../shared/RichTextEditor';
import { stripHtml, isHtmlContent } from '../../../lib/markdown';
import { sanitizeArticleHtml } from '../../../lib/sanitizeHtml';
import { parseLegacyPropertyVideo, parseVrTourUrl } from '../../../lib/videoMedia';
import { validateCoordinatePair } from '../../../lib/locationCoordinates';
import { buildProductPath } from '../../../lib/productPath';
import { applyAreaSelection, applyDistrictSelection, resolveUniqueDistrict } from '../../../lib/locationSelection';
import { useTaxonomyGeo } from '../../../lib/hooks/useTaxonomy';
import { pickTaxonomyGeo, taxonomyGeoLabel } from '../../../lib/taxonomyGeo';
import { findExactTaxonomyGeo, validatePointForWard } from '../../../lib/taxonomyPoint';
import { formatListingPrice, formatPriceInput, parsePriceInput, priceInputFromNumber } from '../../../lib/listingPrice';
import { ListingPrice } from '../../ListingPrice';
import { normalizeListingTitle } from '../../../lib/listingTitle';
import { PriceField } from '../../PriceField';

// ─── Properties Tab ───────────────────────────────────────────────────────────
export function PropertiesTab({ onStatsRefresh, focusEditId, onFocusHandled }: { onStatsRefresh?: () => void; focusEditId?: string; onFocusHandled?: () => void }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [types, setTypes] = useState<PropertyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<AdminPropertyFilters>({
    keyword: '', listingType: 'all', status: 'all', sort: 'newest', page: 1, limit: 25,
  });
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<Property | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Bulk selection (Sprint 3c)
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const loadRequestRef = useRef(0);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const activeFilters = useMemo(() => ({ ...filters, keyword: debouncedKeyword }), [filters, debouncedKeyword]);
  const load = useCallback(async () => {
    const requestId = ++loadRequestRef.current;
    setLoading(true);
    try {
      const [pageResult, a, t] = await Promise.all([
        adminGetPropertiesPage(activeFilters), getAreas(), getPropertyTypes(),
      ]);
      if (requestId !== loadRequestRef.current) return;
      setProperties(pageResult.data); setTotal(pageResult.total); setAreas(a); setTypes(t);
    } catch (error) {
      if (requestId !== loadRequestRef.current) return;
      console.error('[AdminPanel] Không tải được danh mục BĐS:', error);
      alert(`Không tải được danh mục BĐS: ${(error as Error).message}`);
    } finally {
      if (requestId === loadRequestRef.current) setLoading(false);
    }
  }, [activeFilters]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedKeyword(filters.keyword ?? ''), 300);
    return () => window.clearTimeout(timer);
  }, [filters.keyword]);
  useEffect(() => { load(); }, [load]);
  // Hành động hàng loạt luôn chỉ áp dụng các hàng của kết quả đang xem. Không giữ
  // lựa chọn khi đổi điều kiện hoặc trang để snapshot revalidation luôn đầy đủ.
  useEffect(() => { setSelected(new Set()); }, [activeFilters]);

  const updateFilters = (patch: Partial<AdminPropertyFilters>) => {
    setFilters(current => ({ ...current, ...patch, page: patch.page ?? 1 }));
  };
  const clearFilters = () => setFilters({ keyword: '', listingType: 'all', status: 'all', sort: 'newest', page: 1, limit: filters.limit ?? 25 });
  const hasActiveFilters = Boolean(
    filters.keyword || (filters.listingType && filters.listingType !== 'all') || filters.areaId || filters.typeId ||
    (filters.status && filters.status !== 'all') || filters.isFeatured || filters.isHot || filters.isVerified ||
    (filters.sort && filters.sort !== 'newest'),
  );
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 25;
  const pageCount = Math.max(1, Math.ceil(total / limit));
  const pageStart = total === 0 ? 0 : (page - 1) * limit + 1;
  const pageEnd = Math.min(page * limit, total);

  // Mở thẳng form sửa khi được điều hướng từ Entity Audit (SeoGeoTab).
  useEffect(() => {
    if (!focusEditId || loading) return;
    const target = properties.find(p => p.id === focusEditId);
    if (target) { setEditing(target); setCreating(false); }
    onFocusHandled?.();
  }, [focusEditId, loading, properties]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Bulk helpers ─────────────────────────────────────────────────────────
  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });
  const visibleIds = properties.map(p => p.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every(id => selected.has(id));
  const toggleAll = () => setSelected(prev => {
    if (allVisibleSelected) {
      const next = new Set(prev);
      visibleIds.forEach(id => next.delete(id));
      return next;
    }
    return new Set([...prev, ...visibleIds]);
  });
  const clearSelection = () => setSelected(new Set());

  const warnRevalidation = async (action: 'create' | 'update' | 'delete' | 'publish' | 'unpublish' | 'bulk', targets: Parameters<typeof revalidatePropertyContent>[1]) => {
    try {
      await revalidatePropertyContent(action, targets);
    } catch (error) {
      console.error('[AdminPanel] Đã lưu BĐS nhưng chưa làm mới cache:', error);
      alert('Đã lưu dữ liệu nhưng chưa làm mới được cache công khai. Hãy thử lưu lại hoặc liên hệ quản trị viên.');
    }
  };
  const runBulk = async (
    fn: () => Promise<number>,
    label: string,
    targets: Parameters<typeof revalidatePropertyContent>[1],
  ) => {
    setBulkBusy(true);
    try {
      const n = await fn();
      if (n > 0) await warnRevalidation('bulk', targets);
      clearSelection();
      await load(); onStatsRefresh?.();
      console.info(`[AdminPanel] Bulk ${label}: ${n} BĐS`);
    } catch (e) {
      console.error(`[AdminPanel] Bulk ${label} thất bại:`, e);
      alert(`Thao tác hàng loạt thất bại: ${(e as { message?: string })?.message ?? 'Lỗi không xác định'}`);
    } finally { setBulkBusy(false); }
  };
  const selectedIds = () => Array.from(selected);
  const selectedPropertyTargets = (patch: Partial<Pick<Property, 'is_active' | 'is_hot' | 'is_featured'>>) =>
    properties.filter(property => selected.has(property.id)).map(property => ({
      previous: propertyRevalidationSnapshot(property),
      current: propertyRevalidationSnapshot({ ...property, ...patch }),
    }));

  const handleSave = async (data: Partial<Property>) => {
    setSaving(true);
    try {
      if (creating) {
        const saved = await createProperty(data as Omit<Property, 'id' | 'created_at' | 'updated_at' | 'views' | 'areas' | 'property_types'>);
        await warnRevalidation('create', [{ current: propertyRevalidationSnapshot(saved) }]);
      } else if (editing) {
        const saved = await updateProperty(editing.id, data);
        await warnRevalidation('update', [{
          previous: propertyRevalidationSnapshot(editing),
          current: propertyRevalidationSnapshot(saved),
        }]);
      }
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
    const previous = properties.find(property => property.id === id);
    try {
      await deleteProperty(id);
      if (previous) await warnRevalidation('delete', [{ previous: propertyRevalidationSnapshot(previous) }]);
      setConfirmDelete(null);
      await load(); onStatsRefresh?.();
    } catch (error) {
      console.error('[AdminPanel] Xóa BĐS thất bại:', error);
      alert(`Xóa BĐS thất bại: ${(error as Error).message}`);
    }
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
        <div>
          <h2 className="text-base font-bold text-gray-900">Danh mục bất động sản</h2>
          <p className="mt-0.5 text-xs text-gray-500">Tìm và quản lý nhanh toàn bộ tin, kể cả tin đang ẩn.</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />Thêm BĐS
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
        <div className="grid gap-2 lg:grid-cols-[minmax(0,1.8fr)_repeat(4,minmax(0,1fr))]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input value={filters.keyword ?? ''} onChange={event => updateFilters({ keyword: event.target.value })}
              placeholder="Tìm tiêu đề, mã tin, slug, địa chỉ..." className="w-full rounded-lg border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>
          <select value={filters.listingType ?? 'all'} onChange={event => updateFilters({ listingType: event.target.value as AdminPropertyFilters['listingType'] })}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
            <option value="all">Tất cả giao dịch</option><option value="mua_ban">Mua bán</option><option value="cho_thue">Cho thuê</option>
          </select>
          <select value={filters.areaId ?? ''} onChange={event => updateFilters({ areaId: event.target.value || undefined })}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
            <option value="">Tất cả khu vực</option>{areas.map(area => <option key={area.id} value={area.id}>{area.name}</option>)}
          </select>
          <select value={filters.typeId ?? ''} onChange={event => updateFilters({ typeId: event.target.value || undefined })}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
            <option value="">Tất cả loại BĐS</option>{types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
          </select>
          <select value={filters.status ?? 'all'} onChange={event => updateFilters({ status: event.target.value as AdminPropertyFilters['status'] })}
            className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
            <option value="all">Mọi trạng thái</option><option value="active">Đang hiển thị</option><option value="inactive">Đang ẩn</option>
          </select>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600"><input type="checkbox" checked={Boolean(filters.isFeatured)} onChange={event => updateFilters({ isFeatured: event.target.checked || undefined })} className="accent-red-600" />Nổi bật</label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600"><input type="checkbox" checked={Boolean(filters.isHot)} onChange={event => updateFilters({ isHot: event.target.checked || undefined })} className="accent-red-600" />HOT</label>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600"><input type="checkbox" checked={Boolean(filters.isVerified)} onChange={event => updateFilters({ isVerified: event.target.checked || undefined })} className="accent-red-600" />Hồ sơ đã kiểm tra</label>
          <select value={filters.sort ?? 'newest'} onChange={event => updateFilters({ sort: event.target.value as AdminPropertyFilters['sort'] })}
            className="ml-auto rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400">
            <option value="newest">Mới tạo nhất</option><option value="updated">Mới cập nhật</option><option value="views">Nhiều lượt xem</option><option value="price_asc">Giá tăng dần</option><option value="price_desc">Giá giảm dần</option>
          </select>
          {hasActiveFilters && <button type="button" onClick={clearFilters} className="rounded-lg px-2.5 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50">Xóa bộ lọc</button>}
        </div>
      </div>

      {/* Bulk action bar (Sprint 3c) — hiện khi có chọn */}
      {selected.size > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-gray-900 text-white rounded-xl px-4 py-2.5 animate-fade-in">
          <span className="text-sm font-semibold mr-1">Đã chọn {selected.size}</span>
          <button disabled={bulkBusy} onClick={() => runBulk(
            () => bulkUpdateProperties(selectedIds(), { is_active: true }),
            'hiện',
            selectedPropertyTargets({ is_active: true }),
          )}
            className="flex items-center gap-1 text-xs font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <CheckCircle className="w-3.5 h-3.5" />Hiện
          </button>
          <button disabled={bulkBusy} onClick={() => runBulk(
            () => bulkUpdateProperties(selectedIds(), { is_active: false }),
            'ẩn',
            selectedPropertyTargets({ is_active: false }),
          )}
            className="flex items-center gap-1 text-xs font-medium bg-gray-600 hover:bg-gray-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <XCircle className="w-3.5 h-3.5" />Ẩn
          </button>
          <button disabled={bulkBusy} onClick={() => runBulk(
            () => bulkUpdateProperties(selectedIds(), { is_hot: true }),
            'gắn HOT',
            selectedPropertyTargets({ is_hot: true }),
          )}
            className="flex items-center gap-1 text-xs font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <Flame className="w-3.5 h-3.5" />HOT
          </button>
          <button disabled={bulkBusy} onClick={() => runBulk(
            () => bulkUpdateProperties(selectedIds(), { is_featured: true }),
            'gắn nổi bật',
            selectedPropertyTargets({ is_featured: true }),
          )}
            className="flex items-center gap-1 text-xs font-medium bg-amber-500 hover:bg-amber-400 disabled:opacity-50 px-2.5 py-1.5 rounded-lg transition-colors">
            <Star className="w-3.5 h-3.5" />Nổi bật
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
                    <input type="checkbox" checked={allVisibleSelected} onChange={toggleAll}
                      aria-label="Chọn tất cả trên trang hiện tại" className="w-4 h-4 rounded border-gray-300 text-red-600 focus:ring-red-400 cursor-pointer" />
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
                {properties.map(p => (
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
                            {normalizePublicVerificationSummary(p) && <span className="text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded">Hồ sơ đã kiểm tra</span>}
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
                      <ListingPrice source={p} variant="admin" />
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <button onClick={async () => {
                        try {
                          const saved = await updateProperty(p.id, { is_active: !p.is_active });
                          await warnRevalidation(saved.is_active ? 'publish' : 'unpublish', [{
                            previous: propertyRevalidationSnapshot(p),
                            current: propertyRevalidationSnapshot(saved),
                          }]);
                          await load();
                        } catch (error) {
                          console.error('[AdminPanel] Cập nhật trạng thái BĐS thất bại:', error);
                          alert(`Cập nhật trạng thái thất bại: ${(error as Error).message}`);
                        }
                      }}
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
          {properties.length === 0 && <div className="px-4 py-10 text-center text-sm text-gray-400">{hasActiveFilters ? <><p>Không có BĐS khớp bộ lọc hiện tại.</p><button type="button" onClick={clearFilters} className="mt-2 font-semibold text-red-600 hover:underline">Xóa bộ lọc</button></> : 'Chưa có bất động sản nào.'}</div>}
          {total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
              <span>Hiển thị {pageStart}–{pageEnd} trong {total} BĐS</span>
              <div className="flex items-center gap-2">
                <select value={limit} onChange={event => updateFilters({ limit: Number(event.target.value) })} className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-red-400" aria-label="Số BĐS mỗi trang">
                  <option value={25}>25 / trang</option><option value={50}>50 / trang</option><option value={100}>100 / trang</option>
                </select>
                <button type="button" disabled={page <= 1 || loading} onClick={() => updateFilters({ page: page - 1 })} className="rounded-lg border border-gray-200 px-2.5 py-1.5 font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">Trước</button>
                <span className="font-semibold text-gray-700">Trang {page}/{pageCount}</span>
                <button type="button" disabled={page >= pageCount || loading} onClick={() => updateFilters({ page: page + 1 })} className="rounded-lg border border-gray-200 px-2.5 py-1.5 font-semibold text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">Sau</button>
              </div>
            </div>
          )}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog message="Bạn có chắc chắn muốn xóa bất động sản này?"
          onConfirm={() => handleDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      )}

      {confirmBulkDelete && (
        <ConfirmDialog message={`Xóa ${selected.size} bất động sản đã chọn? Thao tác không thể hoàn tác.`}
          onConfirm={() => {
            const targets = properties.filter(property => selected.has(property.id)).map(property => ({ previous: propertyRevalidationSnapshot(property) }));
            setConfirmBulkDelete(false);
            runBulk(() => bulkDeleteProperties(selectedIds()), 'xóa', targets);
          }}
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
  const descPlain = isHtmlContent(description ?? '') ? stripHtml(description ?? '') : (description ?? '');
  const descLen = descPlain.trim().length;
  if (descLen >= 120) score += 30;
  else if (descLen >= 60) score += 15;
  if (imageUrl) score += 15;
  if (areaSqm) score += 10;
  if (price) score += 15;
  return Math.min(score, 100);
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
    price: priceInputFromNumber(property?.price),
    price_unit: property?.price_unit ?? 'tỷ',
    price_label: property?.price_label ?? '',
    price_per_month: priceInputFromNumber(property?.price_per_month ?? (property?.listing_type === 'cho_thue' && property.price_unit === 'triệu/tháng' ? property.price : null)),
    loan_support: priceInputFromNumber(property?.loan_support),
    area_sqm: property?.area_sqm ?? '',
    address: property?.address ?? '',
    city: property?.city ?? '',
    district: property?.district ?? '',
    ward: property?.ward ?? '',
    neighborhood_slug: property?.neighborhood_slug ?? '',
    area_id: property?.area_id ?? '',
    district_id: property?.district_id ?? '',
    ward_id: property?.ward_id ?? '',
    property_type_id: property?.property_type_id ?? '',
    image_url: property?.image_url ?? '',
    images: property?.images ?? [] as string[],
    badge: property?.badge ?? '',
    badge_color: property?.badge_color ?? 'red',
    legal_status: property?.legal_status ?? '',
    is_featured: property?.is_featured ?? false,
    is_hot: property?.is_hot ?? false,
    is_active: property?.is_active ?? true,
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
  const [titleCorrection, setTitleCorrection] = useState('');
  const [faq, setFaq] = useState<FaqItem[]>(property?.faq ?? []);

  const [districts, setDistricts] = useState<District[]>([]);
  const [wards, setWards] = useState<Ward[]>([]);
  const [neighborhoods, setNeighborhoods] = useState<Neighborhood[]>([]);
  const districtsRequestRef = useRef(0);
  const wardsRequestRef = useRef(0);
  const neighborhoodsRequestRef = useRef(0);
  const selectedDistrict = districts.find(d => d.id === form.district_id && d.area_id === form.area_id);
  const selectedWardById = wards.find(w => w.id === form.ward_id && w.district_id === selectedDistrict?.id);
  const legacyWardMatches = wards.filter(w => w.name === form.ward && w.district_id === selectedDistrict?.id);
  const selectedWard = selectedWardById ?? (legacyWardMatches.length === 1 ? legacyWardMatches[0] : undefined);
  const taxonomyGeoIds = [form.area_id, selectedDistrict?.id, selectedWard?.id].filter((id): id is string => Boolean(id));
  const { data: taxonomyGeo = [] } = useTaxonomyGeo(taxonomyGeoIds);
  const selectedTaxonomyGeo = pickTaxonomyGeo(taxonomyGeo, {
    areaId: form.area_id,
    districtId: selectedDistrict?.id,
    wardId: selectedWard?.id,
  });
  const selectedWardGeo = findExactTaxonomyGeo(taxonomyGeo, 'ward', selectedWard?.id);
  const [geocodeTarget, setGeocodeTarget] = useState<GeocodeTarget | undefined>();
  const [mapResetNonce, setMapResetNonce] = useState(0);
  const geocodeNonce = useRef(0);
  const addressSearchActiveRef = useRef(false);
  const addressEditedRef = useRef(false);
  const flyTo = useCallback((query: string, zoom: number, intent: GeocodeTarget['intent'] = 'taxonomy', bounds?: GeocodeTarget['bounds'], taxonomyLabel?: string, geojson?: GeocodeTarget['geojson'], taxonomyScope?: TaxonomyScope) => {
    if (!query) return;
    if (intent === 'address') addressSearchActiveRef.current = true;
    setGeocodeTarget({ query, zoom, intent, bounds, taxonomyLabel, geojson, taxonomyScope, nonce: ++geocodeNonce.current });
  }, []);
  const [showPreview, setShowPreview] = useState(false);
  const [descriptionMode, setDescriptionMode] = useState<'visual' | 'html'>('visual');
  const [typeError, setTypeError] = useState('');
  const isRent = form.listing_type === 'cho_thue';
  const selectedPropertyType = types.find(t => t.id === form.property_type_id);
  const visibleSpecFields = getCompatibleSpecFields(selectedPropertyType, 'admin_property');
  const showSpec = (field: SpecFieldKey) => visibleSpecFields.includes(field);
  const seoScore = calcSeoScore(form.title, form.description, form.image_url, form.area_sqm, form.price);
  // Đếm độ dài mô tả trên text đã strip HTML (mô tả nay là rich HTML có thể chứa bảng/thẻ).
  const descLen = (isHtmlContent(form.description) ? stripHtml(form.description) : form.description).trim().length;

  // ─── SEO Autofill ───────────────────────────────────────────────────────────
  const seo = useSEOAutofill({
    title: form.title,
    description: form.description,
    price: parsePriceInput(form.price) ?? undefined,
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
  const normalizeTitleInput = useCallback(() => {
    const normalized = normalizeListingTitle(form.title, [form.city, form.district, form.ward]);
    if (!normalized.changed) return;
    setForm(current => ({ ...current, title: normalized.value }));
    setTitleCorrection('Đã tự sửa viết hoa, khoảng trắng hoặc lỗi chính tả trong tiêu đề.');
  }, [form.title, form.city, form.district, form.ward]);
  const setPropertyType = (id: string) => {
    const nextType = types.find(t => t.id === id);
    setTypeError('');
    setForm(f => clearIncompatibleSpecValues({ ...f, property_type_id: id }, nextType, 'admin_property'));
  };

  const handleAreaChange = useCallback((areaId: string) => {
    addressSearchActiveRef.current = false;
    addressEditedRef.current = false;
    if (!areaId) {
      setGeocodeTarget(undefined);
      setMapResetNonce(current => current + 1);
    }
    const area = areas.find(a => a.id === areaId);
    const requestId = ++districtsRequestRef.current;
    ++wardsRequestRef.current;
    ++neighborhoodsRequestRef.current;
    setForm(f => applyAreaSelection(f, areaId, area?.name ?? ''));
    setWards([]);
    setNeighborhoods([]);
    if (areaId) {
      getDistricts(areaId).then(next => {
        if (requestId === districtsRequestRef.current) setDistricts(next);
      }).catch(() => {
        if (requestId === districtsRequestRef.current) setDistricts([]);
      });
    } else {
      setDistricts([]);
    }
  }, [areas]);

  const handleDistrictChange = useCallback((districtId: string) => {
    addressSearchActiveRef.current = false;
    addressEditedRef.current = false;
    const district = districts.find(x => x.id === districtId) ?? null;
    const requestId = ++wardsRequestRef.current;
    ++neighborhoodsRequestRef.current;
    setForm(f => applyDistrictSelection(f, district));
    setNeighborhoods([]);
    if (district) getWards(district.id).then(next => {
      if (requestId === wardsRequestRef.current) setWards(next);
    }).catch(() => {
      if (requestId === wardsRequestRef.current) setWards([]);
    });
    else setWards([]);
  }, [districts]);

  const handleWardChange = useCallback((wardId: string) => {
    addressSearchActiveRef.current = false;
    addressEditedRef.current = false;
    const requestId = ++neighborhoodsRequestRef.current;
    const ward = wards.find(item => item.id === wardId) ?? null;
    setForm(current => ({
      ...current,
      ward_id: ward?.id ?? '',
      ward: ward?.name ?? '',
      neighborhood_slug: '',
      address: '',
      latitude: '',
      longitude: '',
    }));
    if (ward) getNeighborhoods(ward.id).then(next => {
      if (requestId === neighborhoodsRequestRef.current) setNeighborhoods(next);
    }).catch(() => {
      if (requestId === neighborhoodsRequestRef.current) setNeighborhoods([]);
    });
    else setNeighborhoods([]);
  }, [wards]);

  useEffect(() => {
    const areaId = property?.area_id;
    const requestId = ++districtsRequestRef.current;
    if (!areaId) {
      setDistricts([]);
      return;
    }
    getDistricts(areaId).then(next => {
      if (requestId === districtsRequestRef.current) setDistricts(next);
    }).catch(() => {
      if (requestId === districtsRequestRef.current) setDistricts([]);
    });
  }, [property?.area_id]);

  // Tin cũ chỉ có text district được nâng cấp trong state khi có đúng một match
  // dưới area hiện tại; tránh gán nhầm nếu taxonomy đã đổi hoặc tên trùng nhau.
  useEffect(() => {
    if (form.district_id || !form.area_id || !form.district || districts.length === 0) return;
    const matched = resolveUniqueDistrict(districts, form.area_id, form.district);
    if (matched) setForm(f => f.district_id ? f : { ...f, district_id: matched.id, district: matched.name });
  }, [districts, form.area_id, form.district, form.district_id]);

  // Nạp wards theo ID đã lưu. Fallback unique-name phục vụ lượt render đầu của tin cũ.
  useEffect(() => {
    const districtId = form.district_id
      || resolveUniqueDistrict(districts, form.area_id, form.district)?.id;
    const requestId = ++wardsRequestRef.current;
    ++neighborhoodsRequestRef.current;
    if (!districtId) {
      setWards([]);
      setNeighborhoods([]);
      return;
    }
    getWards(districtId).then(next => {
      if (requestId === wardsRequestRef.current) setWards(next);
    }).catch(() => {
      if (requestId === wardsRequestRef.current) setWards([]);
    });
  }, [districts, form.area_id, form.district, form.district_id]);

  useEffect(() => {
    if (!selectedDistrict?.id || !form.ward || wards.length === 0 || selectedWardById) return;
    if (legacyWardMatches.length === 1) {
      setForm(current => ({ ...current, ward_id: legacyWardMatches[0].id, ward: legacyWardMatches[0].name }));
    } else if (form.ward_id) {
      setForm(current => ({ ...current, ward_id: '' }));
    }
  }, [selectedDistrict?.id, form.ward, form.ward_id, wards, selectedWardById, legacyWardMatches]);

  // Nạp khu dân cư khi sửa BĐS có sẵn ward (wards vừa load xong → map tên ra id).
  useEffect(() => {
    if (!property?.ward || wards.length === 0) return;
    const w = wards.find(x => x.name === property.ward);
    if (!w) return;
    const requestId = ++neighborhoodsRequestRef.current;
    getNeighborhoods(w.id).then(next => {
      if (requestId === neighborhoodsRequestRef.current) setNeighborhoods(next);
    }).catch(() => {
      if (requestId === neighborhoodsRequestRef.current) setNeighborhoods([]);
    });
  }, [wards, property?.ward]);

  useEffect(() => {
    if (!form.area_id || addressSearchActiveRef.current) return;
    const query = [form.ward, form.district, form.city].filter(Boolean).join(', ');
    if (!query) return;
    const taxonomyScope: TaxonomyScope = {
      level: form.ward ? 'ward' : form.district ? 'district' : 'area',
      areaName: form.city,
      districtName: form.district || undefined,
      wardName: form.ward || undefined,
    };
    const zoom = form.ward ? 14 : form.district ? 13 : 11;
    flyTo(query, zoom, 'taxonomy', selectedTaxonomyGeo?.bounds, taxonomyGeoLabel(selectedTaxonomyGeo), selectedTaxonomyGeo?.geojson ?? undefined, taxonomyScope);
  }, [form.area_id, form.city, form.district, form.ward, selectedTaxonomyGeo, flyTo]);

  const seoColor = seoScore >= 70 ? 'text-emerald-600' : seoScore >= 40 ? 'text-amber-600' : 'text-red-600';
  const seoBarColor = seoScore >= 70 ? 'bg-emerald-500' : seoScore >= 40 ? 'bg-amber-500' : 'bg-red-500';
  const seoLabel = seoScore >= 70 ? 'Tốt' : seoScore >= 40 ? 'Trung bình' : 'Cần cải thiện';
  // Tin đã lưu có public_code → preview đúng URL canonical mới, kể cả khi admin đang
  // sửa slug/khu vực. Tin mới chưa có code nên chỉ biết URL sau khi lưu lần đầu.
  const publicUrlPreview = useMemo(() => {
    if (!property?.public_code) return '';
    const preview = formToProperty(form as Record<string, unknown>, property, types, faq);
    const previewArea = areas.find(a => a.id === preview.area_id) ?? property.areas ?? null;
    return buildProductPath({ ...preview, areas: previewArea });
  }, [form, property, types, faq, areas]);

  // ─── Handle Save Click an toàn ──────────────────────────────────────────────
  const handleSaveClick = () => {
    if (!form.property_type_id) {
      setTypeError('Vui lòng chọn loại BĐS');
      return;
    }
    const coordinates = validateCoordinatePair(form.latitude, form.longitude);
    if (!coordinates.valid) {
      window.alert(coordinates.message);
      return;
    }
    if (!isRent) {
      const price = parsePriceInput(form.price);
      const loan = parsePriceInput(form.loan_support);
      if (loan !== null && (!price || loan <= 0 || loan >= price)) {
        window.alert('Khoản vay phải lớn hơn 0 và nhỏ hơn giá bán.');
        return;
      }
    }
    const specForm = clearIncompatibleSpecValues(form, selectedPropertyType, 'admin_property');
    const canonicalTitle = normalizeListingTitle(specForm.title, [specForm.city, specForm.district, specForm.ward]).value;
    if (canonicalTitle !== specForm.title) {
      setForm(current => ({ ...current, title: canonicalTitle }));
      setTitleCorrection('Đã tự sửa viết hoa, khoảng trắng hoặc lỗi chính tả trong tiêu đề.');
    }
    const validatedDistrict = districts.find(d => d.id === specForm.district_id);
    if (!specForm.area_id) {
      window.alert('Vui lòng chọn tỉnh/thành phố từ taxonomy.');
      return;
    }
    if (!validatedDistrict || validatedDistrict.area_id !== specForm.area_id) {
      window.alert('Vui lòng chọn quận/huyện thuộc đúng tỉnh/thành phố.');
      return;
    }
    const validatedWard = wards.find(ward => ward.id === specForm.ward_id && ward.district_id === validatedDistrict.id);
    if (!validatedWard) {
      window.alert('Vui lòng chọn xã/phường thuộc đúng quận/huyện.');
      return;
    }
    if (coordinates.coordinates.latitude !== null && coordinates.coordinates.longitude !== null) {
      const pointValidation = validatePointForWard(
        { lat: coordinates.coordinates.latitude, lng: coordinates.coordinates.longitude },
        validatedWard.id,
        selectedWardGeo,
        validatedWard.name,
      );
      if (!pointValidation.valid) {
        window.alert(pointValidation.message);
        return;
      }
    }
    let parsedSchema: Record<string, unknown> | null = null;
    if (specForm.schema_markup && specForm.schema_markup.trim()) {
      try { parsedSchema = JSON.parse(specForm.schema_markup); }
      catch { parsedSchema = null; console.error('[PropertyForm] schema_markup JSON không hợp lệ'); }
    }
    const cs = (v: string) => v?.trim() || null;
    const cn = (v: string | number) => (v !== '' && v != null && !isNaN(Number(v))) ? Number(v) : null;
    const priceValue = (v: string | number) => typeof v === 'string'
      ? parsePriceInput(v)
      : (v != null && Number.isFinite(v) ? v : null);
    const videoUrl = cs(specForm.video_url);
    const vrTourUrl = cs(specForm.vr_tour_url);
    if (videoUrl && !parseLegacyPropertyVideo(videoUrl, `Video: ${specForm.title}`)) {
      window.alert('Link video không hợp lệ. Chỉ chấp nhận YouTube HTTPS hoặc MP4 đã tải lên kho media của hệ thống.');
      return;
    }
    if (vrTourUrl && !parseVrTourUrl(vrTourUrl)) {
      window.alert('Link VR Tour không hợp lệ. Chỉ chấp nhận URL HTTPS.');
      return;
    }
    onSave({
      // Để trống → createProperty tự sinh slug duy nhất; có nhập → dùng nguyên
      slug: cs(specForm.slug),
      title: canonicalTitle,
      // Dữ liệu từ visual/source editor được chuẩn hóa trước khi lưu, giống News.
      // Renderer public vẫn sanitize lại như lớp phòng thủ thứ hai.
      description: cs(sanitizeArticleHtml(specForm.description)),
      listing_type: specForm.listing_type,
      price: isRent ? 0 : priceValue(specForm.price) ?? 0,
      price_unit: isRent ? 'triệu/tháng' : specForm.price_unit,
      price_label: cs(specForm.price_label),
      price_per_month: isRent ? priceValue(specForm.price_per_month) : null,
      loan_support: priceValue(specForm.loan_support),
      area_sqm: cn(specForm.area_sqm),
      address: cs(specForm.address),
      city: specForm.city,
      district: cs(specForm.district),
      ward: cs(specForm.ward),
      neighborhood_slug: cs(specForm.neighborhood_slug),
      area_id: cs(specForm.area_id),
      district_id: cs(specForm.district_id),
      ward_id: cs(specForm.ward_id),
      property_type_id: cs(specForm.property_type_id),
      image_url: cs(specForm.image_url),
      images: specForm.images.length > 0 ? specForm.images : null,
      badge: cs(specForm.badge),
      badge_color: specForm.badge_color || null,
      legal_status: cs(specForm.legal_status),
      is_featured: specForm.is_featured,
      is_hot: specForm.is_hot,
      is_active: specForm.is_active,
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
      latitude: coordinates.coordinates.latitude,
      longitude: coordinates.coordinates.longitude,
      vr_tour_url: vrTourUrl,
      video_url: videoUrl,
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
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
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
                <button key={v} type="button" onClick={() => setForm(f => ({ ...f, listing_type: v as 'mua_ban' | 'cho_thue', price_unit: v === 'cho_thue' ? 'triệu/tháng' : f.price_unit === 'triệu/tháng' ? 'tỷ' : f.price_unit }))}
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
            <input value={form.title} onChange={e => { setField('title', e.target.value); setTitleCorrection(''); }}
              onBlur={normalizeTitleInput}
              spellCheck
              autoCapitalize="sentences"
              placeholder="Tiêu đề BĐS (30–65 ký tự tối ưu SEO)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            {titleCorrection && <p role="status" aria-live="polite" className="mt-1.5 text-xs font-medium text-emerald-600">{titleCorrection}</p>}
          </div>

          <section className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-black text-gray-800">Giá bất động sản</h3>
                <p className="mt-0.5 text-xs text-gray-500">Giá hiển thị sẽ tự lấy đúng giá bán hoặc giá thuê mỗi tháng.</p>
              </div>
              <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-bold text-red-600 ring-1 ring-red-100">Bắt buộc</span>
            </div>
            <label className="mb-1 block text-xs font-semibold text-gray-700">{isRent ? 'Giá thuê mỗi tháng *' : 'Giá bán *'}</label>
            <PriceField
              mode={isRent ? 'rent' : 'sale'}
              value={isRent ? form.price_per_month : form.price}
              unit={form.price_unit}
              onChange={value => setField(isRent ? 'price_per_month' : 'price', value)}
              onUnitChange={unit => setField('price_unit', unit)}
              error={undefined}
              id="admin-listing-price"
            />
            {!isRent && (
              <div className="mt-4 rounded-xl border border-white bg-white/80 p-3">
                <label className="mb-1 block text-xs font-semibold text-gray-700">Chủ hỗ trợ vay ngân hàng ({form.price_unit}, tùy chọn)</label>
                <input type="text" inputMode="decimal" value={form.loan_support} onChange={e => setField('loan_support', formatPriceInput(e.target.value))}
                  placeholder="Ví dụ: 1,500" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                {(() => {
                  const price = parsePriceInput(form.price);
                  const loan = parsePriceInput(form.loan_support);
                  return price && loan && loan > 0 && loan < price ? (
                    <p className="mt-1 text-xs font-medium text-emerald-600">Khách trả trước: {formatListingPrice(price - loan, form.price_unit)} · Hỗ trợ vay: {formatListingPrice(loan, form.price_unit)}</p>
                  ) : null;
                })()}
              </div>
            )}
          </section>

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
              <label className="block text-xs font-semibold text-gray-700 mb-1">Quận/Huyện *</label>
              {form.area_id ? (districts.length > 0 ? (
                <select value={form.district_id} onChange={e => handleDistrictChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                  <option value="">-- Chọn quận/huyện --</option>
                  {districts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              ) : (
                <select disabled value="" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50"><option value="">Chưa có taxonomy quận/huyện</option></select>
              )) : (
                <select disabled value="" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50"><option value="">-- Chọn tỉnh trước --</option></select>
              )}
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Phường/Xã *</label>
              {form.district_id ? (wards.length > 0 ? (
                <select value={selectedWard?.id ?? ''} onChange={e => handleWardChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                  <option value="">-- Chọn phường/xã --</option>
                  {wards.map(ward => <option key={ward.id} value={ward.id}>{ward.name}</option>)}
                </select>
              ) : (
                <select disabled value="" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50"><option value="">Chưa có taxonomy phường/xã</option></select>
              )) : (
                <select disabled value="" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-gray-50"><option value="">-- Chọn quận/huyện trước --</option></select>
              )}
            </div>
          </div>

          {/* Gán tin vào khu dân cư (entity page) — cần ≥3 tin active để trang khu dân cư
              được index. Chỉ hiện khi xã đã chọn có khu dân cư. */}
          {neighborhoods.length > 0 && (
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Khu dân cư (tùy chọn)</label>
              <select value={form.neighborhood_slug} onChange={e => setField('neighborhood_slug', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                <option value="">-- Chọn khu dân cư --</option>
                {neighborhoods.map(n => <option key={n.id} value={n.slug}>{n.name}</option>)}
              </select>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Địa chỉ chi tiết</label>
            <div className="flex gap-2">
              <input value={form.address} onChange={e => { addressEditedRef.current = true; setField('address', e.target.value); }}
                placeholder="Số nhà, tên đường..."
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              <button type="button"
                onClick={() => flyTo([form.address, form.ward, form.district, form.city].filter(Boolean).join(', '), 16, 'address', undefined, undefined, undefined, {
                  level: form.ward ? 'ward' : form.district ? 'district' : 'area',
                  areaName: form.city,
                  districtName: form.district || undefined,
                  wardName: form.ward || undefined,
                })}
                disabled={!form.address.trim() || !selectedWard?.id}
                className="flex-shrink-0 flex items-center gap-1.5 bg-red-50 text-red-600 font-semibold px-3 rounded-lg text-sm hover:bg-red-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
                <Search className="w-4 h-4" />Tìm trên bản đồ
              </button>
            </div>
          </div>

          {/* Pin-drop map */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-red-500" />
              Xác định vị trí trên bản đồ
              <span className="font-normal text-gray-400 text-[10px]">(chọn xã / bấm "Tìm trên bản đồ" để zoom · click/kéo ghim để đặt vị trí — địa chỉ tự cập nhật)</span>
            </label>
            <LocationPicker
              lat={String(form.latitude)}
              lng={String(form.longitude)}
              geocodeTarget={geocodeTarget}
              resetNonce={mapResetNonce}
              wardId={selectedWard?.id}
              wardGeo={selectedWardGeo}
              wardLabel={form.ward || 'xã/phường đã chọn'}
              onChange={(lat, lng) => { addressEditedRef.current = false; setForm(current => ({ ...current, latitude: lat, longitude: lng })); }}
              onReverseGeocode={addr => { if (!addressEditedRef.current) setField('address', addr); }}
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
            <ImageUrlInput value={form.image_url} onChange={url => setField('image_url', url)} placeholder="URL ảnh đại diện" folder="properties" isAdmin />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Thư viện ảnh</label>
            <ImageUpload images={form.images} onChange={imgs => setField('images', imgs)} maxImages={15} folder="properties" isAdmin />
          </div>

          {/* Media */}
          {fld('Link video thực tế (YouTube hoặc MP4 từ kho media)', 'video_url', { type: 'url', placeholder: 'https://youtube.com/watch?v=...' })}
          {fld('Link VR Tour 360° (HTTPS)', 'vr_tour_url', { type: 'url', placeholder: 'https://kuula.co/...' })}

          {/* Description */}
          <div>
            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
              <label className="block text-xs font-semibold text-gray-700">
                Mô tả chi tiết
                <span className={`ml-2 text-[10px] font-normal ${descLen >= 120 ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {descLen} ký tự (tối thiểu 120)
                </span>
              </label>
              <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5">
                <button type="button" onClick={() => setDescriptionMode('visual')} className={`rounded-md px-2.5 py-1.5 text-xs font-bold ${descriptionMode === 'visual' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>Visual</button>
                <button type="button" onClick={() => setDescriptionMode('html')} className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-bold ${descriptionMode === 'html' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Code2 className="h-3.5 w-3.5" /> View code</button>
              </div>
            </div>
            {descriptionMode === 'visual' ? (
              <RichTextEditor value={form.description} onChange={html => setField('description', html)} mediaFolder="properties" enableVideo
                placeholder="Mô tả vị trí, đặc điểm, tiện ích xung quanh, lý do bán. Dùng thanh công cụ để định dạng, chèn ảnh, YouTube hoặc tải MP4..." />
            ) : (
              <textarea value={form.description} onChange={event => setField('description', event.target.value)} rows={22} spellCheck={false}
                placeholder={'<h2>Thông tin nổi bật</h2>\n<p>Mô tả chi tiết...</p>'}
                className="min-h-[420px] w-full rounded-lg border border-gray-200 bg-gray-950 px-4 py-3 font-mono text-xs leading-relaxed text-gray-100 shadow-inner focus:outline-none focus:ring-2 focus:ring-red-400" />
            )}
            <p className="mt-1 text-[11px] text-gray-400">Visual dùng toolbar để chèn ảnh, YouTube hoặc MP4. View code cho phép sửa HTML; nội dung được kiểm tra và lọc an toàn khi lưu.</p>
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
            {[{ key: 'is_active', label: 'Đang hiển thị' }, { key: 'is_featured', label: 'Nổi bật' }, { key: 'is_hot', label: 'HOT' }].map(({ key, label }) => (
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
                <label className="block text-xs font-semibold text-gray-700 mb-1">Slug mô tả URL</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 flex-shrink-0">…/</span>
                  <input value={form.slug} placeholder={generateSlug(form.title) || 'tu-dong-tao-tu-tieu-de'}
                    onChange={e => setField('slug', generateSlug(e.target.value))}
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                </div>
                <p className="text-[10px] text-gray-400 mt-1">
                  {property?.public_code
                    ? 'URL chuẩn gồm giao dịch, khu vực, quận/huyện, slug và mã pr ổn định.'
                    : 'URL chuẩn sẽ được tạo sau lần lưu đầu tiên, khi tin nhận mã pr ổn định.'}
                </p>
                <PublicUrlPreview path={publicUrlPreview} />
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
              { label: 'Mô tả ≥ 120 ký tự', ok: descLen >= 120 },
              { label: 'Ảnh đại diện', ok: !!form.image_url },
              { label: 'Diện tích', ok: !!form.area_sqm },
              { label: 'Giá bán', ok: parsePriceInput(form.price) !== null },
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
            {descLen < 120 && <p className="text-[10px] text-blue-700 mb-0.5">• Mô tả thêm tiện ích, vị trí, ưu điểm</p>}
            {!form.latitude && <p className="text-[10px] text-blue-700 mb-0.5">• Click bản đồ để lấy tọa độ</p>}
            {!form.image_url && <p className="text-[10px] text-blue-700">• Thêm ảnh đại diện</p>}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
        <button onClick={onCancel} className="border border-gray-200 text-gray-600 px-5 py-2.5 rounded-lg text-sm hover:bg-gray-100 transition-colors">Hủy</button>
        <button
          onClick={() => {
            if (!form.property_type_id) { setTypeError('Vui lòng chọn loại BĐS'); return; }
            setShowPreview(true);
          }}
          disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2 shadow-sm">
          <Eye className="w-4 h-4" />Xem trước & xuất bản
        </button>
      </div>

      {/* Modal preview bắt buộc — admin xem đúng trang công khai trước khi ghi vào DB */}
      {showPreview && (
        <div className="fixed inset-0 z-[9998] flex flex-col bg-black/60">
          <div className="flex-shrink-0 flex items-center justify-between gap-3 bg-white border-b border-gray-200 px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2 text-sm font-bold text-gray-800">
              <Eye className="w-4 h-4 text-red-500" />Xem trước trang tin trước khi xuất bản
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowPreview(false)}
                className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-100 transition-colors">
                Quay lại chỉnh sửa
              </button>
              <button onClick={() => { setShowPreview(false); handleSaveClick(); }} disabled={saving}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 disabled:opacity-60">
                <CheckCircle className="w-4 h-4" />{saving ? 'Đang lưu...' : 'Xác nhận xuất bản'}
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto bg-gray-50">
            <PropertyDetailPage preview initialData={formToProperty(form as Record<string, unknown>, property, types, faq)} onNavigate={() => {}} />
          </div>
        </div>
      )}
    </div>
  );
}
