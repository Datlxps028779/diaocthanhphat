'use client';
import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, MapPin, TrendingUp, Shield, Phone,
  Eye, Flame, Sparkles, Star, ArrowRight, ChevronRight, ChevronDown,
  CheckCircle, Newspaper, Users, Clock
} from 'lucide-react';
import { type Property } from './lib/supabase';
import {
  getTestimonials, getNews, getBanners,
  getFeaturedSections, getPropertiesForSection, getFavoriteIds, toggleFavorite,
  getPageLayout, buildPropertyPath,
} from './lib/api';
import { useAreas, usePropertyTypes, useDistricts, useWards } from './lib/hooks/useTaxonomy';
import { PRICE_RANGES_SALE, PRICE_RANGES_RENT } from './lib/priceRange';
import { parseSearchIntent } from './lib/aiSearch';
import { FAQ_ITEMS } from './lib/faq';
import { track, EVENTS } from './lib/analytics';
import { qk } from './lib/queryKeys';
import { type Page, pageToHref } from './lib/router';
import { quickCategoryToPage } from './lib/quickCategory';
import { CategoryIcon } from './lib/categoryIcons';
import { useSetting } from './lib/cms';
import { ContactModal } from './components/ContactModal';
import { VerifiedBadge } from './components/VerifiedBadge';
import { ForYou } from './components/ForYou';
import { Header, Footer, FloatingButtons } from './components/Layout';
import { buildNewsImageAlt, buildPropertyImageAlt } from './lib/propertyImages';
import type { User as SupabaseUser } from '@supabase/supabase-js';
export function Breadcrumb({ items }: { items: { label: string; href?: string; onClick?: () => void }[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4 flex-wrap">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-gray-300">/</span>}
          {item.href
            ? <Link href={item.href} onClick={item.onClick} className="hover:text-red-600 transition-colors">{item.label}</Link>
            : item.onClick
              ? <button onClick={item.onClick} className="hover:text-red-600 transition-colors">{item.label}</button>
              : <span className="text-gray-800 font-medium">{item.label}</span>}
        </span>
      ))}
    </nav>
  );
}

interface LandingPageProps {
  onNavigate: (p: Page) => void;
  user?: SupabaseUser | null;
  onShowAuth: (mode: 'login' | 'register') => void;
}

const LISTING_TYPE_TABS = [
  { key: 'mua_ban', label: 'Mua bán' },
  { key: 'cho_thue', label: 'Cho thuê' },
] as const;

