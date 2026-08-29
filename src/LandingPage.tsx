'use client';
import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, MapPin, TrendingUp, Shield, Phone,
  Eye, Flame, Sparkles, Star, ArrowRight, ChevronRight, ChevronDown,
  CheckCircle, Users
} from 'lucide-react';
import { type Property } from './lib/supabase';
import { formatPropertyPrice } from './lib/listingPrice';
import {
  getTestimonials, getNews, getBanners,
  getFeaturedSections, getPropertiesForSection, getFavoriteIds, toggleFavorite,
  getPageLayout, buildPropertyPath, getNewsCategories,
} from './lib/api';
import { captureSignalFromProperty } from './lib/captureSignal';
import { useAreas, usePropertyTypes, useDistricts, useWards } from './lib/hooks/useTaxonomy';
import { PRICE_RANGES_SALE, PRICE_RANGES_RENT } from './lib/priceRange';
import { parseSearchIntent } from './lib/aiSearch';
import { hasEnoughSignal } from './lib/taste';
import { useTasteProfile } from './lib/hooks/useTasteProfile';
import { FAQ_ITEMS } from './lib/faq';
import { track, EVENTS } from './lib/analytics';
import { qk } from './lib/queryKeys';
import { type Page, pageToHref } from './lib/router';
import { NEWS_CATEGORIES } from './lib/newsCategories';
import { quickCategoryToPage } from './lib/quickCategory';
import { CategoryIcon } from './lib/categoryIcons';
import { useSetting } from './lib/cms';
import { ContactModal } from './components/ContactModal';
import { VerifiedBadge } from './components/VerifiedBadge';
import { ForYou } from './components/ForYou';
import { RecentlyViewed } from './components/RecentlyViewed';
import { Header, Footer, FloatingButtons } from './components/Layout';
import { BlurFillImage } from './components/BlurFillImage';
import { PropertyGallery } from './components/PropertyGallery';
import { HomeSectionEmpty, HomeSectionLoading, getHomeSectionDisplayConfig } from './components/HomeSectionState';
import { buildNewsImageAlt } from './lib/propertyImages';
import { getHomeDiscoveryOrder, type HomeDiscoveryAvailability, type HomeDiscoverySection } from './lib/discoveryJourney';
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
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  const [activeTab, setActiveTab] = useState<'mua_ban' | 'cho_thue'>('mua_ban');
  // Tab tin tức là chuỗi tự do vì danh mục nay đổ động từ news_categories (admin xoá/
  // thêm được). 'Tin tức' là tab "tất cả".
  const [activeNewsTab, setActiveNewsTab] = useState<string>('Tin tức');

  const phone = useSetting('phone_hotline', '0901 234 567');
  const { profile: tasteProfile, ready: tasteProfileReady } = useTasteProfile();

  // Taxonomy + dữ liệu trang chủ qua React Query (cache/dedup)
  const { data: areas = [] } = useAreas();
  const { data: types = [] } = usePropertyTypes();
  // Hero search cascade: Quận/Huyện theo tỉnh, Phường/Xã theo quận/huyện (district
  // lưu dạng TÊN nên map ra id để lấy wards).
  const { data: searchDistricts = [] } = useDistricts(searchAreaId || undefined);
  // Footer liệt kê quận/huyện của mọi tỉnh nên cần danh sách đầy đủ, khác cascade hero.
  const { data: allDistricts = [] } = useDistricts();
  const searchDistrictId = searchDistricts.find(d => d.name === searchDistrict)?.id;
  const { data: searchWards = [] } = useWards(searchDistrictId || undefined);
  const { data: testimonials = [] } = useQuery({ queryKey: qk.testimonials(), queryFn: getTestimonials });
  const { data: news = [] } = useQuery({ queryKey: qk.news(undefined, 20), queryFn: () => getNews(undefined, 20) });
  // Danh mục tin tức động từ DB (news_categories) — nguồn chân lý cho tab. Fallback
  // NEWS_CATEGORIES tĩnh khi chưa nạp. Xoá danh mục trong admin → tab tự biến mất.
  const { data: newsCategoryRows = [] } = useQuery({ queryKey: ['news-categories'], queryFn: () => getNewsCategories(), staleTime: 5 * 60_000 });
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
  const sectionConfig = (id: string) => {
    const settings = (pageLayout.find(s => s.id === id)?.settings ?? {}) as Record<string, unknown>;
    return getHomeSectionDisplayConfig(settings);
  };

  const favoriteMutation = useMutation({
    mutationFn: (p: Property) => toggleFavorite(p.id),
    onSuccess: (favorited, p) => {
      queryClient.invalidateQueries({ queryKey: qk.favoriteIds() });
      if (favorited) {
        captureSignalFromProperty('favorite', p);
        track(EVENTS.LISTING_SAVE, { listingId: p.id, source: 'landing' });
      }
    },
  });

  const handleToggleFavorite = (p: Property) => {
    if (!user) { onShowAuth('login'); return; }
    favoriteMutation.mutate(p);
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
      case 'categories': return (
        <section key="categories" className="border-b border-slate-100 bg-white py-10">
          <div className="max-w-7xl mx-auto px-4">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">Khám phá theo nhu cầu</p>
                <h2 className="mt-1 text-xl font-black text-slate-900">Loại hình bất động sản</h2>
              </div>
              <Link href={pageToHref({ name: 'listings' })} className="hidden items-center gap-1 text-sm font-bold text-red-700 hover:text-red-800 sm:flex">
                Xem tất cả<ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-3 gap-3 md:grid-cols-6">
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
                    className="group flex min-h-28 flex-col items-center justify-center gap-2 border border-slate-100 bg-white p-3 text-center transition-all hover:-translate-y-0.5 hover:border-red-200 hover:shadow-[var(--cnv-shadow-soft)]">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-red-50 to-amber-50 text-red-600 transition-colors group-hover:from-red-100 group-hover:to-amber-100">
                      <CategoryIcon name={iconName} className="h-5 w-5" />
                    </div>
                    <span className="text-xs font-bold leading-tight text-slate-700">{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>
      );
      case 'recently_viewed': return (
        <section key="recently_viewed" className="bg-white py-2">
          <div className="max-w-7xl mx-auto px-4">
            <RecentlyViewed
              title="Tiếp tục xem"
              subtitle="Những bất động sản bạn đã mở trên thiết bị này."
              surface="home"
              source="home_continue_browsing"
            />
          </div>
        </section>
      );
      case 'for_you': return (
        <section key="for_you" className="pt-4 pb-2 bg-white">
          <div className="max-w-7xl mx-auto px-4">
            <ForYou surface="home" source="home_for_you" />
          </div>
        </section>
      );
      case 'featured_sections': {
        const config = sectionConfig('featured_sections');
        const isLoading = featuredSections.length > 0 && sectionQueries.some(query => query.isLoading);

        if (isLoading) return (
          <section key="featured_sections_loading" className="bg-gray-50 py-10">
            <div className="max-w-7xl mx-auto px-4"><HomeSectionLoading /></div>
          </section>
        );

        if (sections.length === 0) {
          if (config.emptyBehavior !== 'empty_state') return null;
          return (
            <section key="featured_sections_empty" className="bg-gray-50 py-10">
              <div className="max-w-7xl mx-auto px-4"><HomeSectionEmpty config={config} /></div>
            </section>
          );
        }

        return (
          <React.Fragment key="featured_sections">
            {sections.map(({ section, properties }) => (
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
                        <div key={p.id} className="flex-shrink-0 w-[360px] sm:w-[380px] snap-start">
                          <PropertyCard property={p}
                            isFavorited={favoriteIds.has(p.id)}
                            onToggleFavorite={() => handleToggleFavorite(p)}
                            onContact={() => setContactProp(p)} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                      {properties.map(p => (
                        <PropertyCard key={p.id} property={p}
                          isFavorited={favoriteIds.has(p.id)}
                          onToggleFavorite={() => handleToggleFavorite(p)}
                          onContact={() => setContactProp(p)} />
                      ))}
                    </div>
                  )}
                </div>
              </section>
            ))}
          </React.Fragment>
        );
      }
      case 'region_banners': {
        const config = sectionConfig('region_banners');
        const regionCards = [
          { n: 1, dt: 'Bình Dương', ds: 'Thị trường trọng điểm', dd: 'Khám phá danh sách bất động sản đang hoạt động.', db: 'Trọng tâm', color: 'from-red-700 via-red-600 to-amber-500', di: 'https://images.pexels.com/photos/1732414/pexels-photo-1732414.jpeg', dslug: 'binh-duong' },
          { n: 2, dt: 'Bình Phước', ds: 'Khu vực tiềm năng', dd: 'Khám phá dữ liệu và tin đăng đã được xác thực.', db: 'Khám phá', color: 'from-amber-600 via-orange-500 to-red-500', di: 'https://images.pexels.com/photos/2119714/pexels-photo-2119714.jpeg', dslug: 'binh-phuoc' },
          { n: 3, dt: 'Đồng Nai', ds: 'Khu vực mở rộng', dd: 'Theo dõi các bất động sản phù hợp nhu cầu của bạn.', db: 'Mở rộng', color: 'from-slate-800 via-slate-700 to-red-800', di: 'https://images.pexels.com/photos/280229/pexels-photo-280229.jpeg', dslug: 'dong-nai' },
        ].map(r => {
          const title = sec('region_banners')(`region${r.n}_title`, r.dt);
          const slug = sec('region_banners')(`region${r.n}_slug`, r.dslug);
          const area = areas.find(item => item.slug === slug || item.name.toLocaleLowerCase('vi-VN') === title.toLocaleLowerCase('vi-VN'));
          return area ? {
            ...r,
            area,
            title,
            subtitle: sec('region_banners')(`region${r.n}_subtitle`, r.ds),
            desc: sec('region_banners')(`region${r.n}_desc`, r.dd),
            badge: sec('region_banners')(`region${r.n}_badge`, r.db),
            image: sec('region_banners')(`region${r.n}_image`, r.di),
          } : null;
        }).filter((card): card is NonNullable<typeof card> => card !== null);

        if (regionCards.length === 0) {
          if (config.emptyBehavior !== 'empty_state') return null;
          return (
            <section key="region_banners_empty" className="bg-white py-10">
              <div className="max-w-7xl mx-auto px-4"><HomeSectionEmpty config={config} /></div>
            </section>
          );
        }

        return (
          <section key="region_banners" className="bg-white py-12">
            <div className="max-w-7xl mx-auto px-4">
              <div className="mb-6 flex items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-red-600">Theo khu vực</p>
                  <h2 className="mt-1 text-xl font-black text-slate-900">{sec('region_banners')('title', 'Khám phá theo khu vực')}</h2>
                </div>
                <Link href={pageToHref({ name: 'regions' })} className="hidden items-center gap-1 text-sm font-bold text-red-700 hover:text-red-800 sm:flex">
                  Xem tất cả khu vực<ChevronRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="grid gap-4 md:grid-cols-3">
                {regionCards.map(card => (
                  <Link key={card.area.id} href={pageToHref({ name: 'listings', areaId: card.area.id })} className="group relative block h-52 overflow-hidden text-left">
                    <Image src={card.image} alt={card.title} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover transition-transform duration-500 group-hover:scale-105" />
                    <div className={`absolute inset-0 bg-gradient-to-t ${card.color} opacity-80 transition-opacity group-hover:opacity-90`} />
                    <div className="absolute inset-0 flex flex-col justify-end p-5">
                      <span className="mb-2 w-fit border border-white/25 bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white backdrop-blur">{card.badge}</span>
                      <h3 className="text-xl font-black text-white">{card.title}</h3>
                      <p className="mt-1 text-xs font-semibold text-white/90">{card.subtitle}</p>
                      <p className="mt-1 text-[11px] leading-4 text-white/70">{card.desc}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          </section>
        );
      }
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
      case 'testimonials': {
        const config = sectionConfig('testimonials');
        if (testimonials.length === 0) {
          if (config.emptyBehavior !== 'empty_state') return null;
          return (
            <section key="testimonials_empty" className="py-10 bg-gray-50">
              <div className="max-w-6xl mx-auto px-4"><HomeSectionEmpty config={config} /></div>
            </section>
          );
        }

        return (
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
        );
      }
      case 'news': {
        const config = sectionConfig('news');
        if (news.length === 0) {
          if (config.emptyBehavior !== 'empty_state') return null;
          return (
            <section key="news_empty" className="py-10 bg-white">
              <div className="max-w-7xl mx-auto px-4"><HomeSectionEmpty config={config} /></div>
            </section>
          );
        }

        // Nhãn động theo order_index (fallback tĩnh khi DB chưa nạp). Nếu tab đang chọn
        // đã bị xoá khỏi DB thì coi như 'Tin tức' để không lọc ra danh sách rỗng.
        const newsCategoryLabels = newsCategoryRows.length
          ? newsCategoryRows.map(r => r.label)
          : [...NEWS_CATEGORIES];
        const newsTabs = ['Tin tức', ...newsCategoryLabels];
        const effectiveNewsTab = newsTabs.includes(activeNewsTab) ? activeNewsTab : 'Tin tức';
        const currentNews = effectiveNewsTab === 'Tin tức'
          ? news
          : news.filter(article => article.category === effectiveNewsTab);
        const leadNews = currentNews[0];
        const highlightNews = currentNews.slice(1, 5);
        const visibleNewsIds = new Set([leadNews, ...highlightNews].filter(Boolean).map(article => article.id));
        const popularNews = currentNews
          .filter(article => !visibleNewsIds.has(article.id))
          .sort((a, b) => b.views - a.views)
          .slice(0, 5);
        const newsHref = (article: typeof news[number]) =>
          pageToHref({ name: 'news', slug: article.slug ?? undefined, articleId: article.id });
        const allNewsHref = pageToHref({
          name: 'news',
          category: effectiveNewsTab === 'Tin tức' ? undefined : effectiveNewsTab,
        });

        return (
          <section key="news" className="bg-white py-12 md:py-16">
            <div className="max-w-7xl mx-auto px-4">
              <div className="mb-8 text-center">
                <div className="mb-3 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-red-600">
                  <span className="h-7 w-1 rounded-full bg-red-600" />
                  Tin tức bất động sản
                  <span className="h-7 w-1 rounded-full bg-red-600" />
                </div>
                <h2 className="text-3xl font-black tracking-tight text-gray-900 md:text-4xl">
                  {sec('news')('title', 'Cập nhật thị trường')}
                </h2>
                <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-500 md:text-base">
                  Những thông tin mới nhất về thị trường bất động sản Việt Nam
                </p>
              </div>

              <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(250px,0.9fr)] lg:items-start">
                <div className="order-2 min-w-0 lg:order-1">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-xl font-black text-gray-900">Tin nổi bật</h3>
                    <Link href={allNewsHref} className="flex items-center gap-1 text-sm font-semibold text-red-600 hover:underline">
                      Xem tất cả <ChevronRight className="h-4 w-4" />
                    </Link>
                  </div>
                  <div className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white px-3 shadow-sm">
                    {highlightNews.map(article => (
                      <Link key={article.id} href={newsHref(article)} className="group flex gap-3 py-3 text-left">
                        <div className="h-[4.5rem] w-24 shrink-0 overflow-hidden rounded-lg bg-gray-100">
                          {article.image_url && <BlurFillImage src={article.image_url} alt={buildNewsImageAlt(article)} sizes="96px" wrapperClassName="h-full w-full" />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="line-clamp-2 text-sm font-bold leading-snug text-gray-900 transition-colors group-hover:text-red-600">{article.title}</h4>
                          <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-gray-400">
                            <span>{new Date(article.created_at).toLocaleDateString('vi-VN')}</span>
                            <span>•</span>
                            <span>{Math.max(1, Math.round((article.content ?? article.excerpt ?? '').split(/\s+/).length / 200))} phút đọc</span>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>

                <div className="order-1 min-w-0 lg:order-2">
                  <div className="mb-4 flex min-w-0 items-center justify-center">
                    <div className="inline-flex min-w-0 max-w-full overflow-x-auto rounded-xl border border-gray-200 bg-gray-50 p-1 text-sm font-semibold text-gray-500">
                      {newsTabs.map(tab => (
                        <button
                          key={tab}
                          type="button"
                          aria-pressed={effectiveNewsTab === tab}
                          onClick={() => setActiveNewsTab(tab)}
                          className={`shrink-0 rounded-lg px-4 py-2 transition-colors focus:outline-none focus:ring-2 focus:ring-red-200 ${effectiveNewsTab === tab ? 'bg-white text-red-600 shadow-sm' : 'hover:text-red-600'}`}
                        >
                          {tab}
                        </button>
                      ))}
                    </div>
                  </div>
                  {leadNews ? (
                    <Link href={newsHref(leadNews)} className="group block overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm transition-shadow hover:shadow-xl">
                      <div className="relative h-64 overflow-hidden md:h-72">
                        {leadNews.image_url && <BlurFillImage src={leadNews.image_url} alt={buildNewsImageAlt(leadNews)} sizes="(max-width: 768px) 100vw, 50vw" wrapperClassName="h-full w-full" />}
                        <div className="absolute left-4 top-4 rounded bg-red-600 px-2 py-1 text-[10px] font-bold uppercase text-white">{leadNews.category || 'Tin tức'}</div>
                      </div>
                      <div className="p-5">
                        <h3 className="line-clamp-3 text-xl font-black leading-tight text-gray-900 transition-colors group-hover:text-red-600 md:text-2xl">{leadNews.title}</h3>
                        <div className="mt-3 flex items-center gap-3 text-xs text-gray-400">
                          <span>{new Date(leadNews.created_at).toLocaleDateString('vi-VN')}</span>
                          <span>•</span>
                          <span>{Math.max(1, Math.round((leadNews.content ?? leadNews.excerpt ?? '').split(/\s+/).length / 200))} phút đọc</span>
                        </div>
                      </div>
                      {leadNews.excerpt && <p className="line-clamp-2 px-5 py-4 text-sm leading-relaxed text-gray-600">{leadNews.excerpt}</p>}
                    </Link>
                  ) : (
                    <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                      Chưa có bài viết trong danh mục này.
                    </div>
                  )}
                </div>

                <div className="order-3 min-w-0">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-xl font-black text-gray-900">Đọc nhiều nhất</h3>
                    <Eye className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white px-4 shadow-sm">
                    {popularNews.map((article, index) => (
                      <Link key={article.id} href={newsHref(article)} className="group flex gap-3 py-3 text-left">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black ${index === 0 ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{index + 1}</span>
                        <div className="min-w-0">
                          <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-gray-800 transition-colors group-hover:text-red-600">{article.title}</h4>
                          <span className="mt-1 flex items-center gap-1 text-[11px] text-gray-400"><Eye className="h-3 w-3" />{article.views.toLocaleString('vi-VN')} lượt xem</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        );
      }
      case 'faq': return (
        <section key="faq" className="py-12 bg-gray-50 border-t border-gray-100">
          <div className="max-w-6xl mx-auto px-4">
            <h2 className="text-2xl md:text-3xl font-black text-gray-900 text-center mb-2">{sec('faq')('title', 'Câu hỏi thường gặp')}</h2>
            <p className="text-gray-500 text-sm text-center mb-8">{sec('faq')('subtitle', 'Những điều bạn cần biết trước khi mua bán, cho thuê bất động sản')}</p>
            {/* items-start: câu mở rộng chỉ kéo dài thẻ của nó, không kéo giãn thẻ bên cạnh. */}
            <div data-testid="faq-grid" className="grid items-start gap-4 md:grid-cols-2 md:gap-x-6">
              {FAQ_ITEMS.map((item, i) => {
                const open = openFaq === i;
                return (
                  <div key={i} data-testid="faq-item" className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
                    <button onClick={() => setOpenFaq(open ? null : i)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
                      aria-expanded={open}>
                      <span className="font-semibold text-gray-900 text-[15px] leading-6">{item.q}</span>
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-50 border border-gray-100">
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </span>
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

  const DEFAULT_SECTION_ORDER: HomeDiscoverySection[] = ['categories', 'recently_viewed', 'featured_sections', 'region_banners', 'for_you', 'news', 'why_us', 'testimonials', 'faq', 'cta', 'social_proof'];
  const cmsOrder = pageLayout.filter(s => s.id !== 'hero' && s.is_visible).map(s => s.id as HomeDiscoverySection);
  // FAQ là section mới thêm ở code, chưa có trong page_sections CMS. Nếu CMS chưa
  // có row 'faq' nào thì tự chèn (trước 'cta') để hiển thị mà không cần migration;
  // nếu admin đã thêm/ẩn row faq thì tôn trọng đúng cấu hình CMS.
  if (pageLayout.length > 0 && !pageLayout.some(s => s.id === 'faq')) {
    const at = cmsOrder.indexOf('cta');
    if (at >= 0) cmsOrder.splice(at, 0, 'faq'); else cmsOrder.push('faq');
  }
  // “Tiếp tục xem” cũng là rail client-only. Auto-chèn ngay sau category khi CMS
  // chưa có row riêng; không có local history thì component tự ẩn hoàn toàn.
  if (pageLayout.length > 0 && !pageLayout.some(s => s.id === 'recently_viewed')) {
    const at = cmsOrder.indexOf('categories');
    if (at >= 0) cmsOrder.splice(at + 1, 0, 'recently_viewed'); else cmsOrder.unshift('recently_viewed');
  }
  // “Gợi ý dành cho bạn” chỉ xuất hiện khi đủ tín hiệu; đặt sau các điểm vào dữ liệu
  // thật để khách mới vẫn có hành trình khám phá rõ ràng mà không có rail trống.
  if (pageLayout.length > 0 && !pageLayout.some(s => s.id === 'for_you')) {
    const regionAt = cmsOrder.indexOf('region_banners');
    const featuredAt = cmsOrder.indexOf('featured_sections');
    const at = regionAt >= 0 ? regionAt : featuredAt;
    if (at >= 0) cmsOrder.splice(at + 1, 0, 'for_you'); else cmsOrder.push('for_you');
  }
  const [hasRecentlyViewed, setHasRecentlyViewed] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem('dtp_recently_viewed');
      setHasRecentlyViewed(!!raw && JSON.parse(raw).length > 0);
    } catch {
      setHasRecentlyViewed(false);
    }
  }, []);
  const hasEnoughTasteSignal = tasteProfileReady && hasEnoughSignal(tasteProfile);
  const availability: HomeDiscoveryAvailability = {
    featured_sections: featuredSections.length > 0 || sectionQueries.some(query => query.isLoading),
    region_banners: areas.length > 0,
    news: news.length > 0,
    testimonials: testimonials.length > 0,
  };
  const configuredOrder = pageLayout.length > 0 ? cmsOrder : DEFAULT_SECTION_ORDER;
  const orderedIds = getHomeDiscoveryOrder({
    configuredOrder,
    availability,
    hasRecentlyViewed,
    hasEnoughTasteSignal,
  });

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
      <section className="relative flex min-h-[520px] items-center justify-center overflow-hidden pt-14 md:min-h-[600px]">
        <div className="absolute inset-0">
          <Image src={heroBg} alt="hero" fill priority sizes="100vw" className="object-cover animate-hero-zoom" />
          {/* Overlay mỏng để ảnh bìa sáng rõ. Ảnh do admin tải nên độ sáng không đoán
              trước — chữ dựa vào drop-shadow thay vì dựa vào nền tối. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/15 to-black/30" />
        </div>

        <div className="relative z-10 w-full max-w-5xl mx-auto px-4 py-12 text-center">
          <div className="inline-flex items-center gap-2 bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full mb-4 shadow-lg shadow-black/20">
            <MapPin className="w-3 h-3" />{sec('hero')('hero_label', 'Tập trung khu vực Bình Dương')}
          </div>
          <h1 className="text-3xl md:text-5xl font-black text-white leading-tight mb-3 drop-shadow-[0_2px_14px_rgba(0,0,0,0.9)]">
            {sec('hero')('title', 'Tìm kiếm bất động sản tại Bình Dương')}
          </h1>
          <p className="text-white/95 text-sm md:text-base mb-8 max-w-2xl mx-auto drop-shadow-[0_1px_10px_rgba(0,0,0,0.85)]">
            {sec('hero')('subtitle', 'Hơn 5.000 tin đăng nhà đất, căn hộ, đất nền uy tín tại Bình Dương, Bình Phước, Đồng Nai')}
          </p>

          {/* Search box */}
          <div className="mx-auto max-w-4xl rounded-2xl bg-white p-3 shadow-card md:p-4">
            {/* Tabs kiểu gạch chân — nhẹ hơn khay xám, hợp tông sáng */}
            <div className="mb-3 flex items-center gap-6 border-b border-gray-100 px-1 md:mb-4">
              {LISTING_TYPE_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setSearchPriceIdx(0); }}
                  className={`pb-3 text-[15px] font-bold border-b-2 -mb-px transition-colors ${activeTab === tab.key ? 'text-red-600 border-red-600' : 'text-slate-600 border-transparent hover:text-red-600'}`}
                >
                  {tab.key === 'mua_ban' ? sec('hero')('tab_buy', tab.label) : sec('hero')('tab_rent', tab.label)}
                </button>
              ))}
            </div>

            <div className="space-y-2.5 md:flex md:items-stretch md:gap-2.5 md:space-y-0">
              <div className="group relative min-w-0 bg-gray-50 transition-colors focus-within:border-red-500 focus-within:bg-white md:flex-[1.5]">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400 group-focus-within:text-red-500" />
                <input
                  type="text"
                  value={searchKeyword}
                  onChange={e => setSearchKeyword(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSearch()}
                  placeholder={sec('hero')('search_placeholder', 'Tìm theo tên dự án, địa chỉ, khu vực...')}
                  className="h-12 w-full rounded-xl border border-gray-200 bg-transparent pl-11 pr-3 text-base font-medium text-gray-800 outline-none placeholder:text-sm placeholder:font-normal placeholder:text-gray-500 focus:border-red-500 focus:ring-2 focus:ring-red-100 md:text-[15px]"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5 md:contents">
                <div className="relative min-w-0">
                  <select
                    value={searchAreaId}
                    onChange={e => { setSearchAreaId(e.target.value); setSearchDistrict(''); setSearchWard(''); }}
                    aria-label="Khu vực"
                    className="h-12 w-full min-w-0 appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3 pr-9 text-sm font-medium text-gray-700 outline-none transition-colors focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100 md:min-w-[140px] md:text-[15px]"
                  >
                    <option value="">Khu vực</option>
                    {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
                <div className="relative min-w-0">
                  <select
                    value={searchTypeId}
                    onChange={e => setSearchTypeId(e.target.value)}
                    aria-label="Loại bất động sản"
                    className="h-12 w-full min-w-0 appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3 pr-9 text-sm font-medium text-gray-700 outline-none transition-colors focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100 md:min-w-[140px] md:text-[15px]"
                  >
                    <option value="">Loại BĐS</option>
                    {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                </div>
              </div>
              <button
                onClick={handleSearch}
                className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-[15px] font-bold text-white transition-colors hover:bg-red-700 md:w-[140px] md:shrink-0"
              >
                <Search className="h-4 w-4" />
                {sec('hero')('btn_search', 'Tìm kiếm')}
              </button>
            </div>

            {/* Giá + cấp hành chính là tiêu chí phụ ở mobile; desktop vẫn hiện ngay dưới hàng chính. */}
            <div className="mt-2.5">
              {(showMoreFilters || searchPriceIdx > 0 || searchDistrict || searchWard) ? (
                <div className="grid gap-2.5 sm:grid-cols-2 md:flex md:gap-2.5">
                  <div className="relative min-w-0 md:flex-1">
                    <select
                      value={searchPriceIdx}
                      onChange={e => setSearchPriceIdx(Number(e.target.value))}
                      aria-label="Khoảng giá"
                      className="h-11 w-full min-w-0 appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3 pr-9 text-sm font-medium text-gray-700 outline-none transition-colors focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100"
                    >
                      {(activeTab === 'cho_thue' ? PRICE_RANGES_RENT : PRICE_RANGES_SALE).map((r, i) => (
                        <option key={i} value={i}>{r.label}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>
                  {searchDistricts.length > 0 && <div className="relative min-w-0 md:flex-1">
                    <select
                      value={searchDistrict}
                      onChange={e => { setSearchDistrict(e.target.value); setSearchWard(''); }}
                      aria-label="Quận/Huyện"
                      className="h-11 w-full min-w-0 appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3 pr-9 text-sm font-medium text-gray-700 outline-none transition-colors focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100"
                    >
                      <option value="">Quận/Huyện</option>
                      {searchDistricts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>}
                  {searchWards.length > 0 && <div className="relative min-w-0 md:flex-1">
                    <select
                      value={searchWard}
                      onChange={e => setSearchWard(e.target.value)}
                      aria-label="Phường/Xã"
                      className="h-11 w-full min-w-0 appearance-none rounded-xl border border-gray-200 bg-gray-50 px-3 pr-9 text-sm font-medium text-gray-700 outline-none transition-colors focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-100"
                    >
                      <option value="">Phường/Xã</option>
                      {searchWards.map(w => <option key={w.id} value={w.name}>{w.name}</option>)}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                  </div>}
                </div>
              ) : (
                <button
                  onClick={() => setShowMoreFilters(true)}
                  className="mx-auto flex min-h-9 items-center gap-1.5 px-2 text-xs font-semibold text-red-600 transition-colors hover:text-red-700"
                >
                  <ChevronDown className="h-3.5 w-3.5" />Thêm tiêu chí: giá, quận/huyện
                </button>
              )}
            </div>

            {/* Quick search pills */}
            <div className="flex items-center gap-2 mt-3 flex-wrap">
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

      <Footer areas={areas} districts={allDistricts} propertyTypes={types} onNavigate={onNavigate} />
      <FloatingButtons onNavigate={onNavigate} />
      <ContactModal property={contactProp} onClose={() => setContactProp(null)}
        onSubmitted={() => { if (contactProp) captureSignalFromProperty('contact', contactProp); }} />
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
    <div className="bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-lg border border-gray-100 transition-all duration-300 group flex flex-row sm:flex-col">
      <PropertyGallery
        property={p}
        href={buildPropertyPath(p)}
        sizes="(max-width: 768px) 100vw, (max-width: 1280px) 33vw, 25vw"
        topLeft={p.badge ? (
          <span className={`absolute left-2 top-2 z-[2] rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white ${p.badge_color === 'green' ? 'bg-emerald-500' : p.badge_color === 'blue' ? 'bg-blue-500' : 'bg-red-500'}`}>{p.badge}</span>
        ) : p.is_hot ? (
          <span className="absolute left-2 top-2 z-[2] flex items-center gap-0.5 rounded-md bg-orange-500 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white"><Flame className="h-2.5 w-2.5" />HOT</span>
        ) : p.is_featured ? (
          <span className="absolute left-2 top-2 z-[2] flex items-center gap-0.5 rounded-md bg-amber-500 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white"><Sparkles className="h-2.5 w-2.5" />Nổi bật</span>
        ) : undefined}
        bottomLeft={<span className="absolute bottom-2 left-2 z-[2] shadow-sm"><VerifiedBadge property={p} /></span>}
        topRight={(
          <>
            {p.listing_type === 'cho_thue' && <span className="rounded-md bg-blue-600/90 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-white">Cho thuê</span>}
            <span className="inline-flex items-center gap-1 rounded-md bg-black/50 px-2 py-1 text-[10px] font-semibold text-white"><Eye className="h-3 w-3" />{p.views ?? 0}</span>
          </>
        )}
        showTotalPriceLabel={p.listing_type !== 'cho_thue'}
        isFavorited={isFavorited}
        onToggleFavorite={onToggleFavorite}
        mobileList
      />
      <div className="min-w-0 p-3.5 flex flex-col flex-1">
        <h3 className="mb-1.5">
          <Link href={buildPropertyPath(p)}
            className="text-gray-900 font-semibold text-sm leading-snug line-clamp-2 hover:text-red-600 transition-colors block">
            {p.title}
          </Link>
        </h3>
        <p className="text-red-600 font-black text-base">{formatPropertyPrice(p)}</p>
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