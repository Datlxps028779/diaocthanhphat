'use client';
import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MapPin, Phone, CheckCircle, Heart, Share2, Shield,
  Maximize2, FileText, Clock, Eye, ChevronRight, Star,
  Building2, ArrowLeft, Home, Bed, Bath, Compass,
  ChevronLeft, ChevronRight as ChevRight,
  Navigation, ExternalLink, Play, CalendarClock,
  ShieldCheck, FileCheck, Image as ImageIcon
} from 'lucide-react';
import { getPropertyByIdOrSlug, getRelatedProperties, getTestimonials, submitLead, incrementPropertyView, buildPropertyPath, pushTasteSignal, getFavoriteIds, toggleFavorite } from '../lib/api';
import { track, EVENTS } from '../lib/analytics';
import { isValidVnPhone } from '../lib/phone';
import type { Property } from '../lib/supabase';
import { qk } from '../lib/queryKeys';
import Link from 'next/link';
import { type Page, pageToHref, scrollTop } from '../lib/router';
import { Breadcrumb } from '../components/Layout';
import { ContactModal } from '../components/ContactModal';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { NearbyPoi } from '../components/NearbyPoi';
import { buildTrustSignals, type TrustIcon } from '../lib/trustSignals';
import { LoanCalculator } from '../components/LoanCalculator';
import { RecentlyViewed } from '../components/RecentlyViewed';
import { ForYou } from '../components/ForYou';
import { recordRecentlyViewed } from '../lib/recentlyViewed';
import { recordSignal } from '../lib/tasteStore';
import { VrTourSection } from '../components/VrTourSection';
import { useSetting } from '../lib/cms';
import { buildPropertyGallery } from '../lib/propertyImages';
import { callbackFollowUpAt, callbackTimeLabel, type CallbackTimePreset } from '../lib/callbackRequest';

interface PropertyDetailPageProps {
  propertyId: string;
  onNavigate: (p: Page) => void;
  initialData?: Property | null;
}

