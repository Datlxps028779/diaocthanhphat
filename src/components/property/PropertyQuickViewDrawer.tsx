'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Bath, BedDouble, CalendarDays, ChevronLeft, ChevronRight, Compass, ExternalLink, FileCheck2, Layers3, MapPin, Maximize2, Navigation, Phone, Route, ScanLine, ShieldCheck, Tag, X } from 'lucide-react';
import type { Property } from '../../lib/supabase';
import { getPublicPropertyAgent } from '../../lib/api';
import { agentProfilePath } from '../../lib/agentProfileSeo';
import { buildProductPath } from '../../lib/productPath';
import { buildPropertyGallery, buildPropertyImageAlt, FALLBACK_PROPERTY_IMAGE } from '../../lib/propertyImages';
import { formatPropertyPrice } from '../../lib/listingPrice';
import { formatPropertyPricePerSqm } from '../../lib/propertyCardModel';
import { formatUpdateDate } from '../../lib/priceStatsFormat';
import { stripHtml } from '../../lib/markdown';
import { SafeImage } from '../SafeImage';

export function PropertyQuickViewDrawer({ property, onClose, onContact }: { property: Property | null; onClose: () => void; onContact: (property: Property) => void }) {
  const [activeImage, setActiveImage] = useState(0);
  const { data: agent = null } = useQuery({
    queryKey: ['public-property-agent', property?.id],
    queryFn: () => getPublicPropertyAgent(property!.id),
    enabled: Boolean(property?.id),
    retry: false,
  });

  useEffect(() => {
    if (!property) return;
    setActiveImage(0);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [property, onClose]);

  if (!property) return null;

  const images = buildPropertyGallery(property.image_url, property.images);
  const detailHref = buildProductPath(property);
  const address = [property.address, property.ward, property.district, property.city].filter(Boolean).join(', ');
  const agentName = agent?.display_name || 'Người đăng tin';
  const profileHref = agent?.slug ? agentProfilePath(agent.slug) : null;
  const summary = stripHtml(property.description || '').trim();
  const status = property.listing_type === 'cho_thue' ? 'Đang cho thuê' : 'Đang giao bán';
  const nextImage = (step: number) => setActiveImage(index => (index + step + images.length) % images.length);
  const zaloDigits = agent?.public_zalo?.replace(/\D/g, '');
  const mapUrl = property.latitude && property.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${property.latitude},${property.longitude}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  const keywords = [...new Set([...(property.tags ?? []), ...(property.focus_keywords ?? '').split(',')].map(value => value.trim()).filter(Boolean))].slice(0, 12);
  const details = [
    property.bedrooms && { label: 'Phòng ngủ', value: `${property.bedrooms} phòng`, icon: BedDouble },
    property.bathrooms && { label: 'Phòng tắm', value: `${property.bathrooms} phòng`, icon: Bath },
    property.floor_count && { label: 'Số tầng', value: `${property.floor_count} tầng`, icon: Layers3 },
    property.direction && { label: 'Hướng', value: property.direction, icon: Compass },
    property.road_width && { label: 'Đường rộng', value: `${property.road_width} m`, icon: Route },
    property.frontage && { label: 'Mặt tiền', value: `${property.frontage} m`, icon: ScanLine },
    property.legal_status && { label: 'Pháp lý', value: property.legal_status, icon: FileCheck2 },
  ].filter(Boolean) as { label: string; value: string; icon: typeof BedDouble }[];

  return <div className="fixed inset-0 z-[90]" role="dialog" aria-modal="true" aria-label={`Chi tiết nhanh: ${property.title}`}>
    <button type="button" className="absolute inset-0 bg-slate-950/65" aria-label="Đóng chi tiết nhanh" onClick={onClose} />
    <aside className="absolute inset-y-0 right-0 w-full overflow-y-auto bg-[#f7f8fa] shadow-[-24px_0_60px_rgba(15,23,42,.22)] lg:w-[76vw] lg:max-w-[1180px]">
      <header className="sticky top-0 z-20 flex min-h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-5 backdrop-blur">
        <Link href={detailHref} target="_blank" className="inline-flex items-center gap-2 text-base font-bold text-slate-900 hover:text-red-700">Chi tiết bất động sản <ExternalLink size={17} /></Link>
        <button type="button" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900" aria-label="Đóng"><X size={22} /></button>
      </header>

      <div className="p-5 lg:p-6">
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <h1 className="text-xl font-black leading-tight tracking-[-.025em] text-slate-950 lg:text-2xl">{property.title}</h1>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-500"><span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-extrabold uppercase tracking-wide text-emerald-700">● {status}</span>{address && <><MapPin size={16} /><span>{address}</span></>}</div>
            </div>
            <button type="button" onClick={() => onContact(property)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 text-sm font-bold text-red-700 hover:bg-red-100"><Phone size={17} />Liên hệ</button>
          </div>
        </section>

        <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <main className="min-w-0 space-y-4">
            <nav className="flex gap-7 overflow-x-auto rounded-t-2xl border border-b-0 border-slate-200 bg-white px-5 pt-5" aria-label="Nội dung chi tiết nhanh">
              {['Hình ảnh', 'Thông tin', 'Chi tiết', 'Vị trí', 'Từ khóa'].map((label, index) => <span key={label} className={`flex-shrink-0 border-b-2 pb-4 text-sm font-bold ${index === 0 ? 'border-red-600 text-red-600' : 'border-transparent text-slate-700'}`}>{label}</span>)}
            </nav>
            <section className="overflow-hidden rounded-b-2xl bg-black shadow-lg">
              <div className="relative aspect-[16/9] min-h-[340px]">
                <SafeImage src={images[activeImage]} fallbackSrc={FALLBACK_PROPERTY_IMAGE} alt={buildPropertyImageAlt(property, activeImage)} fill sizes="(max-width:1024px) 100vw, 65vw" className="object-contain" />
                <span className="absolute left-4 top-4 rounded bg-black/55 px-2.5 py-1 text-sm text-white">{activeImage + 1} / {images.length}</span>
                <Link href={detailHref} target="_blank" className="absolute right-4 top-4 inline-flex items-center gap-2 rounded-lg bg-black/55 px-3 py-2 text-sm font-semibold text-white"><Maximize2 size={16} />Xem tất cả ảnh</Link>
                {images.length > 1 && <><button type="button" onClick={() => nextImage(-1)} className="absolute left-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white" aria-label="Ảnh trước"><ChevronLeft /></button><button type="button" onClick={() => nextImage(1)} className="absolute right-4 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-black/55 text-white" aria-label="Ảnh sau"><ChevronRight /></button></>}
              </div>
              {images.length > 1 && <div className="flex gap-3 overflow-x-auto border-t border-white/15 p-4">{images.map((image, index) => <button type="button" key={`${image}-${index}`} onClick={() => setActiveImage(index)} className={`relative h-16 w-28 flex-shrink-0 overflow-hidden rounded-lg border-2 ${index === activeImage ? 'border-white' : 'border-transparent opacity-75'}`}><SafeImage src={image} fallbackSrc={FALLBACK_PROPERTY_IMAGE} alt="" fill sizes="112px" className="object-cover" /></button>)}</div>}
            </section>

            <section className="grid grid-cols-2 gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3">
              <div><p className="text-sm text-slate-500">Mức giá</p><p className="mt-1 text-2xl font-black text-red-600">{formatPropertyPrice(property)}</p>{formatPropertyPricePerSqm(property) && <p className="mt-1 text-sm text-slate-500">{formatPropertyPricePerSqm(property)}</p>}</div>
              <div><p className="text-sm text-slate-500">Diện tích</p><p className="mt-1 text-2xl font-bold text-slate-950">{property.area_sqm ? `${property.area_sqm} m²` : '—'}</p></div>
              {property.legal_status && <div><p className="text-sm text-slate-500">Pháp lý</p><p className="mt-1 text-base font-bold text-slate-950">{property.legal_status}</p></div>}
            </section>

            <nav className="flex items-center gap-6 rounded-2xl border border-slate-200 bg-white px-5 shadow-sm" aria-label="Tổng quan chi tiết nhanh"><span className="border-b-2 border-red-600 py-4 text-sm font-bold text-red-600">Tổng quan</span><span className="py-4 text-sm font-semibold text-slate-500">Tiện ích</span></nav>

            {details.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-slate-950">Đặc điểm bất động sản</h2><div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">{details.map(item => { const Icon = item.icon; return <div key={item.label} className="rounded-xl border border-slate-100 bg-slate-50 p-3"><div className="flex items-center gap-2 text-xs text-slate-500"><Icon size={15} className="text-red-500" />{item.label}</div><p className="mt-1.5 text-sm font-bold text-slate-950">{item.value}</p></div>; })}</div></section>}

            {summary && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-slate-950">Mô tả chi tiết</h2><p className="mt-3 whitespace-pre-line text-[15px] leading-7 text-slate-600">{summary}</p></section>}

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 text-lg font-bold text-slate-950"><MapPin size={18} className="text-red-500" />Địa chỉ & vị trí</h2><p className="mt-3 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{address || 'Địa chỉ đang cập nhật'}</p><a href={mapUrl} target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-xl bg-emerald-500 px-4 text-sm font-bold text-white hover:bg-emerald-600"><Navigation size={17} />Chỉ đường bằng Google Maps</a></section>

            {property.amenities?.length ? <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="text-lg font-bold text-slate-950">Tiện ích</h2><div className="mt-4 flex flex-wrap gap-2">{property.amenities.map(item => <span key={item} className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">{item}</span>)}</div></section> : null}

            {keywords.length > 0 && <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="flex items-center gap-2 text-lg font-bold text-slate-950"><Tag size={17} className="text-red-500" />Từ khóa</h2><div className="mt-4 flex flex-wrap gap-2">{keywords.map(keyword => <span key={keyword} className="rounded-full border border-red-100 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">{keyword}</span>)}</div></section>}

            <section className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><ShieldCheck size={22} className="mt-0.5 flex-shrink-0 text-emerald-600" /><div><h2 className="font-bold text-emerald-900">Hỗ trợ trước khi ra quyết định</h2><p className="mt-1 text-sm leading-6 text-emerald-800">Thông tin do người đăng cung cấp. Người mua cần đối chiếu hồ sơ pháp lý, quy hoạch và hiện trạng trước khi đặt cọc.</p></div></section>
          </main>

          <div className="space-y-4 xl:sticky xl:top-20 xl:self-start">
            <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="border-t-4 border-red-700 bg-slate-50 px-5 py-4 text-center text-xs font-extrabold tracking-[.22em] text-slate-700">THÔNG TIN NGƯỜI ĐĂNG</div>
              <div className="p-5">
                <div className="flex items-center gap-3"><div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full bg-red-100 text-xl font-black text-red-600">{agent?.avatar_url ? <SafeImage src={agent.avatar_url} alt={agentName} width={56} height={56} className="h-full w-full object-cover" /> : agentName.charAt(0).toUpperCase()}</div><div className="min-w-0"><p className="font-bold text-slate-950">{agentName}</p><p className="text-sm text-slate-500">Hồ sơ công khai</p></div></div>
                <p className="mt-4 text-center text-lg font-black text-red-600">{formatPropertyPrice(property)} · {property.listing_type === 'cho_thue' ? 'Theo tháng' : 'Tổng giá'}</p>
                {agent?.bio && <p className="mt-3 line-clamp-4 text-sm leading-6 text-slate-600">{agent.bio}</p>}
                {profileHref && <Link href={profileHref} className="mt-5 flex min-h-11 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-sm font-bold text-red-700">Xem trang cá nhân</Link>}
                <button type="button" onClick={() => onContact(property)} className="mt-3 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-sm font-bold text-white"><Phone size={17} />Liên hệ tư vấn</button>
                {zaloDigits && <a href={`https://zalo.me/${zaloDigits}`} target="_blank" rel="noreferrer" className="mt-3 flex min-h-11 items-center justify-center rounded-xl border border-slate-200 text-sm font-bold text-slate-800">Chat qua Zalo</a>}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-bold text-slate-950">Thông tin bất động sản</h2>
              <dl className="mt-4 space-y-3 text-sm">
                {property.public_code != null && <div className="flex justify-between gap-3"><dt className="text-slate-500">Mã tin</dt><dd className="font-semibold">PR{property.public_code}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Loại hình</dt><dd className="font-semibold">{property.listing_type === 'cho_thue' ? 'Cho thuê' : 'Mua bán'}</dd></div>
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Hình thức giá</dt><dd className="font-semibold">{property.listing_type === 'cho_thue' ? 'Theo tháng' : 'Tổng giá'}</dd></div>
                {property.property_types?.name && <div className="flex justify-between gap-3"><dt className="text-slate-500">Danh mục</dt><dd className="font-semibold">{property.property_types.name}</dd></div>}
                {property.ward && <div className="flex justify-between gap-3"><dt className="text-slate-500">Phường/Xã</dt><dd className="text-right font-semibold">{property.ward}</dd></div>}
                {property.district && <div className="flex justify-between gap-3"><dt className="text-slate-500">Quận/Huyện</dt><dd className="text-right font-semibold">{property.district}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="flex items-center gap-1 text-slate-500"><CalendarDays size={14} />Ngày đăng</dt><dd className="font-semibold">{formatUpdateDate(property.created_at)}</dd></div>
                {property.updated_at !== property.created_at && <div className="flex justify-between gap-3"><dt className="text-slate-500">Cập nhật</dt><dd className="font-semibold">{formatUpdateDate(property.updated_at)}</dd></div>}
                <div className="flex justify-between gap-3"><dt className="text-slate-500">Hình thực tế</dt><dd className="font-semibold">{images.length}</dd></div>
              </dl>
            </section>
          </div>
        </div>
      </div>
    </aside>
  </div>;
}
