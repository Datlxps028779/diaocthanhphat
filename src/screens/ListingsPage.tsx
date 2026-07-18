'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Search, Filter, SlidersHorizontal, MapPin, Building2,
  CheckCircle, Phone, X, ChevronDown, ArrowUpDown, Grid3X3,
  List, Map as MapIcon, Eye, Sparkles, Flame, Home, Tag, Bell
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { type Property } from '../lib/supabase';
import { getAllProperties, getAllPropertiesForMap, getBanners, getFavoriteIds, toggleFavorite, pushTasteSignal, autoSaveSearch } from '../lib/api';
import { buildSearchName, hasSavedSearchCriteria, type SavedFilters } from '../lib/savedSearch';
import { buildPropertyPath, type PropertySort } from '../lib/api/properties';
import { parseSearchIntent } from '../lib/aiSearch';
import { CompareButton } from '../components/CompareButton';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { useAreas, usePropertyTypes, useDistricts, useWards } from '../lib/hooks/useTaxonomy';
import { qk } from '../lib/queryKeys';
import { type Page, scrollTop } from '../lib/router';
import { recordSignal } from '../lib/tasteStore';
import { ForYou } from '../components/ForYou';
import { LEGAL_OPTIONS } from '../lib/legalOptions';
import { PRICE_RANGES_SALE, PRICE_RANGES_RENT, AREA_RANGES, findRangeIndex } from '../lib/priceRange';
import { Breadcrumb } from '../components/Layout';
import { ContactModal } from '../components/ContactModal';
import type { MapBounds } from '../components/PropertyMap';

interface ListingsPageProps {
  initialFilters?: Partial<{
    listingType: string; areaId: string; typeId: string; district: string; ward: string; keyword: string;
    minPrice: number; maxPrice: number; minArea: number; maxArea: number;
    bedrooms: string; direction: string; legal: string;
    isFeatured: boolean; isHot: boolean; sort: PropertySort;
  }>;
  // Dữ liệu SSR seed sẵn cho view mặc định → crawler thấy list ngay trong HTML gốc.
  initialData?: { data: Property[]; total: number };
  onNavigate: (p: Page) => void;
}

type ListingTypeKey = 'mua_ban' | 'cho_thue' | '';

const PropertyMap = dynamic(() => import('../components/PropertyMap').then(m => m.PropertyMap), {
  ssr: false,
  loading: () => <div className="h-[600px] bg-gray-100 rounded-xl animate-pulse" />,
});

const LISTING_TYPES: { key: ListingTypeKey; label: string; icon: React.ReactNode }[] = [
  { key: '', label: 'Tất cả', icon: <Building2 className="w-3.5 h-3.5" /> },
  { key: 'mua_ban', label: 'Mua bán', icon: <Home className="w-3.5 h-3.5" /> },
  { key: 'cho_thue', label: 'Cho thuê', icon: <Tag className="w-3.5 h-3.5" /> },
];

// Price ranges & area ranges: dùng chung từ lib/priceRange (hero + listing khớp index).
const DIRECTIONS = ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Nam', 'Đông Bắc', 'Tây Nam', 'Tây Bắc'];
const PER_PAGE = 16;

function filterByBounds(props: Property[], bounds: MapBounds | null): Property[] {
  if (!bounds) return props;
  return props.filter(p =>
    p.latitude !== null && p.longitude !== null &&
    p.latitude! >= bounds.south && p.latitude! <= bounds.north &&
    p.longitude! >= bounds.west && p.longitude! <= bounds.east
  );
}

// Mảng rỗng ổn định (stable reference) — tránh tạo `[]` mới mỗi render gây vòng lặp
// re-render vô hạn khi dùng làm default cho useQuery bị disable.
const EMPTY_PROPS: Property[] = [];