export function PropertyDetailPage({ propertyId, onNavigate, initialData }: PropertyDetailPageProps) {
  const [showContact, setShowContact] = useState(false);
  const [activeImg, setActiveImg] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [form, setForm] = useState({ name: '', phone: '', message: '', budget: '' });
  const [formSent, setFormSent] = useState(false);
  const [callbackOpen, setCallbackOpen] = useState(false);
  const [callbackForm, setCallbackForm] = useState<{ name: string; phone: string; timePreset: CallbackTimePreset; customTime: string; note: string }>({ name: '', phone: '', timePreset: 'asap', customTime: '', note: '' });
  const [callbackSent, setCallbackSent] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [phoneRevealed, setPhoneRevealed] = useState(false);
  const sitePhone = useSetting('phone_hotline', '0901234567');
  const responseTime = useSetting('lead_response_time', '30 phút');
  const agentExperience = useSetting('stat3_number', '7 năm');

  // initialData từ server (RSC prefetch) → crawler & first paint có ngay dữ liệu,
  // không nhấp nháy loading. SEO (title/meta/JSON-LD) do generateMetadata + page.tsx lo.
  const { data: property = null, isLoading: loading } = useQuery({
    queryKey: qk.property(propertyId),
    queryFn: () => getPropertyByIdOrSlug(propertyId),
    enabled: !!propertyId,
    initialData: initialData ?? undefined,
  });

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

  const { data: testimonialsRaw = [] } = useQuery({
    queryKey: qk.testimonials(),
    queryFn: getTestimonials,
  });
  const testimonials = testimonialsRaw.slice(0, 2);

  const { data: related = [] } = useQuery({
    queryKey: qk.relatedProperties(propertyId),
    queryFn: () => getRelatedProperties(property!),
    enabled: !!property,
  });

  // Yêu thích: persist thật qua Supabase (dùng chung logic với card ở list/home),
  // trước đây chỉ là state cục bộ nên tim bấm xong mất khi rời trang.
  const queryClient = useQueryClient();
  const { data: favIds = [] } = useQuery({ queryKey: qk.favoriteIds(), queryFn: getFavoriteIds });
  const liked = !!property && favIds.includes(property.id);
  const favMutation = useMutation({
    mutationFn: (id: string) => toggleFavorite(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.favoriteIds() }),
  });

  // Tăng view tách khỏi fetcher: bắn đúng 1 lần mỗi lần mở trang, theo UUID thật
  // (property.id), không phụ thuộc cache/refetch của React Query.
  const viewedRef = useRef<string | null>(null);
  const viewMutation = useMutation({ mutationFn: (id: string) => incrementPropertyView(id) });
  useEffect(() => {
    if (property?.id && viewedRef.current !== property.id) {
      viewedRef.current = property.id;
      viewMutation.mutate(property.id);
      recordRecentlyViewed(property);
      const tasteAttrs = {
        areaId: property.area_id, typeId: property.property_type_id,
        listingType: property.listing_type, price: property.price,
      };
      recordSignal('view', tasteAttrs);
      pushTasteSignal('view', tasteAttrs).catch(() => {});
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
      setFormSent(true);
    },
  });
  const formLoading = submitMutation.isPending;

  const handleContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !isValidVnPhone(form.phone)) return;
    submitMutation.mutate();
  };

  const callbackMutation = useMutation({
    mutationFn: () => {
      const followUpAt = callbackFollowUpAt(callbackForm.timePreset, callbackForm.customTime);
      return submitLead({
        full_name: callbackForm.name,
        phone: callbackForm.phone,
        property_id: property?.id,
        property_title: property?.title,
        message: [
          `Khung giờ muốn gọi lại: ${callbackTimeLabel(callbackForm.timePreset, callbackForm.customTime)}`,
          callbackForm.note,
        ].filter(Boolean).join('\n'),
        source: 'property_callback',
        follow_up_at: followUpAt,
      });
    },
    onSuccess: () => {
      track(EVENTS.LEAD_SUBMIT, { listingId: property?.id ?? '', source: 'property_callback', hasMessage: !!callbackForm.note.trim(), callbackTime: callbackForm.timePreset });
      setCallbackSent(true);
    },
  });

  const handleCallback = (e: React.FormEvent) => {
    e.preventDefault();
    if (!callbackForm.name || !isValidVnPhone(callbackForm.phone)) return;
    callbackMutation.mutate();
  };

  // Link chia sẻ dạng /bat-dong-san/{slug} chuẩn SEO. Web Share API trên mobile,
  // fallback copy clipboard trên desktop.
  const handleShare = async () => {
    if (!property) return;
    const shareUrl = `${window.location.origin}${buildPropertyPath(property)}`;
    const shareData = { title: property.title, text: property.title, url: shareUrl };
    try {
      if (navigator.share && navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
        return;
      }
    } catch { /* user hủy share → rơi xuống copy */ }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      window.prompt('Sao chép link để chia sẻ:', shareUrl);
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

  const pricePerSqm = property.area_sqm
    ? ((property.price_unit === 'triệu' ? property.price / 1000 : property.price) * 1000 / property.area_sqm).toFixed(0)
    : null;

  const contactPhone = property.contact_phone ?? sitePhone;
  const hasCoords = property.latitude && property.longitude;
  const gmapsUrl = hasCoords
    ? `https://www.google.com/maps/dir/?api=1&destination=${property.latitude},${property.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([property.address, property.district, property.city].filter(Boolean).join(', '))}`;

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
    <div className="min-h-screen bg-gray-50">

      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 py-3">
          <Breadcrumb items={[
            { label: 'Trang chủ', onClick: () => onNavigate({ name: 'home' }) },
            { label: 'Danh sách', onClick: () => onNavigate({ name: 'listings' }) },
            { label: property.title },
          ]} />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-5">
        <div className="flex gap-5">
          {/* Main */}
          <div className="flex-1 min-w-0 space-y-4">

            {/* Gallery */}
            <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
              <div className="relative aspect-video overflow-hidden group/gallery">
                {/* Track trượt ngang cho slide mượt (translateX theo activeImg) */}
                <div className="flex h-full transition-transform duration-300 ease-out"
                  style={{ transform: `translateX(-${activeImg * 100}%)` }}>
                  {allImages.map((img, i) => (
                    <button key={i} type="button" onClick={() => setLightboxOpen(true)}
                      className="relative flex-shrink-0 w-full h-full cursor-zoom-in"
                      aria-label="Phóng to ảnh">
                      <Image src={img} alt={`${property.title} - ảnh ${i + 1}`} fill
                        priority={i === 0}
                        sizes="(max-width: 768px) 100vw, 66vw" className="object-cover" />
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
                <div className="absolute top-3 right-3 flex gap-2">
                  <button onClick={() => property && favMutation.mutate(property.id)} aria-label={liked ? 'Bỏ yêu thích' : 'Lưu yêu thích'}
                    className="w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow hover:scale-110 transition-transform">
                    <Heart className={`w-4 h-4 ${liked ? 'fill-red-500 text-red-500' : 'text-gray-500'}`} />
                  </button>
                  <button onClick={handleShare} title="Chia sẻ" aria-label="Chia sẻ"
                    className="relative w-9 h-9 bg-white/90 rounded-full flex items-center justify-center shadow hover:scale-110 transition-transform">
                    {shareCopied ? <CheckCircle className="w-4 h-4 text-emerald-500" /> : <Share2 className="w-4 h-4 text-gray-500" />}
                    {shareCopied && (
                      <span className="absolute top-full mt-1 right-0 whitespace-nowrap bg-gray-900 text-white text-[10px] font-medium px-2 py-1 rounded shadow">
                        Đã sao chép link
                      </span>
                    )}
                  </button>
                </div>
                {/* Nút phóng to */}
                <button onClick={() => setLightboxOpen(true)} title="Phóng to" aria-label="Phóng to ảnh"
                  className="absolute bottom-2 left-3 w-9 h-9 bg-black/50 hover:bg-black/70 rounded-full flex items-center justify-center text-white transition-colors">
                  <Maximize2 className="w-4 h-4" />
                </button>
                <div className="absolute bottom-2 right-3 bg-black/50 text-white text-xs px-2 py-0.5 rounded">
                  {activeImg + 1}/{allImages.length}
                </div>
              </div>
              {allImages.length > 1 && (
                <div className="flex gap-2 p-3 overflow-x-auto">
                  {allImages.map((img, i) => (
                    <button key={i} onClick={() => setActiveImg(i)}
                      className={`flex-shrink-0 w-20 h-14 rounded-lg overflow-hidden border-2 transition-colors ${activeImg === i ? 'border-red-500' : 'border-transparent'}`}>
                      <img src={img} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* VR Tour */}
            <VrTourSection vrTourUrl={property.vr_tour_url} />

            {/* Video player */}
            {property.video_url && (
              <div className="bg-white rounded-xl overflow-hidden shadow-sm border border-gray-100">
                <div className="px-5 pt-5 pb-3 flex items-center gap-2">
                  <div className="w-7 h-7 bg-red-100 rounded-lg flex items-center justify-center">
                    <Play className="w-3.5 h-3.5 text-red-600 fill-red-600" />
                  </div>
                  <h2 className="font-bold text-gray-900 text-base">Video thực tế</h2>
                </div>
                <div className="relative aspect-video bg-black">
                  {property.video_url.includes('youtube.com') || property.video_url.includes('youtu.be') ? (
                    <iframe
                      src={property.video_url.replace('watch?v=', 'embed/').replace('youtu.be/', 'www.youtube.com/embed/')}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      title="Video BĐS"
                    />
                  ) : (
                    <video
                      src={property.video_url}
                      controls
                      className="w-full h-full object-contain"
                      preload="metadata"
                    >
                      Trình duyệt của bạn không hỗ trợ video HTML5.
                    </video>
                  )}
                </div>
              </div>
            )}

            {/* Title & price */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              {property.is_verified && <div className="mb-2"><VerifiedBadge verified size="md" /></div>}
              <h1 className="text-xl font-black text-gray-900 leading-tight mb-2">{property.title}</h1>
              <div className="flex items-center gap-1.5 text-gray-500 text-sm mb-4 flex-wrap">
                <MapPin className="w-4 h-4 text-red-500 flex-shrink-0" />
                <span>{[property.address, property.district, property.city].filter(Boolean).join(', ')}</span>
              </div>
              <div className="flex flex-wrap items-end justify-between gap-4 pt-4 border-t border-gray-100">
                <div>
                  <p className="text-gray-500 text-xs mb-0.5">Mức giá</p>
                  <p className="text-3xl font-black text-red-600">{property.price_label ?? `${property.price} ${property.price_unit}`}</p>
                  {pricePerSqm && <p className="text-gray-400 text-xs mt-0.5">≈ {pricePerSqm} triệu/m²</p>}
                </div>
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setShowContact(true)}
                    className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-bold px-5 py-2.5 rounded-xl transition-colors text-sm">
                    <Phone className="w-4 h-4" />Yêu cầu tư vấn
                  </button>
                  <button onClick={() => { setCallbackSent(false); setCallbackOpen(true); }}
                    className="flex items-center gap-2 border border-amber-400 text-amber-700 font-bold px-5 py-2.5 rounded-xl hover:bg-amber-50 transition-colors text-sm">
                    <CalendarClock className="w-4 h-4" />Gọi lại cho tôi
                  </button>
                  {phoneRevealed ? (
                    <a href={`tel:${contactPhone.replace(/\s/g, '')}`}
                      className="flex items-center gap-2 border border-red-500 text-red-600 font-bold px-5 py-2.5 rounded-xl hover:bg-red-50 transition-colors text-sm">
                      <Phone className="w-4 h-4" />{contactPhone}
                    </a>
                  ) : (
                    <button onClick={() => { setPhoneRevealed(true); track(EVENTS.PHONE_REVEAL, { listingId: property?.id ?? '', source: 'property_detail' }); }}
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
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h2 className="font-bold text-gray-900 text-base mb-3">Mô tả chi tiết</h2>
                <p className="text-gray-600 text-sm leading-relaxed whitespace-pre-line">{property.description}</p>
              </div>
            )}

            {/* Amenities */}
            {property.amenities && property.amenities.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
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

            {/* Map & Directions */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
              <h2 className="font-bold text-gray-900 text-base mb-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-red-500" />Vị trí & Bản đồ
              </h2>
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

            {/* Legal guarantee */}
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex gap-3">
              <Shield className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-emerald-800 text-sm mb-1.5">Cam kết pháp lý & An toàn giao dịch</h3>
                <ul className="space-y-1">
                  {['Kiểm tra pháp lý miễn phí trước khi đặt cọc', 'Hỗ trợ công chứng, sang tên nhanh chóng', 'Đảm bảo hoàn tiền nếu phát sinh tranh chấp pháp lý'].map(i => (
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
                  <button type="submit" disabled={formLoading}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition-colors">
                    {formLoading ? 'Đang gửi...' : 'Gửi yêu cầu tư vấn'}
                  </button>
                </form>
              )}
            </div>

            {/* Testimonials */}
            {testimonials.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <h2 className="font-bold text-gray-900 text-base mb-3">Đánh giá từ khách hàng</h2>
                <div className="space-y-3">
                  {testimonials.map(t => (
                    <div key={t.id} className="border border-gray-100 rounded-xl p-3.5">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-red-600 font-bold text-xs">{t.name.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">{t.name}</p>
                          <div className="flex gap-0.5">{Array.from({ length: t.rating }).map((_, i) => <Star key={i} className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />)}</div>
                        </div>
                      </div>
                      <p className="text-gray-600 text-xs italic">"{t.content}"</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sticky sidebar */}
          <aside className="hidden lg:block w-80 flex-shrink-0">
            <div className="sticky top-16 space-y-4">
              {/* Price box */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
                <p className="text-xs text-gray-500 mb-1">Mức giá</p>
                <p className="text-2xl font-black text-red-600 mb-1">
                  {property.price_label ?? `${property.price} ${property.price_unit}`}
                </p>
                {pricePerSqm && <p className="text-gray-400 text-xs mb-4">≈ {pricePerSqm} triệu/m²</p>}
                <button onClick={() => setShowContact(true)}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl text-sm transition-colors mb-2">
                  Yêu cầu tư vấn ngay
                </button>
                <button onClick={() => { setCallbackSent(false); setCallbackOpen(true); }}
                  className="w-full border border-amber-400 text-amber-700 font-bold py-3 rounded-xl text-sm hover:bg-amber-50 transition-colors flex items-center justify-center gap-2 mb-2">
                  <CalendarClock className="w-4 h-4" />Gọi lại cho tôi
                </button>
                {phoneRevealed ? (
                  <a href={`tel:${contactPhone.replace(/\s/g, '')}`}
                    className="w-full border border-red-400 text-red-600 font-bold py-3 rounded-xl text-sm hover:bg-red-50 transition-colors flex items-center justify-center gap-2 mb-2">
                    <Phone className="w-4 h-4" />{contactPhone}
                  </a>
                ) : (
                  <button onClick={() => { setPhoneRevealed(true); track(EVENTS.PHONE_REVEAL, { listingId: property?.id ?? '', source: 'property_detail' }); }}
                    className="w-full border border-red-400 text-red-600 font-bold py-3 rounded-xl text-sm hover:bg-red-50 transition-colors flex items-center justify-center gap-2 mb-2">
                    <Phone className="w-4 h-4" />Bấm để hiện số
                  </button>
                )}
                <p className="text-gray-400 text-xs text-center mt-3 flex items-center justify-center gap-1">
                  <Shield className="w-3 h-3" />Phản hồi trong {responseTime} · Bảo mật thông tin
                </p>
              </div>

              {/* Agent */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <span className="text-red-600 font-black text-lg">
                      {(property.contact_name ?? 'NV').charAt(0)}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-gray-900 text-sm flex items-center gap-1">
                      {property.contact_name ?? 'Nhân viên tư vấn'}
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                    </p>
                    <p className="text-gray-500 text-xs">Chuyên viên BĐS · {agentExperience} kinh nghiệm</p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-blue-500" />Phản hồi {responseTime}</span>
                  <span className="text-gray-300">·</span>
                  <span className="flex items-center gap-1"><FileCheck className="w-3 h-3 text-emerald-500" />Pháp lý minh bạch</span>
                </div>
                {phoneRevealed ? (
                  <a href={`tel:${contactPhone.replace(/\s/g, '')}`}
                    className="mt-3 w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                    <Phone className="w-3.5 h-3.5" />{contactPhone}
                  </a>
                ) : (
                  <button onClick={() => { setPhoneRevealed(true); track(EVENTS.PHONE_REVEAL, { listingId: property?.id ?? '', source: 'property_detail' }); }}
                    className="mt-3 w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2">
                    <Phone className="w-3.5 h-3.5" />Bấm để hiện số
                  </button>
                )}
              </div>

              {/* Loan calculator */}
              <LoanCalculator propertyPrice={property.price} priceUnit={property.price_unit} />

              {/* Related mini */}
              {related.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <h3 className="font-bold text-gray-900 text-sm mb-3">BĐS tương tự</h3>
                  <div className="space-y-2.5">
                    {related.slice(0, 4).map(r => (
                      <button key={r.id} onClick={() => { onNavigate({ name: 'property', id: r.id, slug: r.slug ?? undefined }); scrollTop(); }}
                        className="flex gap-3 w-full text-left hover:bg-gray-50 rounded-lg p-1.5 transition-colors group">
                        <span className="relative w-16 h-12 rounded-lg overflow-hidden flex-shrink-0 bg-gray-100">
                          <Image src={r.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'} alt={r.title} fill sizes="64px" className="object-cover" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-gray-900 line-clamp-2 group-hover:text-red-600 transition-colors">{r.title}</p>
                          <p className="text-red-600 text-xs font-bold mt-0.5">{r.price_label}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                  <Link href={pageToHref({ name: 'listings' })}
                    className="mt-3 block w-full text-center text-red-600 text-xs font-semibold hover:underline">
                    Xem thêm BĐS tương tự →
                  </Link>
                </div>
              )}
            </div>
          </aside>
        </div>

        {/* Related full grid — SEO Internal Linking */}
        {related.length > 0 && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-black text-gray-900 text-xl">
                  Bất động sản tương tự{property.district ? ` tại ${property.district}` : property.city ? ` tại ${property.city}` : ''}
                </h2>
                <p className="text-gray-500 text-sm mt-0.5">Khám phá thêm lựa chọn phù hợp trong cùng khu vực</p>
              </div>
              <Link href={pageToHref({ name: 'listings', areaId: property.area_id ?? undefined })}
                className="text-red-600 text-sm font-semibold flex items-center gap-1 hover:underline">
                Xem tất cả <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {related.map(r => (
                <div key={r.id} className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md border border-gray-100 cursor-pointer group transition-all"
                  onClick={() => { onNavigate({ name: 'property', id: r.id, slug: r.slug ?? undefined }); scrollTop(); }}>
                  <div className="relative h-36 bg-gray-100">
                    <Image src={r.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'} alt={r.title} fill sizes="(max-width: 768px) 50vw, 25vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                  </div>
                  <div className="p-3">
                    <p className="text-xs font-semibold text-gray-900 line-clamp-2 group-hover:text-red-600 transition-colors">{r.title}</p>
                    <p className="text-red-600 text-sm font-black mt-1">{r.price_label}</p>
                    <p className="text-gray-400 text-xs flex items-center gap-0.5 mt-0.5"><MapPin className="w-2.5 h-2.5" />{r.city}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <ForYou excludeId={property.id} />
        <RecentlyViewed excludeId={property.id} />
      </div>

      <ContactModal property={showContact ? property : null} onClose={() => setShowContact(false)} />

      {callbackOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setCallbackOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-5">
            <button onClick={() => setCallbackOpen(false)} aria-label="Đóng"
              className="absolute right-3 top-3 text-gray-400 hover:text-gray-600 text-xl">×</button>
            {callbackSent ? (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-3" />
                <p className="font-black text-gray-900">Đã nhận yêu cầu gọi lại!</p>
                <p className="text-gray-500 text-sm mt-1">Tư vấn viên sẽ liên hệ theo khung giờ bạn mong muốn.</p>
              </div>
            ) : (
              <form onSubmit={handleCallback} className="space-y-3">
                <div>
                  <h3 className="font-black text-gray-900 flex items-center gap-2">
                    <CalendarClock className="w-4 h-4 text-amber-500" />Gọi lại cho tôi
                  </h3>
                  <p className="text-xs text-gray-500 mt-1">Để lại SĐT, chúng tôi sẽ gọi tư vấn đúng lúc bạn tiện nghe máy.</p>
                </div>
                <input value={callbackForm.name} onChange={e => setCallbackForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Họ và tên *" required
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <input value={callbackForm.phone} onChange={e => setCallbackForm(f => ({ ...f, phone: e.target.value }))}
                  placeholder="Số điện thoại *" required type="tel" inputMode="tel" pattern="(\+?84|0)(3[2-9]|5[2689]|7[06-9]|8[1-9]|9[0-9])[0-9]{7}" title="Nhập số di động Việt Nam, ví dụ 0901234567"
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                <select value={callbackForm.timePreset} onChange={e => setCallbackForm(f => ({ ...f, timePreset: e.target.value as CallbackTimePreset }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white">
                  <option value="asap">Gọi ngay</option>
                  <option value="30m">Trong 30 phút</option>
                  <option value="tonight">Tối nay</option>
                  <option value="tomorrow_morning">Sáng mai</option>
                  <option value="custom">Chọn giờ khác</option>
                </select>
                {callbackForm.timePreset === 'custom' && (
                  <input value={callbackForm.customTime} onChange={e => setCallbackForm(f => ({ ...f, customTime: e.target.value }))}
                    required type="datetime-local"
                    className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400" />
                )}
                <textarea value={callbackForm.note} onChange={e => setCallbackForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Ghi chú thêm (ngân sách, nhu cầu, câu hỏi...)" rows={3}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none" />
                <button type="submit" disabled={callbackMutation.isPending}
                  className="w-full bg-amber-500 hover:bg-amber-600 text-white font-bold py-3 rounded-xl text-sm transition-colors disabled:opacity-60">
                  {callbackMutation.isPending ? 'Đang gửi...' : 'Gửi yêu cầu gọi lại'}
                </button>
                <p className="text-[11px] text-gray-400 text-center">Thông tin chỉ dùng để tư vấn BĐS này, không chia sẻ bên thứ ba.</p>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Lightbox phóng to ảnh — object-contain để xem đầy đủ, không méo/vỡ hình */}
      {lightboxOpen && (
        <div className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center"
          onClick={() => setLightboxOpen(false)}>
          <button onClick={() => setLightboxOpen(false)} aria-label="Đóng"
            className="absolute top-4 right-4 w-11 h-11 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white text-2xl transition-colors">
            ✕
          </button>
          <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/80 text-sm font-medium">
            {activeImg + 1} / {allImages.length}
          </div>
          <img src={allImages[activeImg]} alt={`${property.title} - ảnh ${activeImg + 1}`}
            onClick={e => e.stopPropagation()}
            className="max-w-[92vw] max-h-[85vh] object-contain select-none" />
          {allImages.length > 1 && (
            <>
              <button aria-label="Ảnh trước"
                onClick={e => { e.stopPropagation(); setActiveImg(i => (i - 1 + allImages.length) % allImages.length); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors">
                <ChevronLeft className="w-6 h-6" />
              </button>
              <button aria-label="Ảnh sau"
                onClick={e => { e.stopPropagation(); setActiveImg(i => (i + 1) % allImages.length); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-12 h-12 bg-white/10 hover:bg-white/20 rounded-full flex items-center justify-center text-white transition-colors">
                <ChevRight className="w-6 h-6" />
              </button>
            </>
          )}
        </div>
      )}
    </div>
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

  return <div ref={containerRef} style={{ width: '100%', height: '240px' }} />;
}