export function LandingPage({ onNavigate, user, onShowAuth }: LandingPageProps) {
  const queryClient = useQueryClient();
  const [contactProp, setContactProp] = useState<Property | null>(null);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [searchAreaId, setSearchAreaId] = useState('');
  const [searchDistrict, setSearchDistrict] = useState('');
  const [searchWard, setSearchWard] = useState('');
  const [searchTypeId, setSearchTypeId] = useState('');
  const [searchPriceIdx, setSearchPriceIdx] = useState(0);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeTab, setActiveTab] = useState<'mua_ban' | 'cho_thue'>('mua_ban');

  const phone = useSetting('phone_hotline', '0901 234 567');

  // Taxonomy + dữ liệu trang chủ qua React Query (cache/dedup)
  const { data: areas = [] } = useAreas();
  const { data: types = [] } = usePropertyTypes();
  // Hero search cascade: Quận/Huyện theo tỉnh, Phường/Xã theo quận/huyện (district
  // lưu dạng TÊN nên map ra id để lấy wards).
  const { data: searchDistricts = [] } = useDistricts(searchAreaId || undefined);
  const searchDistrictId = searchDistricts.find(d => d.name === searchDistrict)?.id;
  const { data: searchWards = [] } = useWards(searchDistrictId || undefined);
  const { data: testimonials = [] } = useQuery({ queryKey: qk.testimonials(), queryFn: getTestimonials });
  const { data: news = [] } = useQuery({ queryKey: qk.news(undefined, 6), queryFn: () => getNews(undefined, 6) });
  const { data: pageLayout = [] } = useQuery({ queryKey: qk.pageLayout(), queryFn: getPageLayout });
  const { data: heroBanners = [] } = useQuery({ queryKey: qk.banners('hero'), queryFn: () => getBanners('hero') });
  const heroBg = heroBanners[0]?.image_url || 'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg';

  const { data: featuredSections = [] } = useQuery({ queryKey: qk.featuredSections(), queryFn: getFeaturedSections });

  // Per-section properties: 1 query mỗi section, chạy khi featuredSections có
  const sectionQueries = useQueries({
    queries: featuredSections.map((s) => ({
      queryKey: qk.sectionProperties(s.id),
      queryFn: () => getPropertiesForSection(s),
    })),
  });
  const sections = featuredSections
    .map((section, i) => ({ section, properties: (sectionQueries[i]?.data ?? []) as Property[] }))
    .filter((r) => r.properties.length > 0);

  const { data: favIds = [] } = useQuery({ queryKey: qk.favoriteIds(), queryFn: getFavoriteIds });
  const favoriteIds = useMemo(() => new Set(favIds), [favIds]);

  // Helper: get settings for a section by id, with string fallback
  const sec = (id: string) => {
    const found = pageLayout.find(s => s.id === id);
    const settings = (found?.settings ?? {}) as Record<string, unknown>;
    return (key: string, def: string) => (settings[key] as string) || def;
  };
  const secNum = (id: string, key: string, def: number): number => {
    const found = pageLayout.find(s => s.id === id);
    const settings = (found?.settings ?? {}) as Record<string, unknown>;
    return typeof settings[key] === 'number' ? (settings[key] as number) : def;
  };

  const favoriteMutation = useMutation({
    mutationFn: (propertyId: string) => toggleFavorite(propertyId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: qk.favoriteIds() }),
  });

  const handleToggleFavorite = (propertyId: string) => {
    if (!user) { onShowAuth('login'); return; }
    favoriteMutation.mutate(propertyId);
  };

  const handleSearch = () => {
    const pr = (activeTab === 'cho_thue' ? PRICE_RANGES_RENT : PRICE_RANGES_SALE)[searchPriceIdx];
    const explicit = {
      areaId: searchAreaId || undefined,
      district: searchDistrict || undefined,
      ward: searchWard || undefined,
      typeId: searchTypeId || undefined,
      minPrice: searchPriceIdx > 0 ? pr?.min : undefined,
      maxPrice: searchPriceIdx > 0 ? pr?.max : undefined,
    };
    const intent = parseSearchIntent(searchKeyword, { areas, districts: searchDistricts, wards: searchWards, propertyTypes: types }, explicit);
    const inferredListingType = intent.filters.listingType === 'mua_ban' || intent.filters.listingType === 'cho_thue' ? intent.filters.listingType : undefined;
    track(EVENTS.SEARCH, {
      listingType: inferredListingType ?? activeTab,
      hasKeyword: !!searchKeyword.trim(),
      hasArea: !!(searchAreaId || intent.filters.areaId),
      priceIdx: searchPriceIdx,
    });
    onNavigate({
      name: 'listings',
      listingType: inferredListingType ?? activeTab,
      areaId: searchAreaId || intent.filters.areaId,
      district: searchDistrict || intent.filters.district,
      ward: searchWard || intent.filters.ward,
      typeId: searchTypeId || intent.filters.typeId,
      keyword: searchKeyword || undefined,
      minPrice: searchPriceIdx > 0 ? pr?.min : intent.filters.minPrice,
      maxPrice: searchPriceIdx > 0 ? pr?.max : intent.filters.maxPrice,
    });
  };

  const goListings = (opts?: Partial<{ listingType: 'mua_ban' | 'cho_thue'; areaId: string; typeId: string; isFeatured: boolean; isHot: boolean }>) => {
    onNavigate({ name: 'listings', ...opts });
  };

  const renderSection = (id: string): React.ReactNode => {
    switch (id) {
      case 'hero': return null; // always rendered separately at the top
      case 'stats': return (
        <section key="stats" className="bg-red-600 text-white py-4">
          <div className="max-w-5xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {[
              { num: sec('stats')('stat1_number', '5.000+'), label: sec('stats')('stat1_label', 'Tin đăng') },
              { num: sec('stats')('stat2_number', '10.000+'), label: sec('stats')('stat2_label', 'Khách hàng tin tưởng') },
              { num: sec('stats')('stat3_number', '7 năm'), label: sec('stats')('stat3_label', 'Kinh nghiệm') },
              { num: sec('stats')('stat4_number', '3'), label: sec('stats')('stat4_label', 'Tỉnh phủ sóng') },
            ].map((s, i) => (
              <div key={i}>
                <p className="text-2xl font-black">{s.num}</p>
                <p className="text-red-100 text-xs">{s.label}</p>
              </div>
            ))}
          </div>
        </section>
      );
      case 'categories': return (
        <section key="categories" className="py-8 bg-white border-b border-gray-100">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
              {[1, 2, 3, 4, 5, 6].map((i) => {
                const g = sec('categories');
                const label = g(`cat${i}_label`, ['Nhà ở', 'Căn hộ', 'Đất nền', 'Đất nông nghiệp', 'Biệt thự', 'Văn phòng'][i - 1]);
                const iconName = g(`cat${i}_icon`, ['Home', 'Building2', 'MapPin', 'TrendingUp', 'Shield', 'Briefcase'][i - 1]);
                const cfg = {
                  listingType: g(`cat${i}_listing`, '') as 'mua_ban' | 'cho_thue' | '',
                  typeId: g(`cat${i}_type`, ''),
                  district: g(`cat${i}_district`, ''),
                  ward: g(`cat${i}_ward`, ''),
                  legal: g(`cat${i}_legal`, ''),
                };
                return (
                  <Link key={i} href={pageToHref(quickCategoryToPage(cfg))}
                    className="flex flex-col items-center gap-2 p-3 rounded-xl border border-gray-100 hover:border-red-400 hover:bg-red-50 transition-all group">
                    <div className="w-10 h-10 bg-red-50 group-hover:bg-red-100 rounded-full flex items-center justify-center text-red-600 transition-colors">
                      <CategoryIcon name={iconName} className="w-5 h-5" />
                    </div>
                    <span className="text-xs font-semibold text-gray-700 text-center leading-tight">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      );
      case 'for_you': return (
        <section key="for_you" className="pt-4 pb-2 bg-white">
          <div className="max-w-7xl mx-auto px-4">
            <ForYou />
          </div>
        </section>
      );
      case 'featured_sections': return (
        <React.Fragment key="featured_sections">
          {sections.map(({ section, properties }) => properties.length > 0 && (
            <section key={section.id} className="py-10 bg-gray-50">
              <div className="max-w-7xl mx-auto px-4">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h2 className="inline-block text-xl font-black text-gray-900">{section.title}</h2>
                    {section.subtitle && <p className="text-gray-500 text-sm mt-1">{section.subtitle}</p>}
                  </div>
                  <Link href={pageToHref({ name: 'listings', ...(section.filter_listing_type ? { listingType: section.filter_listing_type as 'mua_ban' | 'cho_thue' } : {}) })}
                    className="text-red-600 text-sm font-semibold hover:underline flex items-center gap-1">
                    Xem tất cả<ChevronRight className="w-4 h-4" />
                  </Link>
                </div>
                {section.display_style === 'horizontal' ? (
                  <div className="flex gap-4 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
                    {properties.map(p => (
                      <div key={p.id} className="flex-shrink-0 w-64 snap-start">
                        <PropertyCard property={p}
                          isFavorited={favoriteIds.has(p.id)}
                          onToggleFavorite={() => handleToggleFavorite(p.id)}
                          onContact={() => setContactProp(p)} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {properties.map(p => (
                      <PropertyCard key={p.id} property={p}
                        isFavorited={favoriteIds.has(p.id)}
                        onToggleFavorite={() => handleToggleFavorite(p.id)}
                        onContact={() => setContactProp(p)} />
                    ))}
                  </div>
                )}
              </div>
            </section>
          ))}
        </React.Fragment>
      );
      case 'region_banners': return (
        <section key="region_banners" className="py-10 bg-white">
          <div className="max-w-7xl mx-auto px-4">
            <h2 className="inline-block text-xl font-black text-gray-900 mb-6">{sec('region_banners')('title', 'Khám phá theo khu vực')}</h2>
            <div className="grid md:grid-cols-3 gap-4">
              {[
                { n: 1, dt: 'Bình Dương', ds: 'Thị trường chính – sôi động nhất', dd: 'Thủ Dầu Một, Dĩ An, Thuận An, Bến Cát, Tân Uyên...', db: 'Trọng tâm', color: 'from-red-600 to-red-700', di: 'https://images.pexels.com/photos/1732414/pexels-photo-1732414.jpeg', dslug: 'binh-duong' },
                { n: 2, dt: 'Bình Phước', ds: 'Tiềm năng – Giá tốt', dd: 'Đồng Xoài, Bình Long, Phước Long...', db: 'Tiềm năng', color: 'from-orange-500 to-orange-600', di: 'https://images.pexels.com/photos/2119714/pexels-photo-2119714.jpeg', dslug: 'binh-phuoc' },
                { n: 3, dt: 'Đồng Nai', ds: 'Khu vực mở rộng', dd: 'Biên Hòa, Long Thành, Nhơn Trạch...', db: 'Mở rộng', color: 'from-blue-600 to-blue-700', di: 'https://images.pexels.com/photos/280229/pexels-photo-280229.jpeg', dslug: 'dong-nai' },
              ].map((r) => {
                const title = sec('region_banners')(`region${r.n}_title`, r.dt);
                const subtitle = sec('region_banners')(`region${r.n}_subtitle`, r.ds);
                const desc = sec('region_banners')(`region${r.n}_desc`, r.dd);
                const badge = sec('region_banners')(`region${r.n}_badge`, r.db);
                const img = sec('region_banners')(`region${r.n}_image`, r.di);
                const slug = sec('region_banners')(`region${r.n}_slug`, r.dslug);
                const area = areas.find(a => a.name.toLowerCase().includes(title.toLowerCase().slice(0, 6)) || a.slug?.includes(slug));
                return (
                  <Link key={r.n} href={pageToHref({ name: 'listings', ...(area ? { areaId: area.id } : {}) })} className="relative rounded-2xl overflow-hidden h-44 group text-left w-full block">
                    <Image src={img} alt={title} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover group-hover:scale-105 transition-transform duration-500" />
                    <div className={`absolute inset-0 bg-gradient-to-t ${r.color} opacity-75 group-hover:opacity-85 transition-opacity`} />
                    <div className="absolute inset-0 p-5 flex flex-col justify-end">
                      <span className="text-[10px] bg-white/20 text-white font-bold px-2 py-0.5 rounded-full w-fit mb-2">{badge}</span>
                      <h3 className="text-white font-black text-xl">{title}</h3>
                      <p className="text-white/90 text-xs font-semibold">{subtitle}</p>
                      <p className="text-white/70 text-[11px] mt-0.5">{desc}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      );
      case 'why_us': return (
        <section key="why_us" className="py-12 bg-white">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-8">
              <h2 className="inline-block text-2xl font-black text-gray-900">{sec('why_us')('title', 'Tại sao chọn chúng tôi?')}</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { icon: <Shield className="w-6 h-6" />, title: sec('why_us')('f1_title', 'Uy tín – Chuyên nghiệp'), desc: sec('why_us')('f1_desc', 'Hơn 7 năm kinh nghiệm trong lĩnh vực BĐS tại Bình Dương') },
                { icon: <CheckCircle className="w-6 h-6" />, title: sec('why_us')('f2_title', 'Thông tin minh bạch'), desc: sec('why_us')('f2_desc', 'Mọi thông tin BĐS đều được xác thực và kiểm duyệt kỹ lưỡng') },
                { icon: <Phone className="w-6 h-6" />, title: sec('why_us')('f3_title', 'Hỗ trợ 24/7'), desc: sec('why_us')('f3_desc', 'Đội ngũ chuyên gia sẵn sàng tư vấn mọi lúc bạn cần') },
                { icon: <TrendingUp className="w-6 h-6" />, title: sec('why_us')('f4_title', 'Pháp lý an toàn'), desc: sec('why_us')('f4_desc', 'Hỗ trợ đầy đủ thủ tục pháp lý từ A đến Z') },
              ].map((f, i) => (
                <div key={i} className="text-center">
                  <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mx-auto mb-3">{f.icon}</div>
                  <h3 className="font-bold text-sm text-gray-900 mb-1.5">{f.title}</h3>
                  <p className="text-gray-500 text-xs leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      );
      case 'testimonials': return testimonials.length > 0 ? (
        <section key="testimonials" className="py-10 bg-gray-50">
          <div className="max-w-6xl mx-auto px-4">
            <div className="text-center mb-6">
              <h2 className="inline-block text-xl font-black text-gray-900">{sec('testimonials')('title', 'Khách hàng nói gì về chúng tôi')}</h2>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {testimonials.slice(0, secNum('testimonials', 'max_count', 3)).map(t => (
                <div key={t.id} className="bg-white rounded-xl p-5 shadow-sm border border-gray-100">
                  <div className="flex gap-0.5 mb-3">
                    {Array.from({ length: t.rating }).map((_, i) => <Star key={i} className="w-4 h-4 fill-amber-400 text-amber-400" />)}
                  </div>
                  <p className="text-gray-700 text-sm italic leading-relaxed mb-4">"{t.content}"</p>
                  <div className="flex items-center gap-2.5">
                    <div className="w-9 h-9 bg-red-100 rounded-full flex items-center justify-center">
                      <span className="text-red-600 font-bold text-sm">{t.name.charAt(0)}</span>
                    </div>
                    <div>
                      <p className="font-bold text-sm text-gray-900">{t.name}</p>
                      {t.location && <p className="text-gray-400 text-xs">{t.location}</p>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null;
      case 'news': return news.length > 0 ? (
        <section key="news" className="py-10 bg-white">
          <div className="max-w-7xl mx-auto px-4">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                  <Newspaper className="w-4 h-4 text-white" />
                </div>
                <h2 className="inline-block text-xl font-black text-gray-900">{sec('news')('title', 'Tin tức thị trường')}</h2>
              </div>
              <Link href={pageToHref({ name: 'news' })} className="text-red-600 text-sm font-semibold hover:underline flex items-center gap-1">
                {sec('news')('btn_view_all', 'Xem tất cả')}<ChevronRight className="w-4 h-4" />
              </Link>
            </div>
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
              {news.slice(0, secNum('news', 'max_count', 3)).map(a => (
                <Link key={a.id} href={pageToHref({ name: 'news', slug: a.slug ?? undefined, articleId: a.id })}
                  className="bg-white border border-gray-100 rounded-xl overflow-hidden hover:shadow-md transition-shadow text-left group block">
                  {a.image_url && (
                    <div className="relative overflow-hidden h-44 bg-gray-100">
                      <Image src={a.image_url} alt={buildNewsImageAlt(a)} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-contain group-hover:scale-105 transition-transform duration-500" />
                    </div>
                  )}
                  <div className="p-4">
                    <span className="text-[10px] bg-blue-50 text-blue-700 font-bold px-2 py-0.5 rounded">{a.category}</span>
                    <h3 className="font-bold text-sm text-gray-900 mt-2 line-clamp-2 group-hover:text-red-600 transition-colors">{a.title}</h3>
                    {a.excerpt && <p className="text-gray-500 text-xs mt-1.5 line-clamp-2">{a.excerpt}</p>}
                    <div className="flex items-center gap-3 text-gray-400 text-xs mt-3">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(a.created_at).toLocaleDateString('vi-VN')}</span>
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{a.views}</span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null;
      case 'faq': return (
        <section key="faq" className="py-12 bg-gray-50 border-t border-gray-100">
          <div className="max-w-3xl mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-black text-gray-900 text-center mb-2">{sec('faq')('title', 'Câu hỏi thường gặp')}</h2>
            <p className="text-gray-500 text-sm text-center mb-8">{sec('faq')('subtitle', 'Những điều bạn cần biết trước khi mua bán, cho thuê bất động sản')}</p>
            <div className="space-y-3">
              {FAQ_ITEMS.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <button onClick={() => setOpenFaq(open ? null : i)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                      aria-expanded={open}>
                      <span className="font-semibold text-gray-900 text-sm">{item.q}</span>
                      <ChevronDown className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} />
                    </button>
                    {open && <div className="px-5 pb-4 text-sm text-gray-600 leading-relaxed">{item.a}</div>}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      );
      case 'cta': return (
        <section key="cta" className="py-14 bg-gradient-to-r from-red-600 to-red-700 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-0 right-0 w-96 h-96 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
          </div>
          <div className="relative max-w-3xl mx-auto px-4 text-center text-white">
            <h2 className="text-2xl md:text-3xl font-black mb-3">{sec('cta')('title', 'Bạn có bất động sản cần bán hoặc cho thuê?')}</h2>
            <p className="text-red-100 mb-6 text-sm md:text-base">{sec('cta')('subtitle', 'Đăng tin miễn phí ngay hôm nay – tiếp cận hàng nghìn khách hàng tiềm năng')}</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button onClick={() => user ? onNavigate({ name: 'post-listing' }) : onShowAuth('register')}
                className="bg-white text-red-600 font-black px-8 py-3 rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-2">
                <ArrowRight className="w-4 h-4" />{sec('cta')('btn_post', 'Đăng tin ngay')}
              </button>
              <a href={`tel:${phone.replace(/\s/g, '')}`}
                className="border-2 border-white/50 text-white font-bold px-8 py-3 rounded-xl hover:bg-white/10 transition-colors flex items-center justify-center gap-2">
                <Phone className="w-4 h-4" />{phone}
              </a>
            </div>
          </div>
        </section>
      );
      case 'social_proof': return (
        <section key="social_proof" className="py-6 bg-white border-t border-gray-100">
          <div className="max-w-6xl mx-auto px-4 flex flex-wrap items-center justify-center gap-6 text-center">
            {[
              { icon: <Users className="w-5 h-5 text-emerald-600" />, text: sec('social_proof')('item1_text', 'Đăng ký miễn phí') },
              { icon: <Shield className="w-5 h-5 text-blue-600" />, text: sec('social_proof')('item2_text', 'Thông tin được xác thực') },
              { icon: <Phone className="w-5 h-5 text-orange-600" />, text: sec('social_proof')('item3_text', 'Hỗ trợ 7:00–21:00') },
              { icon: <CheckCircle className="w-5 h-5 text-red-600" />, text: sec('social_proof')('item4_text', 'Pháp lý rõ ràng') },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-2 text-sm text-gray-600">
                {item.icon}<span>{item.text}</span>
              </div>
            ))}
          </div>
        </section>
      );
      default: return null;
    }
  };

  const DEFAULT_SECTION_ORDER = ['stats', 'categories', 'for_you', 'featured_sections', 'region_banners', 'why_us', 'testimonials', 'news', 'faq', 'cta', 'social_proof'];
  const cmsOrder = pageLayout.filter(s => s.id !== 'hero' && s.is_visible).map(s => s.id);
  // FAQ là section mới thêm ở code, chưa có trong page_sections CMS. Nếu CMS chưa
  // có row 'faq' nào thì tự chèn (trước 'cta') để hiển thị mà không cần migration;
  // nếu admin đã thêm/ẩn row faq thì tôn trọng đúng cấu hình CMS.
  if (pageLayout.length > 0 && !pageLayout.some(s => s.id === 'faq')) {
    const at = cmsOrder.indexOf('cta');
    if (at >= 0) cmsOrder.splice(at, 0, 'faq'); else cmsOrder.push('faq');
  }
  // "Gợi ý dành cho bạn" cũng chưa có trong CMS. Auto-chèn ngay sau 'categories'
  // (đầu trang, dưới Danh mục nhanh) khi CMS chưa cấu hình row 'for_you'.
  if (pageLayout.length > 0 && !pageLayout.some(s => s.id === 'for_you')) {
    const at = cmsOrder.indexOf('categories');
    if (at >= 0) cmsOrder.splice(at + 1, 0, 'for_you'); else cmsOrder.unshift('for_you');
  }
  const orderedIds = pageLayout.length > 0 ? cmsOrder : DEFAULT_SECTION_ORDER;

  return (
    <div className="min-h-screen bg-white">
      <Header
        currentPage={{ name: 'home' }}
        onNavigate={onNavigate}
        user={user}
        areas={areas}
        onShowAuth={onShowAuth}
        onLogout={async () => { const { supabase } = await import('./lib/supabase'); await supabase.auth.signOut(); onNavigate({ name: 'home' }); }}
      />

      {/* ─── HERO (always first, not controlled by page builder) ─── */}
      <section className="relative min-h-[520px] flex items-center justify-center overflow-hidden pt-14">
        <div className="absolute inset-0">
          <Image src={heroBg} alt="hero" fill priority sizes="100vw" className="object-cover" />
          <div className="absolute inset-0 bg-gradient-to-b from-black/65 via-black/50 to-black/70" />
        </div>

        <div className="relative z-10 w-full max-w-5xl mx-auto px-4 py-12 text-center">
          <div className="inline-flex items-center gap-2 bg-red-600/80 text-white text-xs font-bold px-3 py-1.5 rounded-full mb-4">
            <MapPin className="w-3 h-3" />{sec('hero')('hero_label', 'Tập trung khu vực Bình Dương')}
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-white leading-tight mb-3">
            {sec('hero')('title', 'Tìm kiếm bất động sản tại Bình Dương')}
          </h1>
          <p className="text-white/80 text-sm md:text-base mb-8 max-w-2xl mx-auto">
            {sec('hero')('subtitle', 'Hơn 5.000 tin đăng nhà đất, căn hộ, đất nền uy tín tại Bình Dương, Bình Phước, Đồng Nai')}
          </p>

          {/* Search box */}
          <div className="bg-white rounded-2xl shadow-2xl p-3 max-w-3xl mx-auto">
            {/* Tabs */}
            <div className="flex gap-1 mb-3 bg-gray-100 rounded-xl p-1">
              {LISTING_TYPE_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setSearchPriceIdx(0); }}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === tab.key ? 'bg-red-600 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  {tab.key === 'mua_ban' ? sec('hero')('tab_buy', tab.label) : sec('hero')('tab_rent', tab.label)}
                </button>
              ))}
            </div>

            <div className="flex gap-2 flex-wrap">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={e => setSearchKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder={sec('hero')('search_placeholder', 'Tìm theo tên dự án, địa chỉ, khu vực...')}
                  className="w-full pl-9 pr-3 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                />
              </div>
              <select
                value={searchAreaId}
                onChange={e => { setSearchAreaId(e.target.value); setSearchDistrict(''); setSearchWard(''); }}
                className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white min-w-[130px]"
              >
                <option value="">Tất cả khu vực</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
              {searchDistricts.length > 0 && (
                <select
                  value={searchDistrict}
                  onChange={e => { setSearchDistrict(e.target.value); setSearchWard(''); }}
                  className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white min-w-[130px]"
                >
                  <option value="">Tất cả quận/huyện</option>
                  {searchDistricts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              )}
              {searchWards.length > 0 && (
                <select
                  value={searchWard}
                  onChange={e => setSearchWard(e.target.value)}
                  className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white min-w-[130px]"
                >
                  <option value="">Tất cả phường/xã</option>
                  {searchWards.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                </select>
              )}
              <select
                value={searchTypeId}
                onChange={e => setSearchTypeId(e.target.value)}
                className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white min-w-[130px]"
              >
                <option value="">Loại BĐS</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select
                value={searchPriceIdx}
                onChange={e => setSearchPriceIdx(Number(e.target.value))}
                aria-label="Khoảng giá"
                className="border border-gray-200 rounded-xl px-3 py-3 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-red-400 bg-white min-w-[130px]"
              >
                {(activeTab === 'cho_thue' ? PRICE_RANGES_RENT : PRICE_RANGES_SALE).map((r, i) => (
                  <option key={i} value={i}>{r.label}</option>
                ))}
              </select>
              <button
                onClick={handleSearch}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-3 rounded-xl transition-colors flex items-center gap-2 whitespace-nowrap"
              >
                <Search className="w-4 h-4" />
                {sec('hero')('btn_search', 'Tìm kiếm')}
              </button>
            </div>

            {/* Quick search pills */}
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              <span className="text-gray-400 text-xs">Tìm nhanh:</span>
              {areas.slice(0, 2).map(a => (
                <button key={a.id} onClick={() => goListings({ listingType: 'mua_ban', areaId: a.id })}
                  className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-600 hover:bg-red-100 transition-colors">
                  {a.name}
                </button>
              ))}
              {types.slice(0, 2).map(t => (
                <button key={t.id} onClick={() => goListings({ typeId: t.id })}
                  className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 transition-colors">
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── DYNAMIC SECTIONS (order + visibility from Page Builder) ─── */}
      {orderedIds.map(id => renderSection(id))}

      <Footer areas={areas} onNavigate={onNavigate} />
      <FloatingButtons onNavigate={onNavigate} />
      <ContactModal property={contactProp} onClose={() => setContactProp(null)} />
    </div>
  );
}

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="inline-block text-xl font-black text-gray-900">{title}</h2>
      {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
    </div>
  );
}

export function PropertyCard({ property: p, onContact, isFavorited = false, onToggleFavorite }: {
  property: Property; onContact: () => void;
  isFavorited?: boolean; onToggleFavorite?: () => void;
}) {
  return (
    <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg border border-gray-100 transition-all duration-300 group flex flex-col">
      <div className="relative overflow-hidden">
        <Link href={buildPropertyPath(p)} aria-label={p.title} className="absolute inset-0 z-[1]" />
        <div className="relative aspect-[4/3] bg-gray-100">
          <Image
            src={p.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'}
            alt={buildPropertyImageAlt(p)}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover group-hover:scale-105 transition-transform duration-500"
          />
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
          <span className="absolute top-2 right-8 bg-blue-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-sm">Cho thuê</span>
        )}
        {p.is_verified && (
          <span className="absolute bottom-2 left-2 z-[2] shadow-sm"><VerifiedBadge verified /></span>
        )}
        <button onClick={e => { e.stopPropagation(); onToggleFavorite?.(); }}
          className="absolute top-2 right-2 z-[2] w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow hover:scale-110 transition-transform">
          <svg className={`w-3.5 h-3.5 ${isFavorited ? 'fill-red-500 text-red-500' : 'text-gray-400'}`} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} fill="none">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
        <div className="absolute bottom-2 right-2 flex items-center gap-1 text-white/90 text-[10px]">
          <Eye className="w-3 h-3" />{p.views ?? 0}
        </div>
      </div>
      <div className="p-3.5 flex flex-col flex-1">
        <h3 className="mb-1.5">
          <Link href={buildPropertyPath(p)}
            className="text-gray-900 font-semibold text-sm leading-snug line-clamp-2 hover:text-red-600 transition-colors block">
            {p.title}
          </Link>
        </h3>
        <p className="text-red-600 font-black text-base">{p.price_label ?? `${p.price} ${p.price_unit}`}</p>
        <div className="flex items-center gap-2 text-xs text-gray-500 my-1 flex-wrap">
          {p.area_sqm && <span>{p.area_sqm} m²</span>}
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