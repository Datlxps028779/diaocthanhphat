'use client';
import { useState, useEffect, useMemo, useRef } from 'react';
import { SafeImage } from '../components/SafeImage';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MapPin, Phone, CheckCircle, Heart, Shield,
  Maximize2, FileText, Clock, Eye, ChevronRight,
  Building2, ArrowLeft, Home, Bed, Bath, Compass,
  ChevronLeft, ChevronRight as ChevRight,
  Navigation, ExternalLink, CalendarClock, Tag,
  ShieldCheck, FileCheck, Image as ImageIcon
} from 'lucide-react';
import { getPropertyByIdOrSlug, getPropertyPanoramas, getRelatedProperties, getPublicPropertyAgent, submitLead, incrementPropertyView, buildPropertyPath, getFavoriteIds, toggleFavorite, getPriceStats } from '../lib/api';
import { track, EVENTS } from '../lib/analytics';
import { isValidVnPhone } from '../lib/phone';
import type { Property } from '../lib/supabase';
import { captureSignalFromProperty } from '../lib/captureSignal';
import { qk } from '../lib/queryKeys';
import Link from 'next/link';
import { type Page, pageToHref } from '../lib/router';
import { useAreas, useDistricts, useNeighborhoods, usePropertyTypes } from '../lib/hooks/useTaxonomy';
import { Breadcrumb } from '../components/Layout';
import { ContactModal } from '../components/ContactModal';
import { PhoneRevealModal } from '../components/PhoneRevealModal';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { NearbyPoi } from '../components/NearbyPoi';
import { buildTrustSignals, type TrustIcon } from '../lib/trustSignals';
import { LoanCalculator } from '../components/LoanCalculator';
import { ForYou } from '../components/ForYou';
import { recordRecentlyViewed } from '../lib/recentlyViewed';
import { VrTourSection } from '../components/VrTourSection';
import { useSetting } from '../lib/cms';
import { buildPropertyGallery, buildPropertyImageAlt, FALLBACK_PROPERTY_IMAGE } from '../lib/propertyImages';
import { formatPricePerSqm, formatUpdateDate, PRICE_DISCLAIMER } from '../lib/priceStatsFormat';
import { formatPropertyPrice, formatFinancingAmount, subtractListingPriceValues } from '../lib/listingPrice';
import { formatPropertyPricePerSqm } from '../lib/propertyCardModel';
import { buildPropertyFaq } from '../lib/propertyFaq';
import { sanitizeArticleHtml } from '../lib/sanitizeHtml';
import { isHtmlContent } from '../lib/markdown';
import { leadActionFeedback, canUseDetailInteraction } from '../lib/propertyDetailActions';
import { DetailShareButtons } from '../components/DetailShareButtons';
import { MapInteractionGate } from '../components/MapInteractionGate';
import { getProductSuggestions } from '../lib/productSuggestions';
import { normalizeListingTitle } from '../lib/listingTitle';
import { buildSimilarFilters } from '../lib/similarFilters';
import { RichVideo } from '../components/RichVideo';
import { ReadableContent } from '../components/ReadableContent';
import { parseLegacyPropertyVideo, splitRichContentVideos } from '../lib/videoMedia';
import { mergeDiscoveryFilters } from '../lib/discoveryJourney';
import { buildPropertyDetailContinuationTargets } from '../lib/propertyDetailContinuation';
import { agentProfilePath } from '../lib/agentProfileSeo';
import type { PropertyPanorama } from '../lib/supabase';
import { Panorama360Section } from '../components/Panorama360Section';
import { LocalitySubnavForArea } from '../components/area/LocalityPageContent';

interface PropertyDetailPageProps {
  propertyId?: string;
  onNavigate: (p: Page) => void;
  initialData?: Property | null;
  initialPanoramas?: PropertyPanorama[];
  // Chế độ xem trước từ form đăng/sửa tin: dựng từ initialData, KHÔNG gọi network
  // chính và KHÔNG bắn side-effect thật (view/taste/lead/favorite/related).
  preview?: boolean;
}

export function PropertyDetailPage({ propertyId = '', onNavigate, initialData, initialPanoramas, preview = false }: PropertyDetailPageProps) {
  const [showContact, setShowContact] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', message: '', budget: '' });
  const [formSent, setFormSent] = useState(false);
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const [phoneRevealOpen, setPhoneRevealOpen] = useState(false);
  const [revealedPhone, setRevealedPhone] = useState<string | null>(null);
  const responseTime = useSetting('lead_response_time', '30 phút');

  // initialData từ server (RSC prefetch) → crawler & first paint có ngay dữ liệu,
  // không nhấp nháy loading. SEO (title/meta/JSON-LD) do generateMetadata + page.tsx lo.
  const { data: queryProperty = null, isLoading: loadingQuery } = useQuery({
    queryKey: qk.property(propertyId),
    queryFn: () => getPropertyByIdOrSlug(propertyId),
    enabled: !!propertyId && !preview,
    initialData: preview ? undefined : (initialData ?? undefined),
  });
  // Preview đọc thẳng từ initialData (bỏ qua cache dùng chung key rỗng để mỗi lần
  // xem trước luôn phản ánh đúng form hiện tại); không loading.
  const property = preview ? (initialData ?? null) : queryProperty;
  const { data: queryPanoramas = [] } = useQuery({
    queryKey: ['property-panoramas', property?.id],
    queryFn: () => getPropertyPanoramas(property!.id),
    enabled: !!property?.id && !preview && initialPanoramas === undefined,
    initialData: preview ? undefined : initialPanoramas,
    staleTime: 60_000,
  });
  const panoramas = preview ? (initialPanoramas ?? property?.panoramas ?? []) : queryPanoramas;
  const listingTitle = property ? normalizeListingTitle(property.title).value : '';
  const loading = preview ? false : loadingQuery;
  const { data: publicAgent = null } = useQuery({
    queryKey: ['public-property-agent', property?.id],
    queryFn: () => getPublicPropertyAgent(property!.id),
    enabled: !!property?.id && !preview,
    retry: false,
  });

  // Khu dân cư của tin (nếu có) → link tới Entity Page (internal link mục 8 doc).
  const { data: allNeighborhoods = [] } = useNeighborhoods();
  const neighborhood = property?.neighborhood_slug
    ? allNeighborhoods.find(n => n.slug === property.neighborhood_slug) ?? null
    : null;
  const { data: areas = [] } = useAreas();
  const { data: districts = [] } = useDistricts();
  const { data: propertyTypes = [] } = usePropertyTypes();
  const { data: areaPriceStats = [] } = useQuery({
    queryKey: ['property-area-price-stats', property?.areas?.slug, property?.listing_type],
    queryFn: () => getPriceStats('area', property!.areas!.slug!),
    enabled: !!property?.areas?.slug && !preview,
    staleTime: 5 * 60_000,
  });
  const areaPriceStat = areaPriceStats.find(stat =>
    stat.listing_type === property?.listing_type && stat.property_type_id === null && stat.sample_count >= 3 && stat.median_price_per_sqm != null,
  ) ?? null;

  // Lightbox: Esc đóng, ←/→ chuyển ảnh, khóa cuộn nền khi mở. Đặt trước early-return
  // để giữ đúng thứ tự hooks.
  useEffect(() => {
    if (!lightboxOpen || !property) return;
    const imgs = [property.image_url, ...(property.images ?? [])].filter(Boolean) as string[];
    const n = imgs.length || 1;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxOpen(false);
      else if (e.key === 'ArrowLeft') setActiveImg(i => (i - 1 + n) % n);
      else if (e.key === 'ArrowRight') setActiveImg(i => (i + 1) % n);
    };
    window.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightboxOpen, property]);

  const { data: related = [] } = useQuery({
    queryKey: qk.relatedProperties(propertyId),
    queryFn: () => getRelatedProperties(property!),
    enabled: !!property && !preview,
  });

  // Chip lọc nhanh sinh từ chính thuộc tính tin đang xem (quận, tầm giá, diện
  // tích, phòng ngủ, pháp lý). Chiều nào tin không có thì không sinh chip.
  const similarFilters = useMemo(() => (property ? buildSimilarFilters(property) : []), [property]);
  // Có taxonomy thì chip sinh path SEO (/mua-ban/binh-duong/thuan-an) thay query UUID.
  const hrefTaxonomy = useMemo(() => ({ areas, districts, propertyTypes }), [areas, districts, propertyTypes]);

  // Yêu thích: persist thật qua Supabase (dùng chung logic với card ở list/home),
  // trước đây chỉ là state cục bộ nên tim bấm xong mất khi rời trang.
  const queryClient = useQueryClient();
  const { data: favIds = [] } = useQuery({ queryKey: qk.favoriteIds(), queryFn: getFavoriteIds, enabled: !preview });
  const liked = !!property && favIds.includes(property.id);
  const favMutation = useMutation({
    mutationFn: (id: string) => toggleFavorite(id),
    onSuccess: (favorited) => {
      queryClient.invalidateQueries({ queryKey: qk.favoriteIds() });
      // Chỉ ghi tín hiệu khi vừa BẬT yêu thích (true) — bỏ tim không phải ý định.
      if (favorited && property) {
        captureSignalFromProperty('favorite', property);
        track(EVENTS.LISTING_SAVE, { listingId: property.id, source: 'property_detail' });
      }
    },
  });

  // Tăng view tách khỏi fetcher: bắn đúng 1 lần mỗi lần mở trang, theo UUID thật
  // (property.id), không phụ thuộc cache/refetch của React Query.
  const viewedRef = useRef<string | null>(null);
  const viewMutation = useMutation({ mutationFn: (id: string) => incrementPropertyView(id) });
  useEffect(() => {
    if (preview) return;
    if (property?.id && viewedRef.current !== property.id) {
      viewedRef.current = property.id;
      viewMutation.mutate(property.id);
      track(EVENTS.LISTING_VIEW, { listingId: property.id, source: 'property_detail' });
      recordRecentlyViewed(property);
      captureSignalFromProperty('view', property);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id]);

  const submitMutation = useMutation({
    mutationFn: () => submitLead({
      full_name: form.name,
      phone: form.phone,
      message: form.message,
      property_id: property?.id,
      property_title: property?.title,
      budget: form.budget || undefined,
      source: 'property_detail_form',
    }),
    onSuccess: () => {
      track(EVENTS.LEAD_SUBMIT, { listingId: property?.id ?? '', source: 'property_detail_form', hasBudget: !!form.budget });
      if (property) captureSignalFromProperty('contact', property);
      setFormSent(true);
    },
  });
  const formLoading = submitMutation.isPending;
  const formFeedback = leadActionFeedback(
    submitMutation.isError ? 'error' : formSent ? 'success' : submitMutation.isPending ? 'pending' : 'idle',
  );

  const handleContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!canUseDetailInteraction(preview, 'contact')) return;
    if (!form.name || !isValidVnPhone(form.phone)) return;
    submitMutation.mutate();
  };

  const openContact = () => {
    setShowContact(true);
  };

  const revealPhone = () => {
    if (!canUseDetailInteraction(preview, 'phone_reveal')) return;
    setPhoneRevealOpen(true);
  };

  const handlePhoneRevealed = (result: { revealed_phone: string; recorded: boolean }) => {
    setRevealedPhone(result.revealed_phone);
    setPhoneRevealed(true);
    setPhoneRevealOpen(false);
    if (result.recorded) {
      track(EVENTS.PHONE_REVEAL, {
        listingId: property?.id ?? '',
        source: 'property_detail',
        recorded: true,
      });
    }
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  if (!property) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Building2 className="w-16 h-16 text-gray-200" />
      <p className="text-gray-500 font-medium">Không tìm thấy bất động sản này.</p>
      <Link href={pageToHref({ name: 'listings' })} className="text-red-600 hover:underline text-sm font-medium flex items-center gap-1">
        <ArrowLeft className="w-4 h-4" />Quay lại danh sách
      </Link>
    </div>
  );

  const allImages = buildPropertyGallery(property.image_url, property.images);
  // Ưu tiên FAQ nhập tay; nếu chưa có thì tự-sinh từ dữ liệu thật.
  const faq = property.faq && property.faq.length > 0 ? property.faq : buildPropertyFaq(property);

  // Đơn vị và dấu "≈" do formatter dùng chung quyết định — không lặp lại ở nơi render.
  const pricePerSqm = formatPropertyPricePerSqm(property);

  // Answer Block (AIO): câu tóm tắt trực tiếp từ dữ liệu thật, chỉ ghép field có giá trị.
  const answerText = (() => {
    const typeLabel = property.property_types?.name?.trim() || 'Bất động sản';
    const verb = property.listing_type === 'cho_thue' ? 'cho thuê' : 'bán';
    const loc = [property.ward, property.district, property.city].map(s => s?.trim()).filter(Boolean).join(', ');
    const priceStr = formatPropertyPrice(property);
    const parts = [
      `${typeLabel} đang ${verb}${loc ? ` tại ${loc}` : ''}`,
      priceStr ? `giá ${priceStr}` : '',
      property.area_sqm ? `diện tích ${property.area_sqm}m²` : '',
      property.bedrooms ? `${property.bedrooms} phòng ngủ` : '',
      property.legal_status?.trim() ? `pháp lý ${property.legal_status.trim()}` : '',
    ].filter(Boolean);
    return parts.length > 1 ? parts.join(', ') + '.' : '';
  })();
  const postedDate = formatUpdateDate(property.created_at);
  const modifiedDate = formatUpdateDate(property.updated_at);
  const showModified = modifiedDate && modifiedDate !== postedDate;

  const contactPhone = revealedPhone ?? '';
  const publicAgentProfileHref = publicAgent?.slug ? agentProfilePath(publicAgent.slug) : null;
  const publicAgentName = publicAgent?.display_name ?? property.contact_name ?? 'Người đăng tin';
  const publicAgentVisual = publicAgent?.avatar_url ? (
    <SafeImage
      src={publicAgent.avatar_url}
      alt={publicAgentName}
      width={48}
      height={48}
      className="h-12 w-12 flex-shrink-0 rounded-full object-cover ring-2 ring-white"
    />
  ) : (
    <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-red-100 ring-2 ring-white">
      <span className="text-lg font-black text-red-600">{publicAgentName.charAt(0).toUpperCase()}</span>
    </div>
  );
  const hasCoords = property.latitude && property.longitude;
  const gmapsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${property.latitude},${property.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([property.address, property.district, property.city].filter(Boolean).join(', '))}`;

  const productSuggestions = getProductSuggestions(property);
  const exploreFilters = mergeDiscoveryFilters(
    similarFilters.map(filter => ({ label: filter.label, page: filter.page })),
    productSuggestions.map(suggestion => ({
      label: suggestion.label,
      page: { name: 'listings' as const, ...suggestion.filters },
    })),
  );
  const continuationTargets = buildPropertyDetailContinuationTargets({
    property,
    taxonomy: hrefTaxonomy,
    pageToHref,
    neighborhood,
    relatedCount: related.length,
  });
  const allRelatedInSameDistrict = Boolean(property.area_id && property.district?.trim()) && related.length > 0 && related.every(item => (
    item.area_id === property.area_id && item.district?.trim() === property.district?.trim()
  ));
  const detailListingHref = pageToHref({
    name: 'listings',
    listingType: property.listing_type,
    areaId: property.area_id ?? undefined,
    district: property.district ?? undefined,
  }, hrefTaxonomy);
  const relatedListingHref = pageToHref({
    name: 'listings',
    listingType: property.listing_type,
    areaId: property.area_id ?? undefined,
    district: allRelatedInSameDistrict ? property.district ?? undefined : undefined,
    typeId: property.property_type_id ?? undefined,
  }, hrefTaxonomy);

  const listingStatus = property.is_active
    ? property.listing_type === 'cho_thue' ? 'Đang cho thuê' : 'Đang giao bán'
    : 'Tạm ẩn';
  const publicKeywords = [...new Set([
    ...(property.tags ?? []),
    ...(property.focus_keywords ?? '').split(','),
  ].map(keyword => keyword.trim()).filter(Boolean))].slice(0, 12);

  const attrs = [
    property.area_sqm && { icon: <Maximize2 className="w-4 h-4 text-red-500" />, label: 'Diện tích', value: `${property.area_sqm} m²` },
    property.bedrooms && { icon: <Bed className="w-4 h-4 text-red-500" />, label: 'Phòng ngủ', value: `${property.bedrooms} phòng` },
    property.bathrooms && { icon: <Bath className="w-4 h-4 text-red-500" />, label: 'Phòng tắm', value: `${property.bathrooms} phòng` },
    property.direction && { icon: <Compass className="w-4 h-4 text-red-500" />, label: 'Hướng nhà', value: property.direction },
    property.road_width && { icon: <Building2 className="w-4 h-4 text-red-500" />, label: 'Đường rộng', value: `${property.road_width} m` },
    property.frontage && { icon: <Maximize2 className="w-4 h-4 text-red-500" />, label: 'Mặt tiền', value: `${property.frontage} m` },
    property.floor_count && { icon: <Home className="w-4 h-4 text-red-500" />, label: 'Số tầng', value: `${property.floor_count} tầng` },
    property.legal_status && { icon: <FileText className="w-4 h-4 text-red-500" />, label: 'Pháp lý', value: property.legal_status },
    { icon: <Clock className="w-4 h-4 text-red-500" />, label: 'Ngày đăng', value: new Date(property.created_at).toLocaleDateString('vi-VN') },
    { icon: <Eye className="w-4 h-4 text-red-500" />, label: 'Lượt xem', value: String(property.views ?? 0) },
  ].filter(Boolean) as { icon: React.ReactNode; label: string; value: string }[];

  return (
    <main id="main-content">
      <div className="detail-page min-h-screen bg-gray-50 pb-24 lg:pb-0">

      {preview && (
        <div className="bg-amber-500 text-white text-sm font-semibold px-4 py-2.5 text-center flex items-center justify-center gap-2">
          <Eye className="w-4 h-4" />
          Bản xem trước — tin chưa công khai. Kiểm tra kỹ trước khi xuất bản.
        </div>
      )}

      {property.areas?.slug && (
        <LocalitySubnavForArea
          area={{ name: property.areas.name, slug: property.areas.slug }}
          areaOptions={areas.map(area => ({ name: area.name, slug: area.slug }))}
          currentPath={buildPropertyPath(property)}
          listingPath={detailListingHref}
          newsPath={`/khu-vuc/${property.areas.slug}/tin-tuc`}
          activeSection="listings"
        />
      )}

      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <Breadcrumb items={[
            { label: 'Trang chủ', onClick: () => onNavigate({ name: 'home' }) },
            { label: 'Danh sách', href: detailListingHref },
            { label: property.title },
          ]} />
        </div>
      </div>

      <section className="detail-hero max-w-7xl mx-auto px-4 py-5" aria-labelledby="property-hero-title">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 id="property-hero-title" className="text-2xl font-black leading-tight tracking-tight text-gray-900 sm:text-3xl">{listingTitle}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-gray-500">
              <span className="detail-status-pill">● {listingStatus}</span>
              <MapPin className="h-4 w-4 text-gray-400" />
              <span>{[property.address, property.district, property.city].filter(Boolean).join(', ')}</span>
            </div>
          </div>
          <div className="hidden shrink-0 items-center gap-4 sm:flex">
            <button onClick={() => !preview && property && favMutation.mutate(property.id)} aria-label={liked ? 'Bỏ yêu thích' : 'Lưu yêu thích'} className="flex h-12 w-12 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition hover:border-red-200 hover:text-red-600">
              <Heart className={`h-5 w-5 ${liked ? 'fill-red-500 text-red-500' : ''}`} />
            </button>
            <div className="text-right">
              <p className="text-2xl font-black tracking-tight text-red-600">{formatPropertyPrice(property)}</p>
              <p className="text-xs text-gray-500">Giá tốt nhất</p>
            </div>
          </div>
        </div>
      </section>

      <div className="max-w-7xl mx-auto px-4 py-5">
        <div className="flex flex-col gap-5 lg:flex-row">
          {/* Main */}
          <div className="flex-1 min-w-0 space-y-4">
            <nav className="detail-media-tabs flex items-end gap-8 overflow-x-auto bg-white px-4 pt-5" aria-label="Điều hướng nội dung tin">
              <a href="#property-media" className="detail-media-tabs__active">Hình ảnh<span>THƯ VIỆN ẢNH</span></a>
              <a href="#property-summary">Thông tin<span>GIÁ & DIỆN TÍCH</span></a>
              <a href="#property-description">Chi tiết<span>MÔ TẢ & TIỆN ÍCH</span></a>
              <a href="#property-location">Vị trí<span>BẢN ĐỒ & LÂN CẬN</span></a>
              <a href="#property-keywords">Từ khóa<span>TAGS LIÊN QUAN</span></a>
            </nav>

            {/* Gallery */}
            <div className="detail-gallery bg-black">
              <div className="detail-gallery-stage relative aspect-video overflow-hidden group/gallery bg-black">
                {/* Track trượt ngang cho slide mượt (translateX theo activeImg) */}
                <div className="flex h-full transition-transform duration-300 ease-out"
                  style={{ transform: `translateX(-${activeImg * 100}%)` }}>
                  {allImages.map((img, i) => (
                    <button key={i} type="button" onClick={() => setLightboxOpen(true)}
                      className="relative flex-shrink-0 w-full h-full cursor-zoom-in"
                      aria-label="Phóng to ảnh">
                      <SafeImage src={img} fallbackSrc={FALLBACK_PROPERTY_IMAGE} alt={buildPropertyImageAlt(property, i)} fill
                        priority={i === 0}
                        sizes="(max-width: 768px) 100vw, 66vw" className="object-contain" />
                    </button>
                  ))}
                </div>
                {allImages.length > 1 && (
                  <div className="absolute inset-0 flex items-center justify-between px-3 pointer-events-none">
                    <button onClick={() => setActiveImg(i => (i - 1 + allImages.length) % allImages.length)}
                      className="pointer-events-auto w-9 h-9 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-colors">
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <button onClick={() => setActiveImg(i => (i + 1) % allImages.length)}
                      className="pointer-events-auto w-9 h-9 bg-black/40 hover:bg-black/60 rounded-full flex items-center justify-center text-white transition-colors">
                      <ChevRight className="w-5 h-5" />
                    </button>
                  </div>
                )}
                {property.badge && (
                  <span className="absolute top-3 left-3 bg-red-500 text-white text-xs font-bold px-3 py-1 rounded">{property.badge}</span>
                )}
                <div className="absolute top-3 right-3">
                  <button onClick={() => !preview && property && favMutation.mutate(property.id)} aria-label={liked ? 'Bỏ yêu thích' : 'Lưu yêu thích'}
                    className="w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow hover:scale-110 transition-transform">
                    <Heart className={`w-4 h-4 ${liked ? 'fill-red-500 text-red-500' : 'text-gray-500'}`} />
                  </button>
                </div>
                {/* Nút phóng to */}
                <button onClick={() => setLightboxOpen(true)} title="Phóng to" aria-label="Phóng to ảnh"
                  className="absolute bottom-2 left-3 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors">
                  <Maximize2 className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => setLightboxOpen(true)} className="absolute right-4 top-4 hidden items-center gap-2 rounded-lg bg-black/55 px-3 py-2 text-xs font-semibold text-white backdrop-blur transition hover:bg-black/75 sm:flex">
                  <Maximize2 className="h-3.5 w-3.5" />Xem tất cả ảnh
                </button>
                <div className="absolute bottom-3 right-3 rounded bg-black/55 px-2 py-1 text-xs text-white">{activeImg + 1}/{allImages.length}</div>
                <div className="detail-gallery-caption absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent px-5 pb-4 pt-12 text-center text-xs font-medium text-white sm:text-sm">
                  {listingTitle}{[property.address, property.district, property.city].filter(Boolean).length > 0 ? ` · ${[property.address, property.district, property.city].filter(Boolean).join(', ')}` : ''}
                </div>
              </div>
              {allImages.length > 1 && (
                <div className="detail-gallery-thumbs flex gap-2 overflow-x-auto bg-black px-3 py-3">
                  {allImages.map((img, i) => (
                    <button key={i} onClick={() => setActiveImg(i)}
                      className={`flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-colors ${activeImg === i ? 'border-red-500' : 'border-transparent'}`}>
                      <img src={img} alt="" className="w-full h-full object-cover"
                        onError={event => {
                          if (event.currentTarget.src !== FALLBACK_PROPERTY_IMAGE) event.currentTarget.src = FALLBACK_PROPERTY_IMAGE;
                        }} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            <section className="detail-summary grid grid-cols-2 gap-6 border-y border-gray-200 bg-white px-4 py-5 sm:grid-cols-3" aria-label="Giá và diện tích">
              <div>
                <p className="text-sm text-gray-500">Mức giá</p>
                <p className="mt-1 text-2xl font-black tracking-tight text-red-600">{formatPropertyPrice(property)}</p>
                {pricePerSqm && <p className="mt-1 text-sm text-gray-500">{pricePerSqm}</p>}
              </div>
              <div>
                <p className="text-sm text-gray-500">Diện tích</p>
                <p className="mt-1 text-2xl font-bold tracking-tight text-gray-900">{property.area_sqm ? `${property.area_sqm} m²` : '—'}</p>
              </div>
            </section>
            {areaPriceStat && (
              <section className="detail-price-context border-y border-gray-100 bg-[#fff8f8] px-4 py-4" aria-label="Giá tham khảo khu vực">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[.12em] text-red-600">Giá tham khảo khu vực {property.areas?.name ?? property.city}</p>
                    <p className="mt-1 text-xs text-gray-500">Dựa trên {areaPriceStat.sample_count} tin đăng thực tế.</p>
                  </div>
                  <p className="text-sm text-gray-500">Cập nhật {formatUpdateDate(areaPriceStat.computed_at)}</p>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-white p-3"><p className="text-[11px] text-gray-500">Thấp nhất</p><p className="mt-1 text-sm font-bold text-gray-900">{formatPricePerSqm(areaPriceStat.min_price_per_sqm)}</p></div>
                  <div className="rounded-lg bg-white p-3"><p className="text-[11px] text-gray-500">Trung vị</p><p className="mt-1 text-sm font-bold text-red-600">{formatPricePerSqm(areaPriceStat.median_price_per_sqm)}</p></div>
                  <div className="rounded-lg bg-white p-3"><p className="text-[11px] text-gray-500">Cao nhất</p><p className="mt-1 text-sm font-bold text-gray-900">{formatPricePerSqm(areaPriceStat.max_price_per_sqm)}</p></div>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-gray-500">{PRICE_DISCLAIMER}</p>
              </section>
            )}
            <nav className="detail-inline-tabs flex items-center gap-5 border-b border-gray-100 bg-white px-4 text-sm font-semibold" aria-label="Tổng quan và tiện ích">
              <a href="#property-description" className="border-b-2 border-red-600 py-4 text-red-600">📋 Tổng quan</a>
              <a href="#property-amenities" className="py-4 text-gray-500 hover:text-red-600">✨ Tiện ích</a>
            </nav>

            {/* Ảnh 360 nội bộ — tách khỏi gallery ảnh phẳng và tour ngoài. */}
            <Panorama360Section panoramas={panoramas} />

            {/* VR Tour */}
            <VrTourSection vrTourUrl={property.vr_tour_url} />

            {/* Video player: URL legacy chỉ được render sau khi parse/allowlist. */}
            {(() => {
              const video = parseLegacyPropertyVideo(property.video_url, `Video: ${property.title}`);
              return video ? <RichVideo video={video} /> : null;
            })()}

            {/* Title & price */}
            <div className="detail-overview-card hidden bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <div className="mb-2"><VerifiedBadge property={property} size="md" /></div>
              <h1 className="text-xl font-black text-gray-900 leading-tight mb-3">{listingTitle}</h1>
              <DetailShareButtons title={listingTitle} canonicalPathname={buildPropertyPath(property)} className="mb-4" />
              <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-2 flex-wrap">
                <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span>{[property.address, property.district, property.city].filter(Boolean).join(', ')}</span>
              </div>
              {(postedDate || showModified) && (
                <p className="text-gray-400 text-xs mb-3">
                  {postedDate && <>Đăng {postedDate}</>}
                  {showModified && <> · Cập nhật {modifiedDate}</>}
                </p>
              )}
              {answerText && (
                <p className="property-answer text-sm leading-6 text-gray-700 bg-gray-50 border border-gray-100 rounded-xl p-3 mb-4">
                  {answerText}
                </p>
              )}
              <div className="flex flex-wrap items-end justify-between gap-4 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Mức giá</p>
                  <p className="text-3xl font-black text-red-600">{formatPropertyPrice(property)}</p>
                  {pricePerSqm && <p className="text-gray-400 text-xs mt-0.5">{pricePerSqm}</p>}
                  {property.listing_type !== 'cho_thue' && property.loan_support != null && property.loan_support > 0 && property.loan_support < property.price && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        Trả trước: {formatFinancingAmount(subtractListingPriceValues(property.price, property.loan_support), property.price_unit)}
                      </span>
                      <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                        Chủ hỗ trợ vay: {formatFinancingAmount(property.loan_support, property.price_unit)}
                      </span>
                    </div>
                  )}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={openContact}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm">
                    <Phone className="w-4 h-4" />Yêu cầu tư vấn
                  </button>
                  {phoneRevealed ? (
                    <a href={`tel:${contactPhone.replace(/\s/g, '')}`}
                      className="flex items-center gap-2 border border-red-500 text-red-600 font-bold px-5 py-2.5 rounded-xl hover:bg-red-50 transition-colors text-sm">
                      <Phone className="w-4 h-4" />{contactPhone}
                    </a>
                  ) : (
                    <button onClick={revealPhone}
                      className="flex items-center gap-2 border border-red-500 text-red-600 font-bold px-5 py-2.5 rounded-xl hover:bg-red-50 transition-colors text-sm">
                      <Phone className="w-4 h-4" />Bấm để hiện số
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Attributes */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-bold text-gray-900 text-base mb-4 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-red-500" />Thông tin chi tiết
              </h2>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {attrs.map(a => (
                  <div key={a.label} className="bg-gray-50 rounded-xl p-3">
                    <div className="flex items-center gap-1.5 mb-1">{a.icon}<span className="text-xs text-gray-500">{a.label}</span></div>
                    <p className="text-sm font-semibold text-gray-900">{a.value}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Description */}
            {property.description && (
              <div id="property-description" className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h2 className="font-bold text-gray-900 text-base mb-3">Mô tả chi tiết</h2>
                <ReadableContent className="max-w-none">
                  {isHtmlContent(property.description) ? (
                    splitRichContentVideos(sanitizeArticleHtml(property.description)).map((segment, index) =>
                      segment.type === 'video' ? (
                        <RichVideo key={`video-${index}`} video={segment.video} />
                      ) : segment.html.trim() ? (
                        <div key={`html-${index}`} dangerouslySetInnerHTML={{ __html: segment.html }} />
                      ) : null,
                    )
                  ) : (
                    <p className="whitespace-pre-line">{property.description}</p>
                  )}
                </ReadableContent>
              </div>
            )}

            {/* FAQ — tự sinh từ dữ liệu thật (giá/vị trí/diện tích/pháp lý/hướng).
                Khớp 1:1 với FAQPage JSON-LD ở page.tsx (chuẩn Google/AEO). */}
            {faq.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h2 className="font-bold text-gray-900 text-base mb-3">Câu hỏi thường gặp</h2>
                <div className="divide-y divide-gray-100">
                  {faq.map((item, i) => (
                    <details key={i} className="group py-3 first:pt-0 last:pb-0">
                      <summary className="cursor-pointer list-none flex items-center justify-between gap-2 text-sm font-semibold text-gray-900">
                        {item.question}
                        <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0 transition-transform group-open:rotate-90" />
                      </summary>
                      <p className="mt-2 text-sm text-gray-600 leading-relaxed">{item.answer}</p>
                    </details>
                  ))}
                </div>
              </div>
            )}

            {/* Amenities */}
            {property.amenities && property.amenities.length > 0 && (
              <div id="property-amenities" className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h2 className="font-bold text-gray-900 text-base mb-3">Tiện ích</h2>
                <div className="flex flex-wrap gap-2">
                  {property.amenities.map(a => (
                    <span key={a} className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 text-xs font-medium px-3 py-1.5 rounded-full">
                      <CheckCircle className="w-3 h-3" />{a}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {publicKeywords.length > 0 && (
              <section id="property-keywords" className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
                <h2 className="mb-3 flex items-center gap-2 text-base font-bold text-gray-900"><Tag className="h-4 w-4 text-red-500" />Từ khóa</h2>
                <div className="flex flex-wrap gap-2">
                  {publicKeywords.map(keyword => <span key={keyword} className="rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">{keyword}</span>)}
                </div>
              </section>
            )}

            {areaPriceStat && (
              <section className="detail-price-analysis rounded-2xl p-6 text-white" aria-labelledby="detail-price-analysis-heading">
                <p className="text-xs font-bold uppercase tracking-[.16em] text-red-200">Phân tích giá khu vực</p>
                <h2 id="detail-price-analysis-heading" className="mt-2 text-2xl font-black">Lịch sử giá & xu hướng {property.property_types?.name || 'bất động sản'} tại {property.district || property.city}</h2>
                <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200">Dữ liệu tham khảo được tổng hợp từ {areaPriceStat.sample_count} tin đăng thực tế, cập nhật {formatUpdateDate(areaPriceStat.computed_at)}.</p>
                <Link href="/du-lieu-gia" className="mt-5 inline-flex rounded-lg bg-red-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-400">Xem dữ liệu giá</Link>
              </section>
            )}

            {/* Map & Directions */}
            <div id="property-location" className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-bold text-gray-900 text-base mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-500" />Vị trí & Bản đồ
              </h2>
              {neighborhood && (
                <Link href={`/khu-dan-cu/${neighborhood.slug}`}
                  className="mb-3 flex items-center gap-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-100">
                  <MapPin className="w-4 h-4 flex-shrink-0" />
                  <span>Xem tổng quan & giá nhà đất khu dân cư {neighborhood.name}</span>
                </Link>
              )}
              {hasCoords ? (
                <div className="rounded-xl overflow-hidden mb-3 border border-gray-100">
                  <PropertyLocationMap lat={property.latitude!} lng={property.longitude!} title={property.title} />
                </div>
              ) : (
                <div className="bg-gray-50 rounded-xl p-4 mb-3 flex items-center gap-3 text-gray-500 text-sm">
                  <MapPin className="w-4 h-4 text-gray-300 flex-shrink-0" />
                  <span>{[property.address, property.district, property.city].filter(Boolean).join(', ')}</span>
                </div>
              )}
              <a
                href={gmapsUrl}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2.5 px-5 rounded-xl text-sm transition-colors w-full sm:w-auto"
              >
                <Navigation className="w-4 h-4" />
                Chỉ đường bằng Google Maps
                <ExternalLink className="w-3.5 h-3.5 opacity-70" />
              </a>
              {hasCoords && <NearbyPoi lat={property.latitude!} lng={property.longitude!} />}
            </div>

            {(() => {
              const signals = buildTrustSignals(property);
              if (signals.length === 0) return null;
              const Icon = (icon: TrustIcon) =>
                icon === 'shield' ? <ShieldCheck className="w-3.5 h-3.5" />
                : icon === 'file' ? <FileCheck className="w-3.5 h-3.5" />
                : icon === 'map' ? <MapPin className="w-3.5 h-3.5" />
                : <ImageIcon className="w-3.5 h-3.5" />;
              return (
                <div className="flex flex-wrap gap-2">
                  {signals.map(s => (
                    <span key={s.key} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-full px-3 py-1.5">
                      {Icon(s.icon)}{s.label}
                    </span>
                  ))}
                </div>
              );
            })()}

            {/* Thông tin hỗ trợ giao dịch — không thay cho hồ sơ pháp lý/đảm bảo độc lập. */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
              <Shield className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-emerald-800 text-sm mb-1.5">Hỗ trợ trước khi ra quyết định</h3>
                <ul className="space-y-1">
                  {[
                    property.legal_status ? `Thông tin pháp lý đang hiển thị: ${property.legal_status}` : 'Hỏi tư vấn viên về thông tin pháp lý trước khi giao dịch',
                    'Đề nghị kiểm tra hồ sơ và điều khoản trực tiếp trước khi đặt cọc',
                    'Có thể yêu cầu tư vấn về quy trình xem nhà và thủ tục',
                  ].map(i => (
                    <li key={i} className="flex items-center gap-2 text-xs text-emerald-700">
                      <CheckCircle className="w-3 h-3 text-emerald-500 flex-shrink-0" />{i}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Inline contact form */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-bold text-gray-900 text-base mb-4 flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-red-500" />Đặt lịch xem nhà
              </h2>
              {formSent ? (
                <div className="text-center py-6">
                  <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
                  <p className="font-bold text-gray-900">Đã ghi nhận yêu cầu!</p>
                  <p className="text-gray-500 text-sm mt-0.5">Nhân viên tư vấn sẽ liên hệ trong {responseTime}.</p>
                </div>
              ) : preview ? (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Bản xem trước không nhận thông tin liên hệ hoặc tạo yêu cầu tư vấn.</p>
              ) : (
                <form onSubmit={handleContact} className="space-y-3">
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Họ và tên *" required
                      className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                    <input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      placeholder="Số điện thoại *" required type="tel" inputMode="tel" pattern="(\+?84|0)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}" title="Nhập số di động Việt Nam, ví dụ 0901234567"
                      className="border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  </div>
                  <input value={form.budget} onChange={e => setForm(f => ({ ...f, budget: e.target.value }))}
                    placeholder="Ngân sách (VD: 2 tỷ, thương lượng)"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                  <textarea value={form.message} onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    placeholder="Nội dung cần tư vấn..." rows={3}
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
                  {formFeedback && <p className="text-sm text-red-600" role="alert">{formFeedback}</p>}
                  <button type="submit" disabled={formLoading}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition-colors disabled:opacity-60">
                    {formLoading ? 'Đang gửi...' : submitMutation.isError ? 'Thử gửi lại yêu cầu tư vấn' : 'Gửi yêu cầu tư vấn'}
                  </button>
                </form>
              )}
            </div>

          </div>

          {/* Sticky sidebar */}
          <aside className="w-full flex-shrink-0 lg:w-[360px]">
            <div className="space-y-4 lg:sticky lg:top-[calc(var(--cnv-header-height)+1rem)]">
              {/* Price box */}
              <div className="hidden rounded-xl border border-gray-100 bg-white p-5 shadow-sm lg:block">
                <p className="text-xs text-gray-500 mb-1">Mức giá</p>
                <p className="text-2xl font-black text-red-600 mb-1">
                  {formatPropertyPrice(property)}
                </p>
                {pricePerSqm && <p className="text-gray-400 text-xs mb-4">{pricePerSqm}</p>}
                <button onClick={openContact}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition-colors mb-2">
                  Yêu cầu tư vấn ngay
                </button>
                  {phoneRevealed ? (
                  <a href={`tel:${contactPhone.replace(/\s/g, '')}`}
                    className="w-full border border-red-400 text-red-600 font-bold py-3 rounded-xl text-sm hover:bg-red-50 transition-colors flex items-center justify-center gap-2 mb-2">
                    <Phone className="w-4 h-4" />{contactPhone}
                  </a>
                ) : (
                  <button onClick={revealPhone}
                    className="w-full border border-red-400 text-red-600 font-bold py-3 rounded-xl text-sm hover:bg-red-50 transition-colors flex items-center justify-center gap-2 mb-2">
                    <Phone className="w-4 h-4" />Bấm để hiện số
                  </button>
                )}
                <p className="text-gray-400 text-xs text-center mt-3 flex items-center justify-center gap-1">
                  <Shield className="w-3 h-3" />Phản hồi trong {responseTime} · Bảo mật thông tin
                </p>
              </div>

              {/* Agent */}
              <div className="detail-agent-card rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                <div className="detail-agent-card__ribbon">MÔI GIỚI CHUYÊN NGHIỆP</div>
                <div className="flex items-center gap-3">
                  {publicAgentProfileHref ? (
                    <Link href={publicAgentProfileHref} aria-label={`Xem hồ sơ của ${publicAgentName}`} className="flex-shrink-0 rounded-full transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2">
                      {publicAgentVisual}
                    </Link>
                  ) : publicAgentVisual}
                  <div className="min-w-0 flex-1">
                    {publicAgentProfileHref ? (
                      <Link href={publicAgentProfileHref} className="group inline-flex max-w-full items-center gap-1 rounded-md font-bold text-sm text-gray-900 transition-colors hover:text-red-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2">
                        <span className="whitespace-normal break-words">{publicAgentName}</span>
                        <ChevronRight className="h-4 w-4 flex-shrink-0 text-red-500 transition-transform group-hover:translate-x-0.5" />
                      </Link>
                    ) : (
                      <p className="whitespace-normal break-words font-bold text-sm text-gray-900">{publicAgentName}</p>
                    )}
                    <p className="mt-0.5 text-xs text-gray-500">{publicAgentProfileHref ? 'Hồ sơ công khai' : publicAgent ? 'Hồ sơ người đăng' : 'Người đăng tin'}</p>
                  </div>
                </div>
                {publicAgent?.bio && (
                  <p className="mt-3 line-clamp-3 text-xs leading-relaxed text-gray-600">{publicAgent.bio}</p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1"><Clock className="h-3 w-3 text-blue-500" />Mục tiêu phản hồi {responseTime}</span>
                  {property.legal_status && <>
                    <span className="text-gray-300">·</span>
                    <span className="flex items-center gap-1"><FileCheck className="h-3 w-3 text-emerald-500" />Có thông tin pháp lý</span>
                  </>}
                </div>
                {publicAgentProfileHref && (
                  <Link href={publicAgentProfileHref} className="mt-3 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-bold text-red-700 transition-colors hover:border-red-300 hover:bg-red-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2">
                    Xem hồ sơ người đăng <ChevronRight className="h-4 w-4" />
                  </Link>
                )}
                {phoneRevealed ? (
                  <a href={`tel:${contactPhone.replace(/\s/g, '')}`}
                    className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                    <Phone className="h-3.5 w-3.5" />{contactPhone}
                  </a>
                ) : (
                  <button onClick={revealPhone}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2">
                    <Phone className="h-3.5 w-3.5" />Bấm để hiện số
                  </button>
                )}
              </div>

              <div className="detail-property-info hidden rounded-2xl border border-gray-100 bg-white p-5 shadow-sm lg:block">
                <h3 className="text-lg font-bold text-gray-900">Thông tin bất động sản</h3>
                <dl className="mt-4 space-y-3 text-sm">
                  {property.public_code != null && <div className="flex items-center justify-between gap-3"><dt className="text-gray-500">Mã tin:</dt><dd className="font-semibold text-gray-900">PR{property.public_code}</dd></div>}
                  <div className="flex items-center justify-between gap-3"><dt className="text-gray-500">Loại hình:</dt><dd className="font-semibold text-gray-900">{property.listing_type === 'cho_thue' ? 'Cho thuê' : 'Mua bán'}</dd></div>
                  <div className="flex items-center justify-between gap-3"><dt className="text-gray-500">Hình thức giá:</dt><dd className="font-semibold text-gray-900">{property.listing_type === 'cho_thue' ? 'Theo tháng' : 'Tổng giá'}</dd></div>
                  {property.property_types?.name && <div className="flex items-center justify-between gap-3"><dt className="text-gray-500">Danh mục:</dt><dd className="font-semibold text-gray-900">{property.property_types.name}</dd></div>}
                  {property.district && <div className="flex items-center justify-between gap-3"><dt className="text-gray-500">Quận/Huyện:</dt><dd className="text-right font-semibold text-gray-900">{property.district}</dd></div>}
                  {postedDate && <div className="flex items-center justify-between gap-3"><dt className="text-gray-500">Đã đăng:</dt><dd className="font-semibold text-gray-900">{postedDate}</dd></div>}
                </dl>
              </div>

              {property.listing_type !== 'cho_thue' && (
                <div className="hidden lg:block">
                  <LoanCalculator propertyPrice={property.price} priceUnit={property.price_unit} />
                </div>
              )}

              {/* Sidebar giữ vai trò điều hướng; danh sách BĐS tương tự đầy đủ nằm ở
                  block phía dưới để tránh lặp cùng một dataset trên desktop. */}
              {continuationTargets.length > 0 && (
                <nav className="hidden rounded-xl border border-gray-100 bg-white p-4 shadow-sm lg:block" aria-label="Khám phá bất động sản liên quan">
                  <h3 className="font-bold text-gray-900 text-sm mb-3">Khám phá tiếp</h3>
                  <div className="space-y-2 text-sm">
                    {continuationTargets.map(target => target.href.startsWith('#') ? (
                      <a key={target.key} href={target.href} className="block rounded-lg bg-gray-50 px-3 py-2.5 font-semibold text-gray-700 transition-colors hover:bg-red-50 hover:text-red-700">
                        {target.label}
                      </a>
                    ) : (
                      <Link key={target.key} href={target.href} className={`block rounded-lg px-3 py-2.5 font-semibold transition-colors ${target.key === 'neighborhood' ? 'bg-red-50 text-red-700 hover:bg-red-100' : 'bg-gray-50 text-gray-700 hover:bg-red-50 hover:text-red-700'}`}>
                        {target.label}
                      </Link>
                    ))}
                  </div>
                </nav>
              )}
            </div>
          </aside>
        </div>

        {/* Related full grid — SEO Internal Linking */}
        {related.length > 0 && (
          <div id="related-properties" className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-black text-gray-900 text-xl">
                  {allRelatedInSameDistrict
                    ? `Bất động sản tương tự tại ${property.district}`
                    : `Bất động sản có cùng tiêu chí${property.city ? ` tại ${property.city}` : ''}`}
                </h2>
                <p className="text-gray-500 text-sm mt-0.5">
                  {allRelatedInSameDistrict
                    ? 'Khám phá thêm lựa chọn phù hợp trong cùng khu vực'
                    : 'Các lựa chọn có chung khu vực hoặc loại bất động sản với tin bạn đang xem'}
                </p>
              </div>
              <Link href={relatedListingHref}
                className="text-red-600 text-sm font-semibold flex items-center gap-1 hover:underline">
                Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {related.map(r => (
                <Link key={r.id} href={buildPropertyPath(r)}
                  className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md border border-gray-100 transition-all">
                  <div className="relative aspect-[4/3] bg-gray-100">
                    <SafeImage src={r.image_url} fallbackSrc={FALLBACK_PROPERTY_IMAGE} alt={buildPropertyImageAlt(r)} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2 group-hover:text-red-600 transition-colors">{r.title}</p>
                    <p className="text-red-600 text-sm font-black mt-1">{formatPropertyPrice(r)}</p>
                    <p className="text-gray-400 text-xs flex items-center gap-0.5 mt-0.5"><MapPin className="w-2.5 h-2.5" />{r.city}</p>
                    {r.relatedReason && <p className="mt-1 line-clamp-1 text-[11px] font-medium text-red-500">{r.relatedReason}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        <DetailShareButtons title={property.title} canonicalPathname={buildPropertyPath(property)} className="mt-8 border-t border-gray-200 pt-6" />

        {exploreFilters.length > 0 && (
          <section className="mt-6 rounded-xl border border-gray-100 bg-white p-5 shadow-sm" aria-labelledby="explore-filters-heading">
            <h2 id="explore-filters-heading" className="text-base font-bold text-gray-900">Mở rộng tiêu chí tìm kiếm</h2>
            <p className="mt-1 text-sm text-gray-500">Khám phá thêm các lựa chọn cùng khu vực, tầm giá hoặc nhu cầu.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {exploreFilters.map(({ label, page }) => (
                <Link
                  key={label}
                  href={pageToHref(page, hrefTaxonomy)}
                  className="rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100"
                >
                  {label}
                </Link>
              ))}
            </div>
          </section>
        )}

        <section className="detail-seo-block mt-8" aria-labelledby="detail-seo-heading">
          <h2 id="detail-seo-heading" className="text-2xl font-black text-gray-900">{listingTitle}{property.district || property.city ? ` tại ${[property.district, property.city].filter(Boolean).join(', ')}` : ''}</h2>
          <p className="mt-4">Cập nhật thông tin chi tiết về <strong>{listingTitle}</strong>. Tin đăng thuộc phân khúc {property.property_types?.name || 'bất động sản'} với diện tích {property.area_sqm ? `${property.area_sqm}m²` : 'đang cập nhật'} tại {[property.district, property.city].filter(Boolean).join(', ') || 'khu vực đang cập nhật'}{pricePerSqm ? `. Giá tham khảo khoảng ${pricePerSqm}` : '.'}</p>
          <div className="mt-8 grid gap-8 border-t border-gray-100 pt-6 md:grid-cols-2">
            <div><h3 className="text-xl font-bold">Vị trí & Quy mô</h3><p className="mt-3">Tọa lạc tại {[property.address, property.ward, property.district, property.city].filter(Boolean).join(', ') || 'khu vực đang cập nhật'}. {property.area_sqm ? `Diện tích ${property.area_sqm}m²` : 'Diện tích đang cập nhật'}.</p></div>
            <div><h3 className="text-xl font-bold">Pháp lý & kiểm tra</h3><p className="mt-3">{property.legal_status ? `Thông tin pháp lý đang hiển thị: ${property.legal_status}.` : 'Tin đăng chưa cung cấp thông tin pháp lý công khai.'} Người mua cần kiểm tra hồ sơ, quy hoạch và hiện trạng thực tế trước khi giao dịch.</p></div>
          </div>
          <div className="mt-8 flex items-start gap-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><ShieldCheck className="mt-0.5 h-6 w-6 flex-shrink-0 text-emerald-600" /><div><h3 className="font-bold text-emerald-900">Thông tin cần kiểm tra trước giao dịch</h3><p className="mt-1 text-sm leading-6 text-emerald-800">Nội dung hiển thị dựa trên thông tin người đăng cung cấp. Hãy đối chiếu pháp lý, quy hoạch và hiện trạng trước khi đặt cọc.</p></div></div>
        </section>

        {!preview && <ForYou excludeId={property.id} surface="property_detail" source="property_detail_for_you" />}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/95 p-3 shadow-[0_-8px_24px_rgba(15,23,42,0.12)] backdrop-blur lg:hidden">
        {preview ? (
          <p className="text-center text-xs font-semibold text-amber-800">Bản xem trước — các thao tác liên hệ đang bị tắt.</p>
        ) : (
          <div className="mx-auto flex max-w-md gap-2">
            <button onClick={openContact}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-3 py-3 text-sm font-bold text-white transition-colors hover:bg-red-700">
              <Phone className="h-4 w-4" />Tư vấn
            </button>
          </div>
        )}
      </div>

      <PhoneRevealModal
        property={phoneRevealOpen ? property : null}
        onClose={() => setPhoneRevealOpen(false)}
        onRevealed={handlePhoneRevealed}
      />

      <ContactModal
        property={showContact ? property : null}
        onClose={() => setShowContact(false)}
        onSubmitted={() => captureSignalFromProperty('contact', property)}
        preview={preview}
      />

      {/* Lightbox phóng to ảnh — object-contain để xem đầy đủ, không méo/vỡ hình */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-[9999] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}>
          <button onClick={() => setLightboxOpen(false)} aria-label="Đóng"
            className="absolute top-4 right-4 w-11 h-11 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-2xl transition-colors">
            ✕
          </button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium">
            {activeImg + 1} / {allImages.length}
          </div>
          <img src={allImages[activeImg]} alt={buildPropertyImageAlt(property, activeImg)}
            onError={event => {
              if (event.currentTarget.src !== FALLBACK_PROPERTY_IMAGE) event.currentTarget.src = FALLBACK_PROPERTY_IMAGE;
            }}
            onClick={e => e.stopPropagation()}
            className="max-w-[92vw] max-h-[85vh] object-contain select-none" />
          {allImages.length > 1 && (
            <>
              <button aria-label="Ảnh trước"
                onClick={e => { e.stopPropagation(); setActiveImg(i => (i - 1 + allImages.length) % allImages.length); }}
                className="absolute left-3 sm:left-6 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors">
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button aria-label="Ảnh sau"
                onClick={e => { e.stopPropagation(); setActiveImg(i => (i + 1) % allImages.length); }}
                className="absolute right-3 sm:right-24 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors">
                <ChevRight className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
    </main>
  );
}

function PropertyLocationMap({ lat, lng, title }: { lat: number; lng: number; title: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!containerRef.current || mapRef.current) return;
    import('leaflet').then(module => {
      const el = containerRef.current as (HTMLDivElement & { _leaflet_id?: number }) | null;
      if (cancelled || !el || mapRef.current || el._leaflet_id) return;
      const L = module.default;
      import('leaflet/dist/leaflet.css');

      const map = L.map(el, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: false,
      });
      mapRef.current = map;

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      L.control.attribution({ prefix: '© OpenStreetMap' }).addTo(map);

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:36px;height:44px;">
          <svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="width:36px;height:44px;filter:drop-shadow(0 3px 6px rgba(0,0,0,0.35))">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0z" fill="#dc2626"/>
            <circle cx="12" cy="12" r="5" fill="white"/>
          </svg>
        </div>`,
        iconSize: [36, 44],
        iconAnchor: [18, 44],
        popupAnchor: [0, -44],
      });

      const popup = document.createElement('div');
      popup.style.cssText = 'font-family:Inter,sans-serif;font-size:12px;font-weight:600;max-width:160px;line-height:1.4';
      popup.textContent = title;

      L.marker([lat, lng], { icon })
        .bindPopup(popup, { closeButton: false })
        .addTo(map)
        .openPopup();
    });
    return () => {
      cancelled = true;
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [lat, lng, title]); // eslint-disable-line react-hooks/exhaustive-deps

  return <MapInteractionGate label="bản đồ vị trí bất động sản" className="overflow-hidden rounded-xl" style={{ width: '100%', height: '240px' }}><div ref={containerRef} className="h-full w-full" /></MapInteractionGate>;
}