export function ListingsPage({ initialFilters, initialData, onNavigate }: ListingsPageProps) {
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [district, setDistrict] = useState(initialFilters?.district ?? '');
  const [ward, setWard] = useState(initialFilters?.ward ?? '');

  const [listingType, setListingType] = useState<ListingTypeKey>((initialFilters?.listingType ?? '') as ListingTypeKey);
  const [keyword, setKeyword] = useState(initialFilters?.keyword ?? '');
  const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);
  const [areaId, setAreaId] = useState(initialFilters?.areaId ?? '');
  const [typeId, setTypeId] = useState(initialFilters?.typeId ?? '');
  const [priceIdx, setPriceIdx] = useState(() =>
    findRangeIndex(
      initialFilters?.listingType === 'cho_thue' ? PRICE_RANGES_RENT : PRICE_RANGES_SALE,
      initialFilters?.minPrice, initialFilters?.maxPrice,
    ),
  );
  const [areaIdx, setAreaIdx] = useState(0);
  const [bedrooms, setBedrooms] = useState(initialFilters?.bedrooms ?? '');
  const [direction, setDirection] = useState(initialFilters?.direction ?? '');
  const [legal, setLegal] = useState(initialFilters?.legal ?? '');
  const [sort, setSort] = useState<PropertySort>((initialFilters?.sort as PropertySort) ?? 'newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('grid');
  const [page, setPage] = useState(1);
  const [mobileFilter, setMobileFilter] = useState(false);
  const [contactProp, setContactProp] = useState<Property | null>(null);
  const [savedSearchPrompt, setSavedSearchPrompt] = useState(false);

  const isRent = listingType === 'cho_thue';
  const PRICE_RANGES = isRent ? PRICE_RANGES_RENT : PRICE_RANGES_SALE;

  // Debounce keyword 300ms → tránh request mỗi lần gõ phím; reset về trang 1
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedKeyword(keyword); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [keyword]);

  // Taxonomy + districts qua React Query (dedup/cache). Reset district tách riêng.
  const { data: areas = [] } = useAreas();
  const { data: types = [] } = usePropertyTypes();
  const { data: districts = [] } = useDistricts(areaId || undefined);
  // Reset district khi user đổi khu vực — nhưng bỏ qua lần mount đầu để không xoá
  // district đã seed sẵn từ link "Danh mục nhanh" (?district=...).
  const areaChangedOnce = useRef(false);
  useEffect(() => {
    if (!areaChangedOnce.current) { areaChangedOnce.current = true; return; }
    setDistrict('');
  }, [areaId]);

  // Phường/xã theo quận/huyện đã chọn. district lưu dạng TÊN nên map ra id để fetch.
  const selectedDistrictId = districts.find(d => d.name === district)?.id;
  const { data: wards = [] } = useWards(selectedDistrictId || undefined);
  // Reset ward khi user đổi quận/huyện — bỏ qua mount đầu để giữ ward seed từ ?ward=.
  const districtChangedOnce = useRef(false);
  useEffect(() => {
    if (!districtChangedOnce.current) { districtChangedOnce.current = true; return; }
    setWard('');
  }, [district]);

  const { data: sidebarBanners = [] } = useQuery({ queryKey: qk.banners('sidebar'), queryFn: () => getBanners('sidebar') });
  const { data: topBanners = [] } = useQuery({ queryKey: qk.banners('listings_top'), queryFn: () => getBanners('listings_top') });

  // Yêu thích: persist thật qua Supabase (trước đây GridCard/ListCard chỉ dùng
  // useState cục bộ → bấm tim xong mất khi rời trang). Dùng chung logic với LandingPage.
  const queryClient = useQueryClient();
  const { data: favIds = [] } = useQuery({ queryKey: qk.favoriteIds(), queryFn: getFavoriteIds });
  const favoriteIds = new Set(favIds);
  const favMutation = useMutation({
    mutationFn: (propertyId: string) => toggleFavorite(propertyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.favoriteIds() }),
  });

  const { mutate: autoSaveCurrentSearch } = useMutation({
    mutationFn: (input: { name: string; filters: SavedFilters }) => autoSaveSearch(input),
    onSuccess: (saved) => {
      queryClient.invalidateQueries({ queryKey: ['savedSearches'] });
      if (saved) {
        setSavedSearchPrompt(true);
        setTimeout(() => setSavedSearchPrompt(false), 8000);
      }
    },
    onError: (e) => console.warn('[ListingsPage] Auto-save search failed:', e),
  });

  // Query danh sách chính — key encode toàn bộ filter đã resolve (min/max)
  const pr = PRICE_RANGES[priceIdx] ?? PRICE_RANGES[0];
  const ar = AREA_RANGES[areaIdx] ?? AREA_RANGES[0];
  const explicitFilters = {
    listingType: listingType || undefined,
    areaId: areaId || undefined,
    typeId: typeId || undefined,
    district: district || undefined,
    ward: ward || undefined,
    minPrice: pr.min,
    maxPrice: pr.max,
    minArea: ar.min,
    maxArea: ar.max,
    bedrooms: bedrooms || undefined,
    direction: direction || undefined,
    legal: legal || undefined,
  };
  const searchIntent = useMemo(() => parseSearchIntent(debouncedKeyword, { areas, districts, wards, propertyTypes: types }, explicitFilters), [debouncedKeyword, areas, districts, wards, types, listingType, areaId, typeId, district, ward, pr.min, pr.max, ar.min, ar.max, bedrooms, direction, legal]);
  const effectiveSort: PropertySort = debouncedKeyword && sort === 'newest' ? 'relevance' : sort;
  const filters = {
    ...explicitFilters,
    ...searchIntent.filters,
    keyword: searchIntent.residualKeyword.trim() || undefined,
    isFeatured: initialFilters?.isFeatured, isHot: initialFilters?.isHot,
    sort: effectiveSort, page, limit: PER_PAGE,
  };
  // Chỉ seed dữ liệu SSR khi filter còn nguyên mặc định (đúng cái server prefetch):
  // trang 1, không keyword/khu vực/loại/quận, khoảng giá & diện tích mặc định, mới nhất.
  const isDefaultView = page === 1 && !debouncedKeyword && !areaId && !typeId && !district && !ward
    && priceIdx === 0 && areaIdx === 0 && !bedrooms && !direction && !legal && sort === 'newest';
  const { data: result, isFetching: loading } = useQuery({
    queryKey: qk.properties(filters),
    queryFn: () => getAllProperties(filters),
    placeholderData: keepPreviousData, // giữ grid khi đổi trang, không nháy
    initialData: isDefaultView && initialData ? initialData : undefined,
  });
  const properties = result?.data ?? [];
  const total = result?.total ?? 0;

  const autoSavedFilters = useMemo<SavedFilters>(() => ({
    listingType: listingType || undefined,
    areaId: areaId || undefined,
    typeId: typeId || undefined,
    district: district || undefined,
    ward: ward || undefined,
    keyword: debouncedKeyword.trim() || undefined,
    minPrice: pr.min, maxPrice: pr.max,
    minArea: ar.min, maxArea: ar.max,
    bedrooms: bedrooms || undefined,
    direction: direction || undefined,
    legal: legal || undefined,
    sort: sort !== 'newest' ? sort : undefined,
  }), [listingType, areaId, typeId, district, ward, debouncedKeyword, pr.min, pr.max, ar.min, ar.max, bedrooms, direction, legal, sort]);

  const autoSaveSignature = JSON.stringify(autoSavedFilters);

  useEffect(() => {
    if (!hasSavedSearchCriteria(autoSavedFilters)) return;
    const labels = {
      areas: Object.fromEntries(areas.map(a => [a.id, a.name])),
      types: Object.fromEntries(types.map(t => [t.id, t.name])),
    };
    const t = setTimeout(() => {
      autoSaveCurrentSearch({ name: buildSearchName(autoSavedFilters, labels), filters: autoSavedFilters });
    }, 800);
    return () => clearTimeout(t);
  }, [autoSaveSignature, areas, types, autoSaveCurrentSearch]);

  // Tự học: ghi tín hiệu tìm kiếm khi khách chọn khu vực/loại/loại-tin (bỏ qua view
  // mặc định rỗng). localStorage (mọi khách) + đồng bộ tài khoản khi đã đăng nhập.
  useEffect(() => {
    if (filters.areaId || filters.typeId || filters.listingType) {
      const attrs = { areaId: filters.areaId || null, typeId: filters.typeId || null, listingType: filters.listingType || null };
      recordSignal('search', attrs);
      pushTasteSignal('search', attrs).catch(() => {});
    }
  }, [filters.areaId, filters.typeId, filters.listingType]);

  // Map view: chỉ fetch khi ở chế độ bản đồ
  const { data: mapProperties = EMPTY_PROPS } = useQuery({
    queryKey: qk.propertiesMap({ areaId: areaId || undefined, typeId: typeId || undefined }),
    queryFn: () => getAllPropertiesForMap({ areaId: areaId || undefined, typeId: typeId || undefined }),
    enabled: viewMode === 'map',
  });
  // Leaflet keeps the first handler, so keep data filtering outside its closure.
  const handleBoundsChange = useCallback((bounds: MapBounds) => {
    setMapBounds(bounds);
  }, []);

  const viewportProps = useMemo(
    () => filterByBounds(mapProperties, mapBounds),
    [mapProperties, mapBounds],
  );

  // Reset price index CHỈ khi listingType thực sự đổi (user bấm tab mua↔thuê) —
  // so giá trị trước, không dùng cờ boolean (cờ bị StrictMode double-invoke reset
  // nhầm priceIdx đã seed từ URL ?minPrice/?maxPrice ngay khi mount).
  const prevListingType = useRef(listingType);
  useEffect(() => {
    if (prevListingType.current !== listingType) {
      prevListingType.current = listingType;
      setPriceIdx(0);
    }
  }, [listingType]);

  const resetFilters = () => {
    setKeyword(''); setAreaId(''); setTypeId(''); setDistrict(''); setWard('');
    setPriceIdx(0); setAreaIdx(0); setBedrooms('');
    setDirection(''); setLegal(''); setPage(1);
  };

  const totalPages = Math.ceil(total / PER_PAGE);
  const hasActiveFilters = !!(keyword || areaId || typeId || district || ward || priceIdx || areaIdx || bedrooms || direction || legal);
  const setFilter = (fn: () => void) => { fn(); setPage(1); };

  const pageTitle = initialFilters?.isFeatured ? 'BĐS Nổi bật'
    : initialFilters?.isHot ? 'BĐS HOT'
    : listingType === 'mua_ban' ? 'Mua bán bất động sản'
    : listingType === 'cho_thue' ? 'Cho thuê bất động sản'
    : 'Bất động sản';

  const FilterPanel = () => (
    <div className="space-y-5">
      {/* Area Pills */}
      <div>
        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">Khu vực</label>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => setFilter(() => setAreaId(''))}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${!areaId ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 text-gray-600 hover:border-red-400'}`}>
            Tất cả
          </button>
          {areas.map(a => (
            <button key={a.id} onClick={() => setFilter(() => setAreaId(areaId === a.id ? '' : a.id))}
              className={`px-3 py-1 text-xs rounded-full border transition-colors ${areaId === a.id ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 text-gray-600 hover:border-red-400'}`}>
              {a.name}
            </button>
          ))}
        </div>
      </div>

      {/* District filter — chỉ hiển thị khi đã chọn area */}
      {districts.length > 0 && (
        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">Quận/Huyện</label>
          <div className="relative">
            <select value={district} onChange={e => setFilter(() => setDistrict(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 pr-8 py-2.5 text-sm appearance-none bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400">
              <option value="">Tất cả quận/huyện</option>
              {districts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Ward filter — chỉ hiển thị khi đã chọn quận/huyện có phường/xã */}
      {wards.length > 0 && (
        <div>
          <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">Phường/Xã</label>
          <div className="relative">
            <select value={ward} onChange={e => setFilter(() => setWard(e.target.value))}
              className="w-full border border-gray-200 rounded-lg px-3 pr-8 py-2.5 text-sm appearance-none bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400">
              <option value="">Tất cả phường/xã</option>
              {wards.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>
      )}

      {/* Property Type */}
      <div>
        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">Loại BĐS</label>
        <div className="relative">
          <select value={typeId} onChange={e => setFilter(() => setTypeId(e.target.value))}
            className="w-full border border-gray-200 rounded-lg px-3 pr-8 py-2.5 text-sm appearance-none bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-400">
            <option value="">Tất cả loại</option>
            {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Price */}
      <div>
        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">
          {isRent ? 'Giá thuê' : 'Khoảng giá'}
        </label>
        <div className="space-y-1">
          {PRICE_RANGES.map((r, i) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer py-0.5 group">
              <input type="radio" name="price" checked={priceIdx === i} onChange={() => setFilter(() => setPriceIdx(i))} className="accent-red-500 flex-shrink-0" />
              <span className={`text-xs transition-colors ${priceIdx === i ? 'text-red-600 font-semibold' : 'text-gray-600 group-hover:text-red-500'}`}>{r.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Area size */}
      <div>
        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">Diện tích</label>
        <div className="space-y-1">
          {AREA_RANGES.map((r, i) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer py-0.5 group">
              <input type="radio" name="area" checked={areaIdx === i} onChange={() => setFilter(() => setAreaIdx(i))} className="accent-red-500 flex-shrink-0" />
              <span className={`text-xs transition-colors ${areaIdx === i ? 'text-red-600 font-semibold' : 'text-gray-600 group-hover:text-red-500'}`}>{r.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Legal */}
      <div>
        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">Pháp lý</label>
        <div className="space-y-1">
          {['', ...LEGAL_OPTIONS].map((l, i) => (
            <label key={i} className="flex items-center gap-2 cursor-pointer py-0.5 group">
              <input type="radio" name="legal" checked={legal === l} onChange={() => setFilter(() => setLegal(l))} className="accent-red-500 flex-shrink-0" />
              <span className={`text-xs transition-colors ${legal === l ? 'text-red-600 font-semibold' : 'text-gray-600 group-hover:text-red-500'}`}>{l || 'Tất cả'}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Direction */}
      <div>
        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">Hướng nhà</label>
        <div className="grid grid-cols-2 gap-1">
          {['', ...DIRECTIONS].map(d => (
            <button key={d} onClick={() => setFilter(() => setDirection(d))}
              className={`py-1.5 px-2 text-xs rounded-lg border transition-colors ${direction === d ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-600 hover:border-red-300'}`}>
              {d || 'Tất cả'}
            </button>
          ))}
        </div>
      </div>

      {/* Bedrooms — only for non-land types */}
      <div>
        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">Số phòng ngủ</label>
        <div className="flex gap-1.5 flex-wrap">
          {['', '1', '2', '3', '4', '5+'].map(b => (
            <button key={b} onClick={() => setFilter(() => setBedrooms(b === '5+' ? '5' : b))}
              className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${(b === '5+' ? bedrooms === '5' : bedrooms === b) ? 'bg-red-500 text-white border-red-500' : 'border-gray-200 text-gray-600 hover:border-red-300'}`}>
              {b || 'Tất cả'}
            </button>
          ))}
        </div>
      </div>

      {hasActiveFilters && (
        <button onClick={resetFilters} className="w-full border border-gray-200 text-gray-600 text-xs font-semibold py-2 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-1">
          <X className="w-3.5 h-3.5" />Xóa bộ lọc
        </button>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header bar with tabs */}
      <div className="bg-white border-b border-gray-100 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <Breadcrumb items={[
            { label: 'Trang chủ', onClick: () => onNavigate({ name: 'home' }) },
            { label: pageTitle },
          ]} />

          {/* Listing type tabs */}
          <div className="flex items-center gap-1 mb-3 overflow-x-auto pb-1 scrollbar-hide">
            {LISTING_TYPES.map(lt => (
              <button key={lt.key} onClick={() => { setListingType(lt.key); setPage(1); }}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg flex-shrink-0 transition-colors ${listingType === lt.key ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {lt.icon}{lt.label}
              </button>
            ))}
          </div>

          {/* Area quick tabs */}
          <div className="flex items-center gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
            <button onClick={() => setFilter(() => setAreaId(''))}
              className={`px-3 py-1.5 text-xs font-semibold rounded-full flex-shrink-0 transition-colors ${!areaId ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
              Tất cả khu vực
            </button>
            {areas.map(a => (
              <button key={a.id} onClick={() => setFilter(() => setAreaId(areaId === a.id ? '' : a.id))}
                className={`px-3 py-1.5 text-xs font-semibold rounded-full flex-shrink-0 transition-colors ${areaId === a.id ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                {a.name}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-gray-500 text-xs">
              Tìm thấy <strong className="text-gray-800">{total.toLocaleString('vi-VN')}</strong> bất động sản
              {areaId && areas.find(a => a.id === areaId) && ` tại ${areas.find(a => a.id === areaId)!.name}`}
            </p>
            <div className="flex items-center gap-2 flex-1 max-w-md">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }}
                  onKeyDown={e => { if (e.key === 'Enter') { setDebouncedKeyword(keyword); setPage(1); } }}
                  placeholder="Tìm theo tên, địa chỉ, khu vực..."
                  className="w-full pl-9 pr-9 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                {keyword && <button onClick={() => { setKeyword(''); setPage(1); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X className="w-3.5 h-3.5" /></button>}
              </div>
              <button onClick={() => setMobileFilter(true)}
                className="lg:hidden flex items-center gap-1.5 border border-gray-200 text-gray-600 px-3 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">
                <Filter className="w-4 h-4" />
                {hasActiveFilters && <span className="w-2 h-2 bg-red-500 rounded-full" />}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5">
        <div className="flex gap-5">
          {/* Sidebar filter */}
          <aside className="hidden lg:block w-60 flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sticky top-28">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-red-500" />
                  <span className="font-bold text-sm text-gray-900">Bộ lọc nâng cao</span>
                </div>
                {hasActiveFilters && <button onClick={resetFilters} className="text-xs text-red-600 hover:underline">Xóa tất cả</button>}
              </div>
              <FilterPanel />
            </div>
            {sidebarBanners.map(b => (
              <a key={b.id} href={b.cta_link ?? '#'} target="_blank" rel="noopener noreferrer"
                className="mt-4 block rounded-xl overflow-hidden shadow-sm border border-gray-100 group">
                {b.image_url
                  ? <img src={b.image_url} alt={b.title} loading="lazy" className="w-full object-cover group-hover:opacity-95 transition-opacity" />
                  : (
                    <div className="p-4 text-center" style={{ backgroundColor: b.bg_color ?? '#dc2626' }}>
                      <p className="text-white font-bold text-sm">{b.title}</p>
                      {b.subtitle && <p className="text-white/80 text-xs mt-1">{b.subtitle}</p>}
                      {b.cta_text && <span className="mt-2 inline-block bg-white/20 text-white text-xs px-3 py-1 rounded-full">{b.cta_text}</span>}
                    </div>
                  )
                }
              </a>
            ))}
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Top banner */}
            {topBanners[0] && (
              <a href={topBanners[0].cta_link ?? '#'} target="_blank" rel="noopener noreferrer"
                className="block mb-4 rounded-xl overflow-hidden shadow-sm border border-gray-100 group">
                {topBanners[0].image_url
                  ? <img src={topBanners[0].image_url} alt={topBanners[0].title} className="w-full max-h-28 object-cover group-hover:opacity-95 transition-opacity" />
                  : (
                    <div className="px-6 py-4 flex items-center justify-between" style={{ backgroundColor: topBanners[0].bg_color ?? '#dc2626' }}>
                      <div>
                        <p className="text-white font-bold">{topBanners[0].title}</p>
                        {topBanners[0].subtitle && <p className="text-white/80 text-sm">{topBanners[0].subtitle}</p>}
                      </div>
                      {topBanners[0].cta_text && <span className="bg-white/20 text-white text-sm px-4 py-1.5 rounded-lg font-medium">{topBanners[0].cta_text}</span>}
                    </div>
                  )
                }
              </a>
            )}
            {/* Sort + view mode bar */}
            <div className="flex items-center justify-between mb-4 bg-white rounded-xl border border-gray-100 shadow-sm px-4 py-2.5">
              <div className="flex items-center gap-2">
                <ArrowUpDown className="w-4 h-4 text-gray-400" />
                <select value={effectiveSort} onChange={e => setFilter(() => setSort(e.target.value as PropertySort))}
                  className="border-0 text-sm text-gray-700 focus:outline-none bg-transparent font-medium">
                  <option value="relevance">Liên quan nhất</option>
                  <option value="newest">Mới nhất</option>
                  <option value="price_asc">Giá thấp → cao</option>
                  <option value="price_desc">Giá cao → thấp</option>
                  <option value="views">Xem nhiều nhất</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[
                    { mode: 'grid' as const, icon: <Grid3X3 className="w-4 h-4" />, label: 'Lưới' },
                    { mode: 'list' as const, icon: <List className="w-4 h-4" />, label: 'Danh sách' },
                    { mode: 'map' as const, icon: <MapIcon className="w-4 h-4" />, label: 'Bản đồ' },
                  ].map(v => (
                    <button key={v.mode} onClick={() => setViewMode(v.mode)} title={v.label}
                      className={`p-1.5 rounded transition-colors ${viewMode === v.mode ? 'bg-red-100 text-red-600' : 'text-gray-400 hover:text-gray-600'}`}>
                      {v.icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {savedSearchPrompt && (
              <div className="mb-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 flex items-start gap-3 text-sm animate-fade-in">
                <Bell className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-emerald-800">Đã tự lưu nhu cầu tìm kiếm</p>
                  <p className="text-emerald-700 text-xs mt-0.5">Vào Tài khoản → Tìm kiếm đã lưu để bật cảnh báo khi có tin mới phù hợp.</p>
                </div>
                <button onClick={() => setSavedSearchPrompt(false)} className="text-emerald-600 hover:text-emerald-800">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {/* Active filter chips */}
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-2 mb-3">
                {searchIntent.matched.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-full text-xs font-semibold">
                    <Sparkles className="w-3 h-3" />AI đã hiểu: {searchIntent.matched.map(m => m.label).join(' · ')}
                  </span>
                )}
                {areaId && areas.find(a => a.id === areaId) && (
                  <FilterChip label={`📍 ${areas.find(a => a.id === areaId)!.name}`} onRemove={() => setFilter(() => setAreaId(''))} />
                )}
                {district && <FilterChip label={district} onRemove={() => setFilter(() => setDistrict(''))} />}
                {ward && <FilterChip label={ward} onRemove={() => setFilter(() => setWard(''))} />}
                {typeId && types.find(t => t.id === typeId) && (
                  <FilterChip label={types.find(t => t.id === typeId)!.name} onRemove={() => setFilter(() => setTypeId(''))} />
                )}
                {priceIdx > 0 && <FilterChip label={PRICE_RANGES[priceIdx]?.label ?? ''} onRemove={() => setFilter(() => setPriceIdx(0))} />}
                {areaIdx > 0 && <FilterChip label={AREA_RANGES[areaIdx]?.label ?? ''} onRemove={() => setFilter(() => setAreaIdx(0))} />}
                {legal && <FilterChip label={legal} onRemove={() => setFilter(() => setLegal(''))} />}
                {direction && <FilterChip label={`Hướng ${direction}`} onRemove={() => setFilter(() => setDirection(''))} />}
                {bedrooms && <FilterChip label={`${bedrooms}+ phòng ngủ`} onRemove={() => setFilter(() => setBedrooms(''))} />}
                {keyword && <FilterChip label={`"${keyword}"`} onRemove={() => { setKeyword(''); setPage(1); }} />}
              </div>
            )}

            {viewMode === 'map' && (
              <>
                {/* Khung bản đồ chiều cao responsive — panel sản phẩm phủ góc phải (desktop) */}
                <div className="relative h-[70vh] min-h-[420px] max-h-[680px]">
                  <PropertyMap
                    properties={mapProperties}
                    onNavigate={onNavigate}
                    height="100%"
                    onBoundsChange={handleBoundsChange}
                    showCountBadge={false}
                  />

                  {/* Panel overlay góc phải — chỉ desktop, luôn hiển thị */}
                  <div className="hidden lg:flex absolute top-3 right-3 bottom-3 w-72 z-[1000] flex-col rounded-2xl bg-white/95 backdrop-blur-sm shadow-xl border border-gray-100 overflow-hidden">
                    <div className="px-3 py-2.5 border-b border-gray-100 flex-shrink-0">
                      <p className="text-xs font-bold text-gray-900">Tin trong khung nhìn</p>
                      <p className="text-[11px] text-gray-500 mt-0.5">{viewportProps.length} tin đăng đang hiển thị</p>
                    </div>
                    {viewportProps.length > 0 ? (
                      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                        {viewportProps.map(p => (
                          <button key={p.id}
                            onClick={() => { onNavigate({ name: 'property', id: p.id, slug: p.slug ?? undefined }); scrollTop(); }}
                            className="flex gap-2.5 w-full text-left bg-white border border-gray-100 rounded-xl p-2.5 hover:border-red-300 hover:shadow-sm transition-all group">
                            <span className="relative w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                              <Image src={p.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'} alt={p.title} fill sizes="64px" className="object-cover" />
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-gray-900 line-clamp-2 group-hover:text-red-600 transition-colors">{p.title}</p>
                              <p className="text-red-600 text-xs font-black mt-0.5">{p.price_label ?? `${p.price} ${p.price_unit}`}</p>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                        <MapPin className="w-8 h-8 text-gray-200 mb-2" />
                        <p className="text-xs text-gray-500 font-medium">Chưa có tin trong khu vực này</p>
                        <p className="text-[11px] text-gray-400 mt-1">Thu nhỏ hoặc di chuyển bản đồ để xem thêm</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Danh sách theo khung nhìn — mobile hiển thị dưới bản đồ */}
                <div className="lg:hidden mt-3">
                  <p className="text-xs font-semibold text-gray-500 mb-2">
                    {viewportProps.length} tin đăng trong khung nhìn
                  </p>
                  {viewportProps.length > 0 ? (
                    <div className="space-y-2">
                      {viewportProps.map(p => (
                        <button key={p.id}
                          onClick={() => { onNavigate({ name: 'property', id: p.id, slug: p.slug ?? undefined }); scrollTop(); }}
                          className="flex gap-2.5 w-full text-left bg-white border border-gray-100 rounded-xl p-2.5 hover:border-red-300 hover:shadow-sm transition-all group">
                          <span className="relative w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                            <Image src={p.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'} alt={p.title} fill sizes="64px" className="object-cover" />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-gray-900 line-clamp-2 group-hover:text-red-600 transition-colors">{p.title}</p>
                            <p className="text-red-600 text-xs font-black mt-0.5">{p.price_label ?? `${p.price} ${p.price_unit}`}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-100 rounded-xl py-6 text-center">
                      <p className="text-xs text-gray-500 font-medium">Chưa có tin trong khu vực này</p>
                      <p className="text-[11px] text-gray-400 mt-1">Thu nhỏ hoặc di chuyển bản đồ để xem thêm</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {viewMode === 'grid' && (
              loading ? (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {Array.from({ length: 8 }).map((_, i) => <div key={i} className="bg-white rounded-xl h-72 animate-pulse border border-gray-100" />)}
                </div>
              ) : properties.length === 0 ? (
                <EmptyState onReset={resetFilters} listingType={listingType} />
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                  {properties.map(p => (
                    <GridCard key={p.id} property={p}
                      isFavorited={favoriteIds.has(p.id)}
                      onToggleFavorite={() => favMutation.mutate(p.id)}
                      onContact={() => setContactProp(p)} />
                  ))}
                </div>
              )
            )}

            {viewMode === 'list' && (
              loading ? (
                <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="bg-white rounded-xl h-28 animate-pulse border border-gray-100" />)}</div>
              ) : properties.length === 0 ? (
                <EmptyState onReset={resetFilters} listingType={listingType} />
              ) : (
                <div className="space-y-3">
                  {properties.map(p => (
                    <ListCard key={p.id} property={p}
                      isFavorited={favoriteIds.has(p.id)}
                      onToggleFavorite={() => favMutation.mutate(p.id)}
                      onContact={() => setContactProp(p)} />
                  ))}
                </div>
              )
            )}

            {/* Pagination */}
            {viewMode !== 'map' && totalPages > 1 && (
              <div className="flex items-center justify-center gap-1 mt-8">
                <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors bg-white">
                  ← Trước
                </button>
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  const n = Math.max(1, Math.min(page - 3, totalPages - 6)) + i;
                  return n <= totalPages ? (
                    <button key={n} onClick={() => setPage(n)}
                      className={`w-9 h-9 text-sm rounded-lg transition-colors ${page === n ? 'bg-red-500 text-white' : 'border border-gray-200 hover:bg-gray-50 text-gray-700 bg-white'}`}>
                      {n}
                    </button>
                  ) : null;
                })}
                <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}
                  className="px-3 py-2 text-sm border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-50 transition-colors bg-white">
                  Tiếp →
                </button>
              </div>
            )}

            {viewMode !== 'map' && <ForYou />}
          </div>
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileFilter && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileFilter(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-red-500" />Bộ lọc nâng cao
              </h3>
              <button onClick={() => setMobileFilter(false)}><X className="w-5 h-5 text-gray-500" /></button>
            </div>
            <div className="p-4"><FilterPanel /></div>
            <div className="p-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={() => setMobileFilter(false)} className="w-full bg-red-600 text-white font-bold py-3 rounded-xl text-sm">
                Xem {total.toLocaleString('vi-VN')} kết quả
              </button>
            </div>
          </div>
        </div>
      )}

      <ContactModal property={contactProp} onClose={() => setContactProp(null)} />
    </div>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full">
      {label}<button onClick={onRemove} className="hover:text-red-900"><X className="w-3 h-3" /></button>
    </span>
  );
}

function EmptyState({ onReset, listingType }: { onReset: () => void; listingType: string }) {
  return (
    <div className="text-center py-20 bg-white rounded-xl border border-gray-100">
      <Building2 className="w-14 h-14 text-gray-200 mx-auto mb-3" />
      <p className="text-gray-600 font-semibold">Không tìm thấy bất động sản phù hợp</p>
      <p className="text-gray-400 text-sm mt-1">
        {listingType === 'cho_thue' ? 'Thử thay đổi bộ lọc hoặc tìm BĐS cho thuê khác'
          : 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm'}
      </p>
      <button onClick={onReset} className="mt-4 text-red-600 text-sm hover:underline font-medium">Xóa bộ lọc</button>
    </div>
  );
}

function GridCard({ property: p, onContact, isFavorited = false, onToggleFavorite }: { property: Property; onContact: () => void; isFavorited?: boolean; onToggleFavorite?: () => void }) {
  const pricePerSqm = p.area_sqm && p.price
    ? ((p.price_unit === 'triệu' ? p.price / 1000 : p.price) * 1000 / p.area_sqm).toFixed(0)
    : null;
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg border border-gray-100 transition-all duration-300 group flex flex-col">
      <div className="relative overflow-hidden">
        <Link href={buildPropertyPath(p)} aria-label={p.title} className="absolute inset-0 z-[1]" />
        <div className="relative h-44 bg-gray-100">
          <Image src={p.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'}
            alt={p.title} fill sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500" />
        </div>
        <div className="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent" />
        {p.badge ? (
          <span className={`absolute top-2 left-2 text-white text-[10px] font-bold px-2 py-0.5 rounded-sm ${p.badge_color === 'green' ? 'bg-emerald-500' : p.badge_color === 'blue' ? 'bg-blue-500' : 'bg-red-500'}`}>{p.badge}</span>
        ) : p.is_hot ? (
          <span className="absolute top-2 left-2 bg-orange-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-sm flex items-center gap-0.5"><Flame className="w-2.5 h-2.5" />HOT</span>
        ) : p.is_featured ? (
          <span className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-sm flex items-center gap-0.5"><Sparkles className="w-2.5 h-2.5" />Nổi bật</span>
        ) : null}
        {p.listing_type === 'cho_thue' && (
          <span className="absolute bottom-8 left-2 bg-blue-600/90 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Cho thuê</span>
        )}
        {p.is_verified && (
          <span className="absolute bottom-2 left-2 z-[2] shadow-sm"><VerifiedBadge verified /></span>
        )}
        <div className="absolute top-2 right-2 z-[2] flex items-center gap-1.5">
          <CompareButton property={p} variant="overlay" />
          <button onClick={e => { e.stopPropagation(); e.preventDefault(); onToggleFavorite?.(); }}
            className="w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow hover:scale-110 transition-transform">
            <svg className={`w-3.5 h-3.5 ${isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} fill="none">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>
        <div className="absolute bottom-2 right-2 flex items-center gap-1 text-white/90 text-[10px]">
          <Eye className="w-3 h-3" />{p.views ?? 0}
        </div>
      </div>
      <div className="p-3.5 flex flex-col flex-1">
        <h3 className="mb-1.5"><Link href={buildPropertyPath(p)} className="text-gray-900 font-semibold text-sm leading-snug line-clamp-2 hover:text-red-600 transition-colors block">{p.title}</Link></h3>
        <p className="text-red-600 font-black text-base">{p.price_label ?? `${p.price} ${p.price_unit}`}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500 my-1 flex-wrap">
          {p.area_sqm && <span>{p.area_sqm} m²</span>}
          {pricePerSqm && p.listing_type !== 'cho_thue' && <span className="text-gray-400">{pricePerSqm} tr/m²</span>}
          {p.bedrooms && <span>{p.bedrooms} PN</span>}
          {p.legal_status && <span className="flex items-center gap-0.5 text-emerald-600 ml-auto"><CheckCircle className="w-3 h-3" />{p.legal_status}</span>}
        </div>
        <div className="flex items-center gap-1 text-gray-400 text-xs mb-3">
          <MapPin className="w-3 h-3 text-red-400 flex-shrink-0" />
          <span className="truncate">{p.district ? `${p.district}, ` : ''}{p.city}</span>
        </div>
        <div className="flex gap-2 mt-auto">
          <Link href={buildPropertyPath(p)} className="flex-1 text-center border border-red-400 text-red-600 text-xs font-semibold py-1.5 rounded-lg hover:bg-red-50 transition-colors">Chi tiết</Link>
          <button onClick={onContact} className="flex-1 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold py-1.5 rounded-lg transition-colors flex items-center justify-center gap-1">
            <Phone className="w-3 h-3" />Liên hệ
          </button>
        </div>
      </div>
    </div>
  );
}

function ListCard({ property: p, onContact, isFavorited = false, onToggleFavorite }: { property: Property; onContact: () => void; isFavorited?: boolean; onToggleFavorite?: () => void }) {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md border border-gray-100 flex transition-all group">
      <div className="relative w-48 flex-shrink-0 overflow-hidden">
        <Link href={buildPropertyPath(p)} aria-label={p.title} className="absolute inset-0 z-[1]" />
        <Image src={p.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'} alt={p.title} fill sizes="192px" className="object-cover group-hover:scale-105 transition-transform duration-500" />
        {p.listing_type === 'cho_thue' && (
          <span className="absolute top-2 left-2 z-[2] bg-blue-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">Cho thuê</span>
        )}
        {p.badge && <span className="absolute top-2 left-2 z-[2] bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-sm">{p.badge}</span>}
      </div>
      <div className="flex-1 p-4 flex flex-col justify-between min-w-0">
        <div>
          {p.is_verified && <div className="mb-1"><VerifiedBadge verified /></div>}
          <h3 className="mb-1.5"><Link href={buildPropertyPath(p)} className="font-semibold text-gray-900 text-sm leading-snug hover:text-red-600 transition-colors line-clamp-2 block">{p.title}</Link></h3>
          <p className="text-red-600 font-black text-lg mb-1">{p.price_label ?? `${p.price} ${p.price_unit}`}</p>
          <div className="flex items-center gap-3 text-xs text-gray-500 mb-1.5 flex-wrap">
            {p.area_sqm && <span className="flex items-center gap-0.5"><Building2 className="w-3 h-3" />{p.area_sqm} m²</span>}
            {p.bedrooms && <span>{p.bedrooms} PN</span>}
            {p.bathrooms && <span>{p.bathrooms} WC</span>}
            {p.direction && <span>Hướng {p.direction}</span>}
            {p.legal_status && <span className="text-emerald-600 flex items-center gap-0.5"><CheckCircle className="w-3 h-3" />{p.legal_status}</span>}
          </div>
          <p className="text-gray-400 text-xs flex items-center gap-1">
            <MapPin className="w-3 h-3 text-red-400" />{[p.address, p.district, p.city].filter(Boolean).join(', ')}
          </p>
        </div>
        <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-gray-100">
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{p.views}</span>
            <span>{new Date(p.created_at).toLocaleDateString('vi-VN')}</span>
          </div>
          <div className="flex gap-2">
            <CompareButton property={p} variant="inline" />
            <button onClick={e => { e.stopPropagation(); e.preventDefault(); onToggleFavorite?.(); }}
              className="w-8 h-8 border border-gray-200 rounded-lg flex items-center justify-center hover:border-red-400 transition-colors">
              <svg className={`w-3.5 h-3.5 ${isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} fill="none">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            </button>
            <Link href={buildPropertyPath(p)} className="inline-flex items-center border border-red-400 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">Chi tiết</Link>
            <button onClick={onContact} className="bg-red-600 hover:bg-red-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
              <Phone className="w-3 h-3" />Liên hệ
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}