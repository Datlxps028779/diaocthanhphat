'use client';
import { useState, useEffect, useCallback, useRef, useMemo, type MouseEventHandler } from 'react';
import dynamic from 'next/dynamic';
import { useQuery, useInfiniteQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Search, Filter, SlidersHorizontal, MapPin, Building2,
  X, ChevronDown, ArrowUpDown, Grid3X3,
  List, Map as MapIcon, Sparkles, Home, Tag
} from 'lucide-react';
import Link from 'next/link';
import { type Property } from '../lib/supabase';
import { captureSignal, captureSignalFromProperty } from '../lib/captureSignal';
import { getAllProperties, getAllPropertiesForMap, getBanners, getFavoriteIds, toggleFavorite } from '../lib/api';
import { buildPropertyPath, PropertySearchUnavailableError, type ListingInitialFilters, type PropertyFilters, type PropertySort } from '../lib/api/properties';
import { parseSearchIntent } from '../lib/aiSearch';
import { CompareButton } from '../components/CompareButton';
import { PropertyCard as UnifiedPropertyCard } from '../components/property/PropertyCard';
import { PropertyQuickViewDrawer } from '../components/property/PropertyQuickViewDrawer';
import { useAreas, usePropertyTypes, useDistricts, useWards, useTaxonomyGeo } from '../lib/hooks/useTaxonomy';
import { qk } from '../lib/queryKeys';
import { LISTINGS_PER_PAGE, type Page, pageToHref, scrollTop } from '../lib/router';
import { shouldResetChild } from '../lib/cascadeReset';
import { nextListingPageParam } from '../lib/listingPaging';
import { ForYou } from '../components/ForYou';
import { RecentlyViewed } from '../components/RecentlyViewed';
import { LEGAL_OPTIONS } from '../lib/legalOptions';
import { PRICE_RANGES_SALE, PRICE_RANGES_RENT, AREA_RANGES, findRangeIndex } from '../lib/priceRange';
import { Breadcrumb } from '../components/Layout';
import { ContactModal } from '../components/ContactModal';
import type { MapBounds } from '../components/PropertyMap';
import { listingInitialDataScopeMatches } from '../lib/listingInitialData';
import { track, EVENTS } from '../lib/analytics';
import { RANKING_POLICY_VERSION } from '../lib/rankingPolicy';
import { buildListingResultLabel, listingEmptyStateGuidance } from '../lib/listingDecision';
import { DiscoverySectionHeader } from '../components/discovery/DiscoverySectionHeader';
import { shouldClearInferredLocation } from '../lib/listingSearchState';
import { localityPriceBandRange, type LocalityListingScope } from '../lib/localityListingScope';
import { confineIntentFilters, localityQueryPriceRange, localityScopeEditPatch, localityScopeEditNeedsNavigation, localityScopeFilterPatch, localityScopeOwnedDimensions, type LocalityGeographyEdit, type LocalityScopeFacts } from '../lib/localityScopeEditing';
import { isSameListingUrl, preserveLocalityPath } from '../lib/localityUrlState';
import localityStyles from '../components/area/localityVisual.module.css';
import { buildLocalityGroups, buildLocalityScopeGroup, getLocalityGroupKey, localityGroupPropertyFilters, type LocalityGroup, type LocalityGroupLevel } from '../lib/localityGroupModel';
import { findExactTaxonomyGeo } from '../lib/taxonomyPoint';

// Phạm vi landing địa phương do ROUTE quyết định, không phải query. Toàn bộ chiều ở
// đây là bất biến trong lúc đang ở landing: sửa chúng nghĩa là rời phạm vi, và phải
// điều hướng tới URL nền thay vì âm thầm giữ path cũ với nội dung khác.
// Type nằm ở lib/localityListingScope để server (localityPageContext) và client dùng
// chung một khai báo — re-export ở đây cho nơi gọi cũ.
export type { LocalityListingScope };

interface ListingsPageProps {
  initialFilters?: ListingInitialFilters;
  // Dữ liệu SSR seed sẵn cho view mà server thực sự đã truy vấn. Scope tách riêng
  // để không dùng nhầm seed chưa lọc cho URL/filter khác.
  initialData?: { data: Property[]; total: number };
  initialDataScope?: ListingInitialFilters;
  // Có mặt ⇔ đang render một landing địa phương (phạm vi do route sở hữu).
  localityScope?: LocalityListingScope;
  localityTransactionPaths?: { sale: string; rent: string };
  hasEditorialHeader?: boolean;
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
const PER_PAGE = LISTINGS_PER_PAGE;

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

// Nhóm loại RỖNG (route có segment loại nhưng nhóm không có thành viên nào). Không thể
// diễn đạt "khớp 0 dòng" bằng cách BỎ điều kiện — làm vậy sẽ trả về cả tỉnh. Gửi một
// UUID không tồn tại để mệnh đề `in` chắc chắn không khớp dòng nào, thay vì âm thầm nới
// rộng phạm vi.
const EMPTY_TYPE_MATCH: string[] = ['00000000-0000-0000-0000-000000000000'];
const ALL_LOCALITY_GROUPS_FOCUS = '__all_locality_groups__';

export function ListingsPage({ initialFilters, initialData, initialDataScope, localityScope, localityTransactionPaths, hasEditorialHeader = false, onNavigate }: ListingsPageProps) {
  const localityScopeGroupKey = localityScope ? `scope:${localityScope.path}` : null;
  const [mapBounds, setMapBounds] = useState<MapBounds | null>(null);
  const [district, setDistrict] = useState(initialFilters?.district ?? '');
  const [ward, setWard] = useState(initialFilters?.ward ?? '');

  const [listingType, setListingType] = useState<ListingTypeKey>((initialFilters?.listingType ?? '') as ListingTypeKey);
  const [keyword, setKeyword] = useState(initialFilters?.keyword ?? '');
  const [debouncedKeyword, setDebouncedKeyword] = useState(keyword);
  const initialKeywordRef = useRef(keyword);
  const inferredLocationRef = useRef(initialFilters?.locationSource === 'inferred');
  const [areaId, setAreaId] = useState(initialFilters?.areaId ?? '');
  const [typeId, setTypeId] = useState(initialFilters?.typeId ?? (localityScope?.typeIds?.length === 1 ? localityScope.typeIds[0] : ''));
  const [typeIds] = useState<string[]>(() => initialFilters?.typeIds ?? []);
  // Query có thể chứa khoảng giá không trùng bất kỳ preset nào.
  const [queryPriceRange, setQueryPriceRange] = useState(() =>
    localityQueryPriceRange(initialFilters, { routeOwnsPrice: Boolean(localityScope?.priceBand) }),
  );
  const [priceIdx, setPriceIdx] = useState(() =>
    localityScope?.priceBand ? 0 : findRangeIndex(
      initialFilters?.listingType === 'cho_thue' ? PRICE_RANGES_RENT : PRICE_RANGES_SALE,
      initialFilters?.minPrice, initialFilters?.maxPrice,
    ),
  );
  const [areaIdx, setAreaIdx] = useState(() =>
    findRangeIndex(AREA_RANGES, initialFilters?.minArea, initialFilters?.maxArea),
  );
  const [bedrooms, setBedrooms] = useState(initialFilters?.bedrooms ?? '');
  const [direction, setDirection] = useState(initialFilters?.direction ?? '');
  const [legal, setLegal] = useState(initialFilters?.legal ?? '');
  const [isFeatured, setIsFeatured] = useState(initialFilters?.isFeatured ?? false);
  const [isHot, setIsHot] = useState(initialFilters?.isHot ?? false);
  const [sort, setSort] = useState<PropertySort>((initialFilters?.sort as PropertySort) ?? 'newest');
  const [viewMode, setViewMode] = useState<'grid' | 'list' | 'map'>('grid');
  const initialLocalityGroupKey = localityScope?.wardId ? localityScopeGroupKey : null;
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(initialLocalityGroupKey);
  const [focusGroupKey, setFocusGroupKey] = useState<string | null>(initialLocalityGroupKey ? ALL_LOCALITY_GROUPS_FOCUS : null);
  const [mapFocusSettled, setMapFocusSettled] = useState(!initialLocalityGroupKey);
  const groupOpenedMap = useRef(false);
  const [page, setPage] = useState(initialFilters?.page ?? 1);
  const [mobileFilter, setMobileFilter] = useState(false);
  const [showLocalityAdvanced, setShowLocalityAdvanced] = useState(false);
  const [desktopMapRail, setDesktopMapRail] = useState(false);
  const [contactProp, setContactProp] = useState<Property | null>(null);
  const [quickViewProperty, setQuickViewProperty] = useState<Property | null>(null);

  const isRent = listingType === 'cho_thue';
  const PRICE_RANGES = isRent ? PRICE_RANGES_RENT : PRICE_RANGES_SALE;

  // Debounce keyword 300ms → tránh request mỗi lần gõ phím; reset về trang 1.
  // Bỏ qua lần chạy đầu: mount với ?page=N (deep-link/chia sẻ link) không được
  // coi là user vừa gõ keyword, nếu không trang sẽ bị đá về 1 ngay khi vào.
  const keywordSettled = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedKeyword(keyword);
      if (keywordSettled.current) setPage(1);
      keywordSettled.current = true;
    }, 300);
    return () => clearTimeout(t);
  }, [keyword]);

  // Homepage có thể suy ra khu vực từ từ khóa. Khi người dùng sửa từ khóa,
  // xóa location suy ra để không biến truy vấn mới thành phép AND với khu vực cũ.
  useEffect(() => {
    if (!shouldClearInferredLocation({
      locationSource: inferredLocationRef.current ? 'inferred' : undefined,
      initialKeyword: initialKeywordRef.current,
      nextKeyword: keyword,
    })) return;
    inferredLocationRef.current = false;
    setAreaId('');
    setDistrict('');
    setWard('');
    setPage(1);
  }, [keyword]);

  // Taxonomy + districts qua React Query (dedup/cache). Reset district tách riêng.
  const { data: areas = [] } = useAreas();
  const { data: types = [] } = usePropertyTypes();
  const { data: districts = [] } = useDistricts(areaId || undefined);

  // URL dạng ?loai=dat-nen: taxonomy load bất đồng bộ nên chỉ map được slug→id
  // sau khi types về. Chỉ chạy một lần cho giá trị seed từ URL, không ghi đè khi
  // user tự đổi loại BĐS sau đó.
  const typeSlugApplied = useRef(false);
  useEffect(() => {
    if (typeSlugApplied.current || !initialFilters?.typeSlug || types.length === 0) return;
    const matched = types.find(item => item.slug === initialFilters.typeSlug);
    if (matched) setTypeId(matched.id);
    typeSlugApplied.current = true;
  }, [initialFilters?.typeSlug, types]);
  // Reset district khi user đổi khu vực. So sánh giá trị trước/sau chứ không đếm số
  // lần chạy: effect còn chạy lại lúc taxonomy về, lần đó không được xoá district
  // đã seed từ URL khu vực (/mua-ban/binh-duong/thuan-an).
  const prevAreaId = useRef<string | undefined>(undefined);
  useEffect(() => {
    // Landing địa phương: area/district/ward do route sở hữu, cascade reset sẽ phá
    // phạm vi đã chọn. Việc rời phạm vi do handleScopeEdit lo, không phải effect này.
    if (localityScope) return;
    if (shouldResetChild(prevAreaId.current, areaId)) setDistrict('');
    prevAreaId.current = areaId;
  }, [areaId, localityScope]);

  // Phường/xã theo quận/huyện đã chọn. district lưu dạng TÊN nên map ra id để fetch.
  const selectedDistrictId = districts.find(d => d.name === district)?.id;
  const { data: wardRows = [] } = useWards(selectedDistrictId, { fetchAll: false });
  const wards = selectedDistrictId ? wardRows.filter(item => item.district_id === selectedDistrictId) : [];
  const selectedArea = areas.find(area => area.id === areaId);
  const selectedType = types.find(type => type.id === typeId);
  // Reset ward khi user đổi quận/huyện — cùng lý do như district ở trên.
  const prevDistrict = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (localityScope) return;
    if (shouldResetChild(prevDistrict.current, district)) setWard('');
    prevDistrict.current = district;
  }, [district, localityScope]);

  const { data: sidebarBanners = [] } = useQuery({ queryKey: qk.banners('sidebar'), queryFn: () => getBanners('sidebar') });
  const { data: topBanners = [] } = useQuery({ queryKey: qk.banners('listings_top'), queryFn: () => getBanners('listings_top') });

  // Yêu thích: persist thật qua Supabase (trước đây GridCard/ListCard chỉ dùng
  // useState cục bộ → bấm tim xong mất khi rời trang). Dùng chung logic với LandingPage.
  const queryClient = useQueryClient();
  const { data: favIds = [] } = useQuery({ queryKey: qk.favoriteIds(), queryFn: getFavoriteIds });
  const favoriteIds = new Set(favIds);
  const favMutation = useMutation({
    mutationFn: (p: Property) => toggleFavorite(p.id),
    onSuccess: (favorited, p) => {
      queryClient.invalidateQueries({ queryKey: qk.favoriteIds() });
      if (favorited) {
        captureSignalFromProperty('favorite', p);
        track(EVENTS.LISTING_SAVE, { listingId: p.id, source: 'listings' });
      }
    },
  });

  // Query danh sách chính — key encode toàn bộ filter đã resolve (min/max)
  const pr = { min: queryPriceRange.minPrice, max: queryPriceRange.maxPrice };
  const ar = AREA_RANGES[areaIdx] ?? AREA_RANGES[0];
  // Khi có phạm vi landing, khoảng giá đến từ path và phải ghi đè khoảng của dropdown
  // (đang là "tất cả" ở đó) — nếu không, query sẽ chạy rộng hơn URL đang hiển thị.
  // Cận trên của hợp đồng band là ĐỘC QUYỀN (price.lt) nên KHÔNG dùng maxPrice/lte.
  // Đẩy bằng salePriceBand để lib/api/properties là nơi duy nhất dịch mã → cú pháp.
  const explicitFilters = useMemo(() => ({
    listingType: listingType || undefined,
    areaId: areaId || undefined,
    typeIds: localityScope
      // Nhóm loại RỖNG nhưng route CÓ segment loại = nhóm không có thành viên ⇒ phải
      // khớp 0 dòng. Không được bỏ điều kiện rồi trả về cả tỉnh.
      ? (localityScope.typePathSlug && !localityScope.typeIds?.length
          ? EMPTY_TYPE_MATCH
          : (localityScope.typeIds?.length ? localityScope.typeIds : undefined))
      : (typeIds.length ? typeIds : undefined),
    // ID là hợp đồng route; TÊN chỉ là bản sao denormalized. Có ID thì bỏ điều kiện
    // theo tên, nếu không bản ghi mang nhãn cũ (quận đổi tên/sáp nhập) sẽ bị loại oan.
    // Chưa có ID (route chưa chốt cấp đó) thì vẫn lọc theo tên như trước.
    districtId: localityScope?.districtId,
    wardId: localityScope?.wardId,
    salePriceBand: localityScope?.priceBand,
    district: localityScope?.districtId ? undefined : (district || undefined),
    ward: localityScope?.wardId ? undefined : (ward || undefined),
    minPrice: pr.min,
    maxPrice: pr.max,
    minArea: ar.min,
    maxArea: ar.max,
    bedrooms: bedrooms || undefined,
    direction: direction || undefined,
    legal: legal || undefined,
    ...localityScopeFilterPatch({
      typeId: typeId || undefined,
      hasRouteTypeIds: Boolean(localityScope?.typeIds?.length) || Boolean(localityScope?.typePathSlug),
    }),
  }), [listingType, areaId, typeId, typeIds, district, ward, pr.min, pr.max, ar.min, ar.max, bedrooms, direction, legal, localityScope]);
  // Nhãn "đang lọc giá" ở UI phải phản ánh cả khoảng giá của route, không chỉ dropdown.
  const priceFilterActive = pr.min !== undefined || pr.max !== undefined || Boolean(localityScope?.priceBand);
  const searchIntent = useMemo(() => parseSearchIntent(debouncedKeyword, { areas, districts, wards, propertyTypes: types }, explicitFilters), [debouncedKeyword, areas, districts, wards, types, explicitFilters]);
  const effectiveSort: PropertySort = debouncedKeyword && sort === 'newest' ? 'relevance' : sort;
  const filters = useMemo(() => ({
    ...explicitFilters,
    // searchIntent suy ra từ TỪ KHÓA nên không được ghi đè các chiều route sở hữu: gõ
    // "Hà Nội" ở landing Bình Dương không có nghĩa là đổi phạm vi. Muốn đổi phải điều
    // hướng. Các filter ngoài phạm vi (diện tích, phòng, hướng, pháp lý) vẫn được nhận.
    ...confineIntentFilters(searchIntent.filters, { hasRouteIds: Boolean(localityScope) }),
    keyword: searchIntent.residualKeyword.trim() || undefined,
    isFeatured: isFeatured || undefined, isHot: isHot || undefined,
    sort: effectiveSort, page, limit: PER_PAGE,
  }), [explicitFilters, searchIntent.filters, searchIntent.residualKeyword, isFeatured, isHot, effectiveSort, page, localityScope]);
  // Chỉ seed dữ liệu SSR khi state hiện tại khớp chính xác scope server đã truy vấn.
  // Base route chỉ seed theo listingType; route khu vực seed thêm area/district. Các
  // filter query phụ (loại/giá/phường/...) luôn phải fetch lại thay vì hiện sai tin.
  const initialScopeMatches = listingInitialDataScopeMatches(initialDataScope, {
    listingType: listingType || undefined,
    areaId: areaId || undefined,
    typeId: localityScope?.typePathSlug ? undefined : (typeId || undefined),
    typeIds: localityScope?.typeIds?.length ? localityScope.typeIds : (typeIds.length ? typeIds : undefined),
    districtId: localityScope?.districtId,
    wardId: localityScope?.wardId,
    salePriceBand: localityScope?.priceBand,
    district: district || undefined,
    ward: ward || undefined,
    keyword: debouncedKeyword || undefined,
    minPrice: pr.min,
    maxPrice: pr.max,
    minArea: ar.min,
    maxArea: ar.max,
    bedrooms: bedrooms || undefined,
    direction: direction || undefined,
    legal: legal || undefined,
    isFeatured,
    isHot,
    sort,
    page,
    typeSlug: initialFilters?.typeSlug,
  });
  // Phân trang giữ URL chia sẻ được (SEO/crawler), nhưng người dùng có thể bấm "Tải
  // thêm" để nối tiếp trang sau vào cùng danh sách. useInfiniteQuery giữ từng trang
  // riêng nên đổi filter/sort là reset sạch, không lẫn dữ liệu cũ.
  const {
    data: infiniteResult,
    isFetching: fetchingListings,
    isError: listingsError,
    error: listingsQueryError,
    refetch: retryListings,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    queryKey: qk.properties(filters),
    queryFn: ({ pageParam }) => getAllProperties({ ...filters, page: pageParam }),
    initialPageParam: page,
    getNextPageParam: (lastPage, allPages) => nextListingPageParam({
      startPage: page,
      perPage: PER_PAGE,
      total: lastPage.total,
      loaded: allPages.reduce((sum, part) => sum + part.data.length, 0),
    }),
    placeholderData: keepPreviousData, // giữ grid khi đổi trang, không nháy
    initialData: initialScopeMatches && initialData
      ? { pages: [initialData], pageParams: [page] }
      : undefined,
  });
  const properties = useMemo(
    () => (infiniteResult?.pages ?? []).flatMap(part => part.data),
    [infiniteResult],
  );
  const total = infiniteResult?.pages[0]?.total ?? 0;
  // Skeleton chỉ cho lần tải danh sách đầu; tải trang kế đã có trạng thái riêng ở
  // nút "Tải thêm" nên không được thay cả grid (đang xem thì list biến mất).
  const loading = fetchingListings && !isFetchingNextPage;

  // Sentinel tự bấm "Tải thêm" khi cuộn tới cuối danh sách. Chỉ là tiện ích: nút
  // vẫn bấm tay được nếu observer không chạy (trình duyệt cũ, reduced motion...).
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = loadMoreRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting) && hasNextPage && !isFetchingNextPage) fetchNextPage();
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  // Tự học im lặng từ ý định tìm kiếm đã ổn định. Đây là behavior signal,
  // không phải saved search/cảnh báo và không tạo bất kỳ UI nào cho người dùng.
  useEffect(() => {
    const areaIdForSignal = filters.areaId || null;
    const typeIdForSignal = filters.typeId || null;
    const listingTypeForSignal = filters.listingType || null;
    if (!areaIdForSignal && !typeIdForSignal && !listingTypeForSignal) return;

    const t = setTimeout(() => {
      captureSignal('search', {
        areaId: areaIdForSignal,
        typeId: typeIdForSignal,
        listingType: listingTypeForSignal,
        // Price personalization tạm tắt đến khi mua bán và thuê được chuẩn hóa
        // theo cùng một đơn vị và tách range theo listing type.
        price: null,
      }, { dedupeWindowMs: 30 * 60 * 1000 });
    }, 800);
    return () => clearTimeout(t);
  }, [filters.areaId, filters.typeId, filters.listingType]);

  // Đồng bộ bộ lọc → URL một chiều qua replaceState (KHÔNG router.push → không refetch
  // route/scroll). F5 hoặc chia sẻ link giữ nguyên trạng thái lọc. Dùng debouncedKeyword
  // để không đổi URL mỗi lần gõ phím. price/area lưu dạng index nên phát ra min/max thật.
  //
  // Landing địa phương: pageToHref KHÔNG biết namespace /loai/, /gia/, /phuong-xa/ nên
  // href nó trả về trỏ cây route cũ. Giữ nguyên pathname của route, chỉ ghép query phụ
  // (preserveLocalityPath) — chiều phạm vi đã bị chặn bởi handleScopeEdit từ trước.
  // Chiều mà route thực sự sở hữu (theo PATH, không phải theo việc có prop scope).
  const owned = localityScope
    ? localityScopeOwnedDimensions(localityScope)
    : { area: false, district: false, ward: false, type: false, price: false, listingType: false };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Chờ taxonomy về mới ghi URL: thiếu nó pageToHref sinh dạng ?area=<uuid> rồi
    // mới sửa lại thành path SEO, khiến thanh địa chỉ nhấp nháy và lịch sử bẩn.
    if (areaId && areas.length === 0) return;
    const href = pageToHref({
      name: 'listings',
      // Route chỉ sở hữu chiều NÓ khai trên path. Chiều còn lại là query của người dùng
      // và phải được giữ nguyên trong URL, nếu không bộ lọc sẽ biến mất khi refresh.
      listingType: localityScope ? undefined : (listingType || undefined),
      areaId: localityScope?.areaId ? undefined : (areaId || undefined),
      typeId: owned.type ? undefined : (typeId || undefined),
      typePathSlug: localityScope?.typePathSlug || initialFilters?.typePathSlug,
      district: owned.district ? undefined : (district || undefined),
      ward: owned.ward ? undefined : (ward || undefined),
      locationSource: inferredLocationRef.current ? 'inferred' : undefined,
      keyword: debouncedKeyword.trim() || undefined,
      minPrice: owned.price ? undefined : pr.min,
      maxPrice: owned.price ? undefined : pr.max,
      minArea: areaIdx > 0 ? ar.min : undefined,
      maxArea: areaIdx > 0 ? ar.max : undefined,
      bedrooms: bedrooms || undefined,
      direction: direction || undefined,
      legal: legal || undefined,
      sort: sort !== 'newest' ? (sort as string) : undefined,
      isFeatured: isFeatured || undefined,
      isHot: isHot || undefined,
      page: page > 1 ? page : undefined,
    }, { areas, districts, propertyTypes: types });
    const current = { pathname: window.location.pathname, search: window.location.search };
    const next = localityScope ? preserveLocalityPath(current, href) : href;
    if (!isSameListingUrl(current, next)) window.history.replaceState(null, '', next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listingType, areaId, typeId, initialFilters?.typePathSlug, district, ward, debouncedKeyword, priceIdx, areaIdx, bedrooms, direction, legal, sort, page, pr.min, pr.max, ar.min, ar.max, areas, districts, types, isFeatured, isHot, localityScope]);

  // Map view dùng CHÍNH filter hiệu lực của list (kể cả semantic intent), chỉ bỏ
  // paging/sort vì marker là một tập kết quả chứ không phải một trang xếp hạng.
  const mapFilters = useMemo(() => ({
    ...filters,
    page: undefined,
    limit: undefined,
    sort: undefined,
  }), [filters]);
  const {
    data: mapProperties = EMPTY_PROPS,
    isLoading: mapLoading,
    isError: mapError,
    refetch: retryMap,
  } = useQuery({
    queryKey: qk.propertiesMap(mapFilters),
    queryFn: () => getAllPropertiesForMap(mapFilters),
    enabled: viewMode === 'map' || Boolean(localityScope),
  });
  // Leaflet keeps the first handler, so keep data filtering outside its closure.
  const handleBoundsChange = useCallback((bounds: MapBounds) => {
    if (selectedGroupKey && !mapFocusSettled) return;
    if (typeof window !== 'undefined' && viewMode !== 'map' && !window.matchMedia('(min-width: 1280px)').matches) return;
    setMapBounds(bounds);
  }, [viewMode, selectedGroupKey, mapFocusSettled]);

  const localityGroupKey = useCallback(
    (property: Property) => getLocalityGroupKey(property, localityScope?.areaId),
    [localityScope?.areaId],
  );
  const localityChildGroupLevel: LocalityGroupLevel | null = localityScope?.wardId ? null : 'ward';
  const localityGroups = useMemo(
    () => localityScope && localityChildGroupLevel ? buildLocalityGroups(mapProperties, localityScope.areaId, localityChildGroupLevel) : [],
    [mapProperties, localityScope, localityChildGroupLevel],
  );
  const localityScopeLabel = ward || initialFilters?.ward
    || district || initialFilters?.district
    || areas.find(area => area.id === localityScope?.areaId)?.name
    || 'phạm vi hiện tại';
  const localityScopeLevel = localityScope?.wardId ? 'ward' : localityScope?.districtId ? 'district' : 'area';
  const localityScopeGroup = useMemo(
    () => localityScope && localityScopeGroupKey
      ? buildLocalityScopeGroup(properties, {
        key: localityScopeGroupKey,
        level: localityScopeLevel,
        label: `Tất cả ${localityScopeLabel}`,
        count: total,
      })
      : null,
    [localityScope, localityScopeGroupKey, localityScopeLevel, localityScopeLabel, properties, total],
  );
  const allLocalityGroups = localityScopeGroup ? [localityScopeGroup, ...localityGroups] : localityGroups;
  const visibleLocalityGroups = selectedGroupKey ? allLocalityGroups : localityGroups;
  const selectedGroup = allLocalityGroups.find(group => group.key === selectedGroupKey);
  const scopeOverviewSelected = Boolean(localityScopeGroupKey && selectedGroupKey === localityScopeGroupKey);
  const selectedGeoEntityId = selectedGroup?.level === 'ward' ? selectedGroup.representative.ward_id : null;
  const { data: selectedGeoRows = [], isPending: selectedGeoPending } = useTaxonomyGeo(selectedGeoEntityId ? [selectedGeoEntityId] : []);
  const selectedGeo = selectedGroup ? findExactTaxonomyGeo(selectedGeoRows, selectedGroup.level, selectedGeoEntityId) : null;
  const visibleMapProperties = useMemo(
    () => localityScope && selectedGroupKey && mapFocusSettled
      ? (scopeOverviewSelected ? mapProperties : mapProperties.filter(property => localityGroupKey(property) === selectedGroupKey))
      : mapProperties,
    [localityScope, localityGroupKey, mapProperties, selectedGroupKey, mapFocusSettled, scopeOverviewSelected],
  );
  const viewportProps = useMemo(
    () => filterByBounds(visibleMapProperties, mapBounds),
    [visibleMapProperties, mapBounds],
  );
  const selectedGroupFilters = useMemo<PropertyFilters | null>(() => selectedGroup && !scopeOverviewSelected
    ? localityGroupPropertyFilters({ ...mapFilters, sort: effectiveSort }, selectedGroup)
    : null,
  [mapFilters, selectedGroup, effectiveSort, scopeOverviewSelected]);
  const {
    data: selectedGroupPages,
    isPending: selectedGroupLoading,
    isError: selectedGroupError,
    isFetchNextPageError: selectedGroupPageError,
    hasNextPage: selectedGroupHasNextPage,
    isFetchingNextPage: selectedGroupFetchingNextPage,
    fetchNextPage: fetchNextSelectedGroupPage,
    refetch: retrySelectedGroup,
  } = useInfiniteQuery({
    queryKey: ['locality-group-results', selectedGroup?.key, qk.properties(selectedGroupFilters ?? {})],
    queryFn: ({ pageParam }) => getAllProperties({ ...selectedGroupFilters!, page: pageParam, limit: PER_PAGE }),
    enabled: Boolean(localityScope && selectedGroupFilters),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => nextListingPageParam({
      startPage: 1,
      perPage: PER_PAGE,
      total: lastPage.total,
      loaded: allPages.reduce((sum, part) => sum + part.data.length, 0),
    }),
  });
  const selectedGroupProperties = scopeOverviewSelected
    ? properties
    : selectedGroupFilters
      ? (selectedGroupPages?.pages.flatMap(part => part.data) ?? [])
      : mapProperties.filter(property => selectedGroupKey != null && localityGroupKey(property) === selectedGroupKey);
  const selectedGroupTotal = scopeOverviewSelected ? total : selectedGroupFilters ? (selectedGroupPages?.pages[0]?.total ?? 0) : selectedGroupProperties.length;
  const viewportResultProperties = scopeOverviewSelected
    ? selectedGroupProperties
    : selectedGroup && mapBounds && mapFocusSettled ? viewportProps : selectedGroupProperties;
  const viewportResultTotal = scopeOverviewSelected
    ? selectedGroupTotal
    : selectedGroup && mapBounds && mapFocusSettled ? viewportResultProperties.length : selectedGroupTotal;
  const selectionResetKey = JSON.stringify(filters);
  useEffect(() => {
    const nextGroupKey = localityScope?.wardId ? localityScopeGroupKey : null;
    setSelectedGroupKey(nextGroupKey);
    setFocusGroupKey(nextGroupKey ? ALL_LOCALITY_GROUPS_FOCUS : null);
    setMapFocusSettled(!nextGroupKey);
    setMapBounds(null);
  }, [selectionResetKey, localityScope?.path, localityScope?.wardId, localityScopeGroupKey]);

  // Reset price index CHỈ khi listingType thực sự đổi (user bấm tab mua↔thuê) —
  // so giá trị trước, không dùng cờ boolean (cờ bị StrictMode double-invoke reset
  // nhầm priceIdx đã seed từ URL ?minPrice/?maxPrice ngay khi mount).
  // Ở landing địa phương, đổi listingType là rời phạm vi (đã điều hướng) nên effect
  // này không được đụng vào khoảng giá của route.
  const prevListingType = useRef(listingType);
  useEffect(() => {
    if (localityScope) return;
    if (prevListingType.current !== listingType) {
      prevListingType.current = listingType;
      setPriceIdx(0);
      setQueryPriceRange({});
    }
  }, [listingType, localityScope]);

  const resetFilters = () => {
    // Ở landing địa phương, "xóa bộ lọc" phải đưa về URL nền — xóa state tại chỗ sẽ
    // để path cũ hiển thị nội dung không còn khớp phạm vi.
    if (localityScope) {
      onNavigate({ name: 'listings', localityPath: localityScope.path, listingType: localityScope.listingType });
      return;
    }
    inferredLocationRef.current = false;
    setKeyword(''); setAreaId(''); setTypeId(''); setDistrict(''); setWard('');
    setPriceIdx(0); setQueryPriceRange({}); setAreaIdx(0); setBedrooms('');
    setDirection(''); setLegal(''); setIsFeatured(false); setIsHot(false); setSort('newest'); setPage(1);
  };

  const clearSearchAndFilters = () => {
    if (localityScope) {
      onNavigate({ name: 'listings', localityPath: localityScope.path, listingType: localityScope.listingType });
      return;
    }
    resetFilters();
    if (listingType) setListingType('');
  };

  const resultSummary = buildListingResultLabel({
    propertyTypeName: selectedType?.name,
    listingType,
    areaName: selectedArea?.name,
    district,
    ward,
    keyword: searchIntent.residualKeyword,
  });

  const totalPages = Math.ceil(total / PER_PAGE);

  // Link cũ ?page=N trỏ quá số trang hiện có (tin đã bị gỡ bớt) → đưa về trang cuối
  // thay vì để người dùng đứng ở danh sách rỗng.
  useEffect(() => {
    if (totalPages > 0 && page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  const activeOwned = localityScope ? localityScopeOwnedDimensions(localityScope) : null;
  const hasActiveFilters = localityScope
    ? !!(keyword || (!activeOwned?.type && typeId) || (!activeOwned?.district && district) || (!activeOwned?.ward && ward) || (priceFilterActive && !activeOwned?.price) || areaIdx || bedrooms || direction || legal || isFeatured || isHot)
    : !!(keyword || areaId || typeId || district || ward || priceFilterActive || areaIdx || bedrooms || direction || legal || isFeatured || isHot);
  const activeFilterCount = (localityScope
    ? [keyword, !activeOwned?.type && typeId, !activeOwned?.district && district, !activeOwned?.ward && ward, priceFilterActive && !activeOwned?.price, areaIdx > 0, bedrooms, direction, legal, isFeatured, isHot]
    : [listingType, areaId, typeId, district, ward, priceFilterActive, areaIdx > 0, bedrooms, direction, legal, isFeatured, isHot])
    .filter(Boolean).length;
  const trackResultClick = (position: number, source: 'grid' | 'list' | 'map') => {
    track(EVENTS.LISTING_RESULT_CLICK, {
      source,
      sort: effectiveSort,
      position,
      hasKeyword: Boolean(searchIntent.residualKeyword.trim()),
      activeFilterCount,
      policyVersion: RANKING_POLICY_VERSION,
    });
  };
  const resultClickHandler = useCallback((property: Property, position: number, source: 'grid' | 'list' | 'map'): MouseEventHandler<HTMLAnchorElement> => event => {
    trackResultClick(position, source);
    if (!localityScope || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (typeof window === 'undefined' || !window.matchMedia('(min-width: 1024px)').matches) return;
    event.preventDefault();
    setQuickViewProperty(property);
  }, [localityScope, effectiveSort, searchIntent.residualKeyword, activeFilterCount]);
  const setFilter = (fn: () => void) => { fn(); setPage(1); };
  const setLocationFilter = (fn: () => void) => {
    inferredLocationRef.current = false;
    setFilter(fn);
  };
  const selectLocalityGroup = useCallback((groupKey: string | null) => {
    setSelectedGroupKey(groupKey);
    setFocusGroupKey(groupKey === localityScopeGroupKey ? ALL_LOCALITY_GROUPS_FOCUS : groupKey ?? ALL_LOCALITY_GROUPS_FOCUS);
    setMapFocusSettled(false);
    setMapBounds(null);
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 1279px)').matches && groupKey) {
      groupOpenedMap.current = true;
      setViewMode('map');
    }
  }, [localityScopeGroupKey]);
  const completeMapFocus = useCallback((bounds: MapBounds) => {
    setMapBounds(bounds);
    setFocusGroupKey(null);
    setMapFocusSettled(true);
  }, []);
  useEffect(() => {
    if (!localityScope) return;
    const media = window.matchMedia('(min-width: 1280px)');
    const update = () => {
      setDesktopMapRail(media.matches);
      if (!media.matches && viewMode !== 'map') setMapBounds(null);
      if (media.matches && groupOpenedMap.current) {
        groupOpenedMap.current = false;
        if (selectedGroupKey) {
          setMapFocusSettled(false);
          setFocusGroupKey(selectedGroupKey);
        }
        setMapBounds(null);
        setViewMode('grid');
      }
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [localityScope, selectedGroupKey, viewMode]);

  // Sự thật của phạm vi hiện tại + bộ lọc ngoài phạm vi người dùng đã chọn. Mọi quyết
  // định điều hướng dưới đây dựng từ đây qua builder thuần (lib/localityScopeEditing),
  // không tự ghép patch tại chỗ — đó là nguồn của các lỗi "rơi mất tỉnh/quận" và
  // "so sánh lệch vì điền ''".
  const scopeFacts = useMemo<LocalityScopeFacts>(() => ({
    areaId: localityScope?.areaId ?? initialFilters?.areaId ?? '',
    districtId: localityScope?.districtId,
    wardId: localityScope?.wardId,
    districtName: district || initialFilters?.district || undefined,
    wardName: ward || initialFilters?.ward || undefined,
    areaName: areas.find(a => a.id === (localityScope?.areaId ?? initialFilters?.areaId))?.name,
    typeIds: localityScope?.typeIds,
    typePathSlug: localityScope?.typePathSlug,
    listingType: (listingType || undefined) as 'mua_ban' | 'cho_thue' | undefined,
    priceBand: localityScope?.priceBand,
    copy: {
      keyword: debouncedKeyword.trim() || undefined,
      typeId: owned.type ? undefined : (typeId || undefined),
      minPrice: owned.price ? undefined : pr.min,
      maxPrice: owned.price ? undefined : pr.max,
      minArea: areaIdx > 0 ? ar.min : undefined,
      maxArea: areaIdx > 0 ? ar.max : undefined,
      bedrooms: bedrooms || undefined,
      direction: direction || undefined,
      legal: legal || undefined,
      sort: sort !== 'newest' ? (sort as string) : undefined,
      isFeatured: isFeatured || undefined,
      isHot: isHot || undefined,
      page: page > 1 ? page : undefined,
    },
  }), [localityScope, initialFilters?.areaId, initialFilters?.district, initialFilters?.ward, areas, district, ward, listingType, debouncedKeyword, areaIdx, ar.min, ar.max, bedrooms, direction, legal, sort, isFeatured, isHot, page, owned.type, owned.price, typeId, pr.min, pr.max]);

  // Rời phạm vi landing: điều hướng tới URL NỀN, bỏ mọi chiều route đang sở hữu nhưng
  // GIỮ bộ lọc ngoài phạm vi để không mất ngữ cảnh người dùng đã chọn.
  const leaveLocalityScope = useCallback((edit: LocalityGeographyEdit) => {
    if (!localityScope) return;
    inferredLocationRef.current = false;
    onNavigate({ name: 'listings', ...localityScopeEditPatch(scopeFacts, edit) });
  }, [localityScope, onNavigate, scopeFacts]);

  // Bọc mọi thao tác có thể chạm vào chiều phạm vi: nếu thao tác đó thực sự đổi phạm vi
  // thì rời landing; nếu không (chọn lại đúng khu vực đang xem) thì giữ nguyên.
  // `alwaysNavigate` = true khi thao tác chỉ có nghĩa ngoài phạm vi (vd đổi hình thức
  // giao dịch), nên rời landing ngay cả khi giá trị trùng.
  const editScopeDimension = (
    edit: LocalityGeographyEdit,
    apply: () => void,
    navigateOptions?: { alwaysNavigate?: boolean },
  ) => {
    if (localityScope && (navigateOptions?.alwaysNavigate || localityScopeEditNeedsNavigation(owned, scopeFacts, edit))) {
      leaveLocalityScope(edit);
      return;
    }
    if (edit.kind === 'district') setWard('');
    setLocationFilter(apply);
  };

  const pageTitle = isFeatured ? 'BĐS Nổi bật'
    : isHot ? 'BĐS HOT'
    : listingType === 'mua_ban' ? 'Mua bán bất động sản'
    : listingType === 'cho_thue' ? 'Cho thuê bất động sản'
    : 'Bất động sản';

  // H1 phải mô tả đúng nội dung đang lọc để crawler hiểu trang. Ghép thêm loại
  // BĐS và khu vực khi user đã chọn; tên lấy từ taxonomy thật, không bịa.
  const heading = (() => {
    const typeName = typeId ? types.find(item => item.id === typeId)?.name : '';
    const areaName = areaId ? areas.find(item => item.id === areaId)?.name : '';
    const place = [ward, district, areaName].filter(Boolean).join(', ');
    const residualKeyword = searchIntent.residualKeyword.trim();
    const base = isFeatured ? 'Bất động sản nổi bật'
      : isHot ? 'Bất động sản HOT'
      : listingType === 'mua_ban' ? `${typeName || 'Nhà đất'} bán`
      : listingType === 'cho_thue' ? `${typeName || 'Nhà đất'} cho thuê`
      : typeName || 'Bất động sản';
    const context = place ? `${base} tại ${place}` : base;
    return residualKeyword ? `${context} theo từ khóa “${residualKeyword}”` : context;
  })();

  const FilterPanel = () => (
    <div className="space-y-5">
      {/* Area Pills */}
      <div>
        <label className="text-xs font-bold text-gray-700 uppercase tracking-wide block mb-2">Khu vực</label>
        <div className="flex flex-wrap gap-1.5">
          <button onClick={() => editScopeDimension({ kind: 'area', id: '' }, () => setAreaId(''))}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${!areaId ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 text-gray-600 hover:border-red-400'}`}>
            Tất cả
          </button>
          {areas.map(a => (
            <button key={a.id} onClick={() => editScopeDimension({ kind: 'area', id: areaId === a.id ? '' : a.id, name: a.name }, () => setAreaId(areaId === a.id ? '' : a.id))}
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
            <select value={district} onChange={e => editScopeDimension({ kind: 'district', id: e.target.value, name: e.target.value }, () => setDistrict(e.target.value))}
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
            <select value={ward} onChange={e => editScopeDimension({ kind: 'ward', id: e.target.value, name: e.target.value }, () => setWard(e.target.value))}
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
          <select value={typeId} onChange={e => editScopeDimension({ kind: 'type', id: e.target.value }, () => setTypeId(e.target.value))}
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
              <input type="radio" name="price" checked={priceIdx === i && !(i === 0 && priceFilterActive)} onChange={() => editScopeDimension({ kind: 'price', priceRange: PRICE_RANGES[i] }, () => {
                setPriceIdx(i);
                setQueryPriceRange(localityQueryPriceRange({ minPrice: r.min, maxPrice: r.max }));
              })}
                className="accent-red-500 flex-shrink-0" />
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

  const localityPanelLoading = scopeOverviewSelected ? loading : !mapBounds && Boolean(selectedGroupFilters) && selectedGroupLoading;
  const localityPanelError = scopeOverviewSelected ? listingsError : !mapBounds && selectedGroupError && !selectedGroupPages;
  const localityPanelHasNextPage = scopeOverviewSelected ? hasNextPage : !mapBounds && !selectedGroupPageError && selectedGroupHasNextPage;
  const localityPanelFetchingNextPage = scopeOverviewSelected ? isFetchingNextPage : selectedGroupFetchingNextPage;
  const fetchNextLocalityPanelPage = scopeOverviewSelected ? fetchNextPage : fetchNextSelectedGroupPage;

  const localityPanel = selectedGroup ? (
    <section className={localityStyles.groupResults} data-testid="locality-selected-results" aria-label={`Tin tại ${selectedGroup.label}`}>
      <div className={localityStyles.groupHeader}>
        <div>
          <h3>{scopeOverviewSelected ? `${selectedGroup.label} (${viewportResultTotal.toLocaleString('vi-VN')})` : `Kết quả trong khung bản đồ (${localityPanelLoading ? '…' : viewportResultTotal.toLocaleString('vi-VN')})`}</h3>
          <p>{scopeOverviewSelected
            ? `${mapProperties.length.toLocaleString('vi-VN')} tin có vị trí bản đồ trong phạm vi URL hiện tại`
            : `${selectedGroup.level === 'area' ? 'Tin có tọa độ' : 'Đang xem'}: ${selectedGroup.label} · ${selectedGroup.count} tin có vị trí bản đồ`}</p>
        </div>
        {localityGroups.length > 0 && <button type="button" className={localityStyles.groupRefresh} aria-label="Xem theo nhóm khu vực" onClick={() => selectLocalityGroup(null)}><X size={16} /></button>}
      </div>
      {localityPanelLoading ? <div role="status" className="py-10 text-center text-sm text-slate-500">Đang tải tin trong khu vực…</div>
        : localityPanelError ? <div role="alert" className="py-8 text-center text-sm text-red-700">Không thể tải tin trong khu vực. <button type="button" onClick={() => void (scopeOverviewSelected ? retryListings() : retrySelectedGroup())} className="font-semibold underline">Thử lại</button></div>
          : viewportResultProperties.length ? <div className={localityStyles.groupSelectedList}>
            {viewportResultProperties.map((property, index) => <UnifiedPropertyCard key={property.id} property={property} href={buildPropertyPath(property)} variant="locality"
              onResultClick={resultClickHandler(property, index + 1, 'list')}
              isFavorited={favoriteIds.has(property.id)} onToggleFavorite={() => favMutation.mutate(property)} onContact={() => setContactProp(property)} />)}
          </div> : <p className="py-10 text-center text-sm text-slate-500">Chưa có tin phù hợp trong phạm vi này.</p>}
      {!scopeOverviewSelected && !mapBounds && selectedGroupPageError && <p role="alert" className="mt-3 text-center text-xs text-red-700">Không tải được trang kế tiếp; các tin đã tải vẫn được giữ lại. <button type="button" onClick={() => void fetchNextSelectedGroupPage()} className="font-semibold underline">Thử lại</button></p>}
      {localityPanelHasNextPage && <button type="button" onClick={() => void fetchNextLocalityPanelPage()} disabled={localityPanelFetchingNextPage} className="mt-4 w-full rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 disabled:opacity-50">{localityPanelFetchingNextPage ? 'Đang tải thêm…' : 'Xem thêm tin'}</button>}
    </section>
  ) : <LocalityGroupResults groups={visibleLocalityGroups} loading={mapLoading} error={mapError} total={mapProperties.length} selectedGroupKey={selectedGroupKey} groupLabel={localityChildGroupLevel === 'ward' ? 'Nhóm phường / xã' : 'Nhóm khu vực'} onSelectGroup={selectLocalityGroup} />;

  return (
    <div className={localityScope ? `${localityStyles.scope} min-h-screen bg-white` : 'min-h-screen bg-stone-50'} data-testid="listings-surface">
      {/* Header bar with tabs */}
      <div className="border-b border-stone-200 bg-white">
        <div className={`mx-auto px-4 py-3 ${localityScope ? 'max-w-[1360px] sm:px-8' : 'max-w-7xl'}`}>
          {!hasEditorialHeader && <Breadcrumb items={[
            { label: 'Trang chủ', onClick: () => onNavigate({ name: 'home' }) },
            { label: pageTitle },
          ]} />}

          {!hasEditorialHeader && <h1 className="mt-1 mb-3 text-lg font-black text-gray-900 md:text-2xl">{heading}</h1>}

          {localityScope && (
            <div className={localityStyles.localityToolbar} data-testid="locality-toolbar">
              <nav className={localityStyles.transactionTabs} aria-label="Loại giao dịch">
                {localityTransactionPaths && <>
                  <Link href={localityTransactionPaths.sale} className={listingType === 'mua_ban' ? localityStyles.transactionActive : localityStyles.transactionLink}>Mua bán</Link>
                  <Link href={localityTransactionPaths.rent} className={listingType === 'cho_thue' ? localityStyles.transactionActive : localityStyles.transactionLink}>Cho thuê</Link>
                </>}
              </nav>
              <div className={localityStyles.searchRow}>
                <div className="relative min-w-0 flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  <input value={keyword} onChange={e => { setKeyword(e.target.value); setPage(1); }}
                    onKeyDown={e => { if (e.key === 'Enter') { setDebouncedKeyword(keyword); setPage(1); } }}
                    placeholder="Tìm theo khu vực, tên tin, địa chỉ..."
                    className="h-11 w-full rounded-full border border-slate-200 bg-white pl-9 pr-9 text-sm focus:outline-none focus:ring-2 focus:ring-red-200" />
                  {keyword && <button onClick={() => { setKeyword(''); setPage(1); }} aria-label="Xóa tìm kiếm" className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"><X className="h-3.5 w-3.5" /></button>}
                </div>
                <button type="button" onClick={() => setDebouncedKeyword(keyword)} className={localityStyles.searchButton}>Tìm</button>
              </div>
              <div className={localityStyles.quickFilters}>
                <label className={localityStyles.quickFilter}>
                  <span>Loại nhà đất</span>
                  <select value={typeId} onChange={e => editScopeDimension({ kind: 'type', id: e.target.value }, () => setTypeId(e.target.value))}>
                    <option value="">Tất cả</option>
                    {types.map(type => <option key={type.id} value={type.id}>{type.name}</option>)}
                  </select>
                </label>
                <label className={localityStyles.quickFilter}>
                  <span>{isRent ? 'Giá thuê' : 'Khoảng giá'}</span>
                  <select value={priceIdx} onChange={e => { const index = Number(e.target.value); const range = PRICE_RANGES[index]; editScopeDimension({ kind: 'price', priceRange: range }, () => { setPriceIdx(index); setQueryPriceRange(localityQueryPriceRange({ minPrice: range.min, maxPrice: range.max })); }); }}>
                    {PRICE_RANGES.map((range, index) => <option key={range.label} value={index}>{range.label}</option>)}
                  </select>
                </label>
                <label className={localityStyles.quickFilter}>
                  <span>Diện tích</span>
                  <select value={areaIdx} onChange={e => setFilter(() => setAreaIdx(Number(e.target.value)))}>
                    {AREA_RANGES.map((range, index) => <option key={range.label} value={index}>{range.label}</option>)}
                  </select>
                </label>
                {districts.length > 0 && <label className={localityStyles.quickFilter}>
                  <span>Quận / huyện</span>
                  <select value={district} onChange={e => editScopeDimension({ kind: 'district', id: e.target.value, name: e.target.value }, () => setDistrict(e.target.value))}>
                    <option value="">Tất cả</option>
                    {districts.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}
                  </select>
                </label>}
                <button type="button" className={`${localityStyles.mapButton} xl:hidden`} onClick={() => { const next = viewMode === 'map' ? 'grid' : 'map'; if (next === 'map') groupOpenedMap.current = true; setViewMode(next); }} aria-label={viewMode === 'map' ? 'Danh sách' : 'Bản đồ'}>{viewMode === 'map' ? 'Danh sách' : 'Bản đồ'}</button>
                <button type="button" className={`${localityStyles.advancedButton} ${showLocalityAdvanced ? localityStyles.advancedButtonActive : ''}`} aria-expanded={showLocalityAdvanced} aria-controls="locality-advanced-filters" onClick={() => setShowLocalityAdvanced(value => !value)}><SlidersHorizontal className="h-3.5 w-3.5" />Bộ lọc nâng cao{activeFilterCount > 0 && <span>{activeFilterCount}</span>}</button>
                {hasActiveFilters && <button type="button" className={localityStyles.resetButton} onClick={resetFilters}>Xóa tất cả</button>}
              </div>
              {showLocalityAdvanced && <div id="locality-advanced-filters" className={localityStyles.advancedPanel}>
                {wards.length > 0 && <label><span>Phường / xã</span><select value={ward} onChange={event => editScopeDimension({ kind: 'ward', id: event.target.value, name: event.target.value }, () => setWard(event.target.value))}><option value="">Tất cả</option>{wards.map(item => <option key={item.id} value={item.name}>{item.name}</option>)}</select></label>}
                <label><span>Pháp lý</span><select value={legal} onChange={event => setFilter(() => setLegal(event.target.value))}><option value="">Tất cả</option>{LEGAL_OPTIONS.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
                <label><span>Hướng nhà</span><select value={direction} onChange={event => setFilter(() => setDirection(event.target.value))}><option value="">Tất cả</option>{DIRECTIONS.map(item => <option key={item} value={item}>{item}</option>)}</select></label>
                <div className={localityStyles.advancedBedrooms}><span>Phòng ngủ</span><div>{['', '1', '2', '3', '4', '5'].map(value => <button key={value || 'all'} type="button" aria-pressed={bedrooms === value} onClick={() => setFilter(() => setBedrooms(value))}>{value ? `${value}+` : 'Tất cả'}</button>)}</div></div>
                <label className={localityStyles.advancedToggle}><input type="checkbox" checked={isFeatured} onChange={event => setFilter(() => setIsFeatured(event.target.checked))} /><span>Tin nổi bật</span></label>
                <label className={localityStyles.advancedToggle}><input type="checkbox" checked={isHot} onChange={event => setFilter(() => setIsHot(event.target.checked))} /><span>Tin HOT</span></label>
              </div>}
              <p className="text-xs text-slate-500" aria-live="polite">{loading ? 'Đang cập nhật kết quả...' : <>Hiện có <strong className="text-slate-800">{total.toLocaleString('vi-VN')}</strong> tin trong phạm vi này</>}</p>
            </div>
          )}

          {!localityScope && <>
            {/* Listing type tabs — đổi giao dịch ở landing là đổi phạm vi: luôn điều
                hướng tới URL nền của loại mới thay vì đổi ngầm trên path cũ. */}
            <div className="mb-3 flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide">
              {LISTING_TYPES.map(lt => (
                <button key={lt.key} onClick={() => {
                  setListingType(lt.key); setPage(1);
                }}
                  className={`flex flex-shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${listingType === lt.key ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {lt.icon}{lt.label}
                </button>
              ))}
            </div>

            {/* Area quick tabs */}
            <div className="mb-3 flex items-center gap-2 overflow-x-auto pb-1 scrollbar-hide">
              <button onClick={() => editScopeDimension({ kind: 'area', id: '' }, () => setAreaId(''))}
                className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${!areaId ? 'border border-red-200 bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                Tất cả khu vực
              </button>
              {areas.map(a => (
                <button key={a.id} onClick={() => editScopeDimension({ kind: 'area', id: areaId === a.id ? '' : a.id, name: a.name }, () => setAreaId(areaId === a.id ? '' : a.id))}
                  className={`flex-shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${areaId === a.id ? 'border border-red-200 bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                  {a.name}
                </button>
              ))}
            </div>
          </>}

          {!localityScope && <div className="flex items-center justify-between flex-wrap gap-3">
            <p className="text-gray-500 text-xs" aria-live="polite">
              {loading ? (
                'Đang cập nhật kết quả...'
              ) : (
                <>
                  Tìm thấy <strong className="text-gray-800">{total.toLocaleString('vi-VN')}</strong> {resultSummary}
                  {total > properties.length && properties.length > 0 && ` · Đang hiển thị ${properties.length}`}
                </>
              )}
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
              <button type="button" onClick={() => setMobileFilter(true)} aria-label="Mở bộ lọc nâng cao" aria-expanded={mobileFilter} aria-controls="mobile-listing-filters" className="flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-200 lg:hidden">
                <Filter className="h-4 w-4" />Bộ lọc
                {activeFilterCount > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-bold text-white">{activeFilterCount}</span>}
              </button>
            </div>
          </div>}
        </div>
      </div>

      <div className={`mx-auto px-4 py-5 ${localityScope ? 'max-w-[1440px] sm:px-8' : 'max-w-7xl'}`}>
        <div className={localityScope ? 'grid items-start gap-6 xl:grid-cols-[minmax(440px,520px)_minmax(0,1fr)]' : 'flex gap-5'}>
          {/* Generic listing keeps its sidebar; locality uses the full left column for results. */}
          {!localityScope && <aside className="hidden w-60 flex-shrink-0 lg:block">
            <div className="sticky top-28 border-l border-stone-200 pl-4">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-red-500" />
                  <h2 className="font-bold text-sm text-gray-900">Bộ lọc nâng cao</h2>
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
          </aside>}

          {/* Main content */}
          <div className={`min-w-0 ${localityScope && viewMode === 'map' ? 'xl:col-span-2' : 'flex-1'}`}>
            {/* Top banner */}
            {!localityScope && topBanners[0] && (
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
            {!localityScope && <div className={localityScope ? `${localityStyles.listingSurface} mb-5 flex flex-wrap items-center justify-between gap-2 px-4 py-3` : 'mb-4 flex flex-wrap items-center justify-between gap-2 border-y border-stone-200 bg-white px-1 py-2.5 sm:px-2'}>
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
                      aria-label={v.label}
                      className={`flex h-10 w-10 items-center justify-center rounded-lg transition-colors ${viewMode === v.mode ? 'bg-red-100 text-red-600' : 'text-gray-400 hover:text-gray-600'}`}>
                      {v.icon}
                    </button>
                  ))}
                </div>
              </div>
            </div>}

            {/* Active filter chips */}
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-2 mb-3">
                {searchIntent.matched.length > 0 && (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-100 px-3 py-1 rounded-full text-xs font-semibold">
                    <Sparkles className="w-3 h-3" />AI đã hiểu: {searchIntent.matched.map(m => m.label).join(' · ')}
                  </span>
                )}
                {areaId && selectedArea && (
                  <FilterChip label={`📍 ${selectedArea.name}`} onRemove={() => editScopeDimension({ kind: 'area', id: '' }, () => setAreaId(''))} />
                )}
                {district && <FilterChip label={district} onRemove={() => editScopeDimension({ kind: 'district', id: '' }, () => setDistrict(''))} />}
                {ward && <FilterChip label={ward} onRemove={() => editScopeDimension({ kind: 'ward', id: '' }, () => setWard(''))} />}
                {typeId && types.find(t => t.id === typeId) && (
                  <FilterChip label={types.find(t => t.id === typeId)!.name} onRemove={() => editScopeDimension({ kind: 'type', id: '' }, () => setTypeId(''))} />
                )}
                {priceFilterActive && (
                  <FilterChip
                    label={localityScope?.priceBand
                      ? (localityPriceBandRange(localityScope.priceBand)?.label ?? PRICE_RANGES[priceIdx]?.label ?? '')
                      : (priceIdx > 0 ? PRICE_RANGES[priceIdx]?.label : `${pr.min ?? 0}–${pr.max ?? '∞'} ${isRent ? 'triệu/tháng' : 'tỷ'}`)}
                    onRemove={() => editScopeDimension({ kind: 'price', priceRange: undefined }, () => { setPriceIdx(0); setQueryPriceRange({}); })}
                  />
                )}
                {areaIdx > 0 && <FilterChip label={AREA_RANGES[areaIdx]?.label ?? ''} onRemove={() => setFilter(() => setAreaIdx(0))} />}
                {legal && <FilterChip label={legal} onRemove={() => setFilter(() => setLegal(''))} />}
                {direction && <FilterChip label={`Hướng ${direction}`} onRemove={() => setFilter(() => setDirection(''))} />}
                {bedrooms && <FilterChip label={`${bedrooms}+ phòng ngủ`} onRemove={() => setFilter(() => setBedrooms(''))} />}
                {isFeatured && <FilterChip label="Nổi bật" onRemove={() => setFilter(() => setIsFeatured(false))} />}
                {isHot && <FilterChip label="HOT" onRemove={() => setFilter(() => setIsHot(false))} />}
                {keyword && <FilterChip label={`"${keyword}"`} onRemove={() => { setKeyword(''); setPage(1); }} />}
              </div>
            )}

            {viewMode === 'map' && (
              mapLoading ? (
                <div
                  className="h-[70vh] min-h-[420px] max-h-[680px] rounded-2xl border border-gray-100 bg-gray-100 animate-pulse"
                  data-testid="property-map-loading"
                  aria-label="Đang tải dữ liệu bản đồ"
                />
              ) : mapError ? (
                <div
                  className="rounded-2xl border border-red-100 bg-white px-6 py-10 text-center shadow-sm"
                  data-testid="property-map-error"
                  role="alert"
                >
                  <p className="font-bold text-gray-900">Không thể tải bản đồ bất động sản</p>
                  <p className="mt-2 text-sm text-gray-500">Dữ liệu bản đồ đang tạm thời gián đoạn. Vui lòng thử lại.</p>
                  <button
                    type="button"
                    onClick={() => void retryMap()}
                    className="mt-4 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700"
                  >
                    Thử lại
                  </button>
                </div>
              ) : (
                <>
                  {/* Khung bản đồ chiều cao responsive — panel sản phẩm phủ góc phải (desktop) */}
                  <div className="relative isolate h-[70vh] min-h-[420px] max-h-[680px]" data-testid="property-map-ready">
                    <PropertyMap
                      properties={visibleMapProperties}
                      onNavigate={onNavigate}
                      height="100%"
                      onBoundsChange={handleBoundsChange}
                      showCountBadge={false}
                      fitToMarkers
                      getGroupKey={localityScope ? localityGroupKey : undefined}
                      selectedGroupKey={localityScope ? selectedGroupKey : undefined}
                      focusGroupKey={localityScope ? focusGroupKey : undefined}
                      selectedGeo={localityScope ? selectedGeo : undefined}
                      selectedGeoPending={Boolean(localityScope && selectedGeoEntityId && selectedGeoPending)}
                      onFocusComplete={completeMapFocus}
                    />

                    {/* Generic map keeps its result rail; locality already has a dedicated group/results column. */}
                    {!localityScope && <div className="hidden lg:flex absolute top-3 right-3 bottom-3 w-72 z-10 flex-col rounded-2xl bg-white/95 backdrop-blur-sm shadow-xl border border-gray-100 overflow-hidden">
                      <div className="px-3 py-2.5 border-b border-gray-100 flex-shrink-0">
                        <p className="text-xs font-bold text-gray-900">Tin trong khung nhìn</p>
                        <p className="text-[11px] text-gray-500 mt-0.5">{viewportProps.length} tin đăng đang hiển thị</p>
                      </div>
                      {viewportProps.length > 0 ? (
                        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
                          {viewportProps.map((p, index) => (
                            <MapResultCard key={p.id} property={p}
                              onResultClick={() => trackResultClick(index + 1, 'map')}
                              onNavigate={onNavigate} />
                          ))}
                        </div>
                      ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
                          <MapPin className="w-8 h-8 text-gray-200 mb-2" />
                          <p className="text-xs text-gray-500 font-medium">Chưa có tin trong khu vực này</p>
                          <p className="text-[11px] text-gray-400 mt-1">Thu nhỏ hoặc di chuyển bản đồ để xem thêm</p>
                        </div>
                      )}
                    </div>}
                  </div>

                  {/* Danh sách theo khung nhìn — mobile hiển thị dưới bản đồ */}
                  {!localityScope && <div className="lg:hidden mt-3">
                    <p className="text-xs font-semibold text-gray-500 mb-2">
                      {viewportProps.length} tin đăng trong khung nhìn
                    </p>
                    {viewportProps.length > 0 ? (
                      <div className="space-y-2">
                        {viewportProps.map((p, index) => (
                          <MapResultCard key={p.id} property={p}
                            onResultClick={() => trackResultClick(index + 1, 'map')}
                            onNavigate={onNavigate} />
                        ))}
                      </div>
                    ) : (
                      <div className="bg-white border border-gray-100 rounded-xl py-6 text-center">
                        <p className="text-xs text-gray-500 font-medium">Chưa có tin trong khu vực này</p>
                        <p className="text-[11px] text-gray-400 mt-1">Thu nhỏ hoặc di chuyển bản đồ để xem thêm</p>
                      </div>
                    )}
                  </div>}
                </>
              )
            )}

            {localityScope && viewMode === 'map' && (
              <div className="mt-4 xl:hidden">
                {localityPanel}
              </div>
            )}

            {/* H2 mô tả tập kết quả — sr-only vì số lượng đã hiện ở thanh trên,
                nhưng crawler cần một heading cấp 2 cho khối danh sách. */}
            {viewMode !== 'map' && (
              <h2 className="sr-only">Danh sách {heading.toLocaleLowerCase('vi-VN')}</h2>
            )}

            {viewMode !== 'map' && listingsError && !localityScope ? (
              <div className="rounded-2xl border border-red-100 bg-white px-6 py-10 text-center shadow-sm" role="alert">
                <p className="font-bold text-gray-900">Không thể tải danh sách bất động sản</p>
                <p className="mt-2 text-sm text-gray-500">
                  {listingsQueryError instanceof PropertySearchUnavailableError
                    ? listingsQueryError.message
                    : 'Dữ liệu đang tạm thời gián đoạn. Vui lòng thử lại.'}
                </p>
                <button
                  type="button"
                  onClick={() => void retryListings()}
                  className="mt-4 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-red-700"
                >
                  Thử lại
                </button>
              </div>
            ) : viewMode === 'grid' && (
              localityScope ? localityPanel : (
              loading ? (
                <div className={localityScope ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(280px,300px))] lg:justify-center md:gap-4'}>
                  {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-72 rounded-xl border border-gray-100 bg-white animate-pulse" />)}
                </div>
              ) : properties.length === 0 ? (
                <EmptyState
                  onReset={clearSearchAndFilters}
                  listingType={listingType}
                  hasKeyword={Boolean(debouncedKeyword.trim())}
                  resultSummary={resultSummary}
                />
              ) : (
                <div className={localityScope ? 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(auto-fill,minmax(280px,300px))] lg:justify-center md:gap-4'} data-testid="listings-grid">
                  {properties.map((p, index) => (
                    <GridCard key={p.id} property={p}
                      onResultClick={() => trackResultClick((page - 1) * PER_PAGE + index + 1, 'grid')}
                      isFavorited={favoriteIds.has(p.id)}
                      onToggleFavorite={() => favMutation.mutate(p)}
                      onContact={() => setContactProp(p)} />
                  ))}
                </div>
              )
              )
            )}

            {!listingsError && viewMode === 'list' && (
              localityScope ? localityPanel : (
                loading ? (
                  <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="bg-white rounded-xl h-28 animate-pulse border border-gray-100" />)}</div>
                ) : properties.length === 0 ? (
                  <EmptyState
                    onReset={clearSearchAndFilters}
                    listingType={listingType}
                    hasKeyword={Boolean(debouncedKeyword.trim())}
                    resultSummary={resultSummary}
                  />
                ) : (
                  <div className="space-y-3" data-testid="listings-list">
                    {properties.map((p, index) => (
                      <ListCard key={p.id} property={p}
                        onResultClick={() => trackResultClick((page - 1) * PER_PAGE + index + 1, 'list')}
                        isFavorited={favoriteIds.has(p.id)}
                        onToggleFavorite={() => favMutation.mutate(p)}
                        onContact={() => setContactProp(p)} />
                    ))}
                  </div>
                )
              )
            )}

            {/* Tải thêm: nối trang kế vào danh sách. Nút luôn hiển thị (fallback khi
                IntersectionObserver không chạy/JS chậm); sentinel chỉ tự bấm hộ. */}
            {!listingsError && !localityScope && viewMode !== 'map' && hasNextPage && (
              <div className="mt-8 flex flex-col items-center gap-2">
                <div ref={loadMoreRef} aria-hidden className="h-px w-full" />
                <button onClick={() => fetchNextPage()} disabled={isFetchingNextPage}
                  className="rounded-xl border border-gray-200 bg-white px-5 py-2.5 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60">
                  {isFetchingNextPage ? 'Đang tải...' : 'Tải thêm'}
                </button>
                <p className="text-xs text-gray-400">Đã xem {properties.length}/{total} bất động sản</p>
              </div>
            )}

            {/* Pagination */}
            {!listingsError && !localityScope && viewMode !== 'map' && totalPages > 1 && (
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

            {!localityScope && viewMode !== 'map' && properties.length > 0 && (
              <section className="mt-10 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5" aria-labelledby="continue-discovery-heading">
                <DiscoverySectionHeader
                  headingId="continue-discovery-heading"
                  eyebrow="Khám phá tiếp"
                  title="Mở rộng lựa chọn của bạn"
                  subtitle={hasActiveFilters ? 'Giữ nguyên bộ lọc hiện tại và xem thêm gợi ý phù hợp.' : 'Bắt đầu từ một khu vực hoặc nhu cầu để tìm đúng tin đăng hơn.'}
                  href={pageToHref({ name: 'regions' })}
                  linkLabel="Xem khu vực"
                />
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {areas.slice(0, 6).map(area => (
                    <Link
                      key={area.id}
                      href={pageToHref({ name: 'listings', areaId: area.id, listingType: listingType || undefined })}
                      className="flex min-w-[9.5rem] shrink-0 flex-col rounded-xl border border-gray-100 bg-gray-50 px-3 py-3 transition-colors hover:border-red-200 hover:bg-red-50"
                    >
                      <span className="text-sm font-bold text-gray-900">{area.name}</span>
                      <span className="mt-1 text-xs text-gray-500">Tin đang hoạt động</span>
                    </Link>
                  ))}
                </div>
              </section>
            )}

            {!localityScope && viewMode !== 'map' && (
              <ForYou surface="listings" source="listings_after_results" />
            )}
            {!localityScope && viewMode !== 'map' && (
              <RecentlyViewed
                title="Xem lại tin đã quan tâm"
                subtitle="Tiếp tục từ những bất động sản bạn đã mở gần đây."
                surface="listings"
                source="listings_continue_browsing"
              />
            )}
          </div>
          {localityScope && desktopMapRail && viewMode !== 'map' && (
            <aside className="hidden min-w-0 xl:sticky xl:top-[calc(var(--cnv-header-height)+5.5rem)] xl:block" aria-label="Bản đồ tin đăng">
              <div className={`${localityStyles.listingSurface} isolate overflow-hidden`} data-testid="locality-map-rail">
                <div className="border-b border-stone-200 bg-white px-4 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-700">Bản đồ khu vực</p>
                  <p className="mt-1 text-sm font-semibold text-slate-900">Vị trí tin đăng</p>
                </div>
                {mapLoading ? <div className="h-[calc(100vh-13rem)] min-h-[32rem] max-h-[45rem] animate-pulse bg-slate-100" aria-label="Đang tải dữ liệu bản đồ" />
                  : mapError ? <div className="flex min-h-[32rem] items-center justify-center px-5 text-center text-sm text-slate-500">Không thể tải bản đồ bất động sản.</div>
                    : <div className="relative isolate h-[calc(100vh-13rem)] min-h-[32rem] max-h-[45rem]">
                      <PropertyMap properties={visibleMapProperties} onNavigate={onNavigate} height="100%" onBoundsChange={handleBoundsChange} showCountBadge={false} fitToMarkers getGroupKey={localityGroupKey} selectedGroupKey={selectedGroupKey} focusGroupKey={focusGroupKey} selectedGeo={selectedGeo} selectedGeoPending={Boolean(selectedGeoEntityId && selectedGeoPending)} onFocusComplete={completeMapFocus} />
                    </div>}
              </div>
            </aside>
          )}
        </div>
      </div>

      {/* Mobile filter drawer */}
      {mobileFilter && (
        <div id="mobile-listing-filters" role="dialog" aria-modal="true" aria-label="Bộ lọc nâng cao" className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileFilter(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-white pb-[env(safe-area-inset-bottom)] sm:inset-y-0 sm:left-auto sm:right-0 sm:max-h-none sm:w-[min(22rem,calc(100vw-1rem))] sm:rounded-none">
            <div className="flex items-center justify-between p-4 border-b border-gray-100 sticky top-0 bg-white z-10">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-red-500" />Bộ lọc nâng cao
              </h3>
              <button type="button" onClick={() => setMobileFilter(false)} aria-label="Đóng bộ lọc nâng cao" className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-red-200"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 text-[14px] sm:text-sm"><FilterPanel /></div>
            <div className="p-4 border-t border-gray-100 sticky bottom-0 bg-white">
              <button onClick={() => setMobileFilter(false)} className="w-full bg-red-600 text-white font-bold py-3 rounded-xl text-sm">
                Xem {total.toLocaleString('vi-VN')} kết quả
              </button>
            </div>
          </div>
        </div>
      )}

      <PropertyQuickViewDrawer
        property={quickViewProperty}
        onClose={() => setQuickViewProperty(null)}
        onContact={property => { setQuickViewProperty(null); setContactProp(property); }}
      />
      <ContactModal property={contactProp} onClose={() => setContactProp(null)}
        onSubmitted={() => { if (contactProp) captureSignalFromProperty('contact', contactProp); }} />
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

function EmptyState({
  onReset,
  listingType,
  hasKeyword,
  resultSummary,
}: {
  onReset: () => void;
  listingType: ListingTypeKey;
  hasKeyword: boolean;
  resultSummary: string;
}) {
  const resetLabel = hasKeyword ? 'Xóa từ khóa và bộ lọc' : 'Xóa tất cả bộ lọc';
  return (
    <div className="border-y border-stone-200 bg-white px-4 py-20 text-center" data-testid="listings-empty-state">
      <Building2 className="w-14 h-14 text-gray-200 mx-auto mb-3" />
      <p className="text-gray-600 font-semibold">Chưa tìm thấy {resultSummary} phù hợp</p>
      <p className="text-gray-400 text-sm mt-1">{listingEmptyStateGuidance(listingType)}</p>
      <button onClick={onReset} className="mt-4 text-red-600 text-sm hover:underline font-medium">{resetLabel}</button>
    </div>
  );
}

// Wrapper giữ nguyên callback/tracking của trang danh sách, phần hiển thị dùng chung
// PropertyCard. CompareButton đặt đúng chỗ theo từng variant: overlay trên ảnh (grid),
// inline ở footer (list) — nhờ mediaActions/extraActions của component dùng chung.
function LocalityGroupResults({ groups, loading, error, total, selectedGroupKey, groupLabel, onSelectGroup }: { groups: LocalityGroup[]; loading: boolean; error: boolean; total: number; selectedGroupKey: string | null; groupLabel: string; onSelectGroup: (groupKey: string | null) => void }) {
  if (loading) return <div className={localityStyles.groupResults} data-testid="locality-group-results"><div className="h-8 animate-pulse rounded bg-slate-100" /><div className="mt-3 space-y-2">{Array.from({ length: 4 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-lg bg-slate-100" />)}</div></div>;
  if (error) return <div className={localityStyles.groupResults} data-testid="locality-group-results"><p className="py-12 text-center text-sm text-red-600">Không thể tải nhóm tin trên bản đồ.</p></div>;
  if (!groups.length) return <div className={localityStyles.groupResults} data-testid="locality-group-results"><p className="py-12 text-center text-sm text-slate-500">Chưa có tin có tọa độ trong phạm vi này.</p></div>;
  return <section className={localityStyles.groupResults} data-testid="locality-group-results" aria-labelledby="locality-group-results-title">
    <div className={localityStyles.groupHeader}>
      <div><h3 id="locality-group-results-title">{groupLabel} ({groups.length})</h3><p>{total.toLocaleString('vi-VN')} tin trên bản đồ</p></div>
    </div>
    <p className={localityStyles.groupHint}>Chọn một nhóm để thu bản đồ về đúng khu vực và làm nổi bật các tin cùng nhóm.</p>
    <div className={localityStyles.groupList}>
      {groups.map(group => <button key={group.key} type="button" onClick={() => onSelectGroup(group.key)} className={`${localityStyles.groupRow} ${selectedGroupKey === group.key ? localityStyles.groupRowSelected : ''}`} aria-pressed={selectedGroupKey === group.key}>
        <span className={localityStyles.groupCount}>{group.count}</span>
        <span className="min-w-0 text-left"><strong>{group.label}</strong><small>{group.count} tin trong nhóm</small></span>
      </button>)}
    </div>
  </section>;
}

function GridCard({ property: p, onContact, onResultClick, isFavorited = false, onToggleFavorite }: { property: Property; onContact: () => void; onResultClick: () => void; isFavorited?: boolean; onToggleFavorite?: () => void }) {
  return (
    <UnifiedPropertyCard
      property={p}
      href={buildPropertyPath(p)}
      variant="grid"
      onResultClick={onResultClick}
      onContact={onContact}
      isFavorited={isFavorited}
      onToggleFavorite={onToggleFavorite}
      mediaActions={<CompareButton property={p} variant="overlay" />}
    />
  );
}

function MapResultCard({ property, onResultClick, onNavigate }: { property: Property; onResultClick: () => void; onNavigate: (page: Page) => void }) {
  return <UnifiedPropertyCard property={property} variant="compact"
    onResultClick={event => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      onResultClick();
      onNavigate({ name: 'property', id: property.id, slug: property.slug ?? undefined });
      scrollTop();
    }} />;
}

function ListCard({ property: p, onContact, onResultClick, isFavorited = false, onToggleFavorite }: { property: Property; onContact: () => void; onResultClick: () => void; isFavorited?: boolean; onToggleFavorite?: () => void }) {
  return (
    <UnifiedPropertyCard
      property={p}
      href={buildPropertyPath(p)}
      variant="list"
      onResultClick={onResultClick}
      onContact={onContact}
      isFavorited={isFavorited}
      onToggleFavorite={onToggleFavorite}
      extraActions={<CompareButton property={p} variant="inline" />}
    />
  );
}