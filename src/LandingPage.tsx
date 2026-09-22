'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useQuery, useQueries, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Search, MapPin, TrendingUp, Shield, Phone,
  Eye, Star, ArrowRight, ChevronRight, ChevronDown,
  CheckCircle, Users
} from 'lucide-react';
import { type Property } from './lib/supabase';
import {
  getTestimonials, getNews, getBanners,
  getFeaturedSections, getPropertiesForSection, getFavoriteIds, toggleFavorite,
  getPageLayout, buildPropertyPath, getNewsCategories,
  getAllProperties,} from './lib/api';
import { captureSignalFromProperty } from './lib/captureSignal';
import { useAreas, usePropertyTypes, useDistricts, useWards } from './lib/hooks/useTaxonomy';
import { PRICE_RANGES_SALE, PRICE_RANGES_RENT } from './lib/priceRange';
import { parseSearchIntent } from './lib/aiSearch';
import { buildHomepageListingTarget } from './lib/listingSearchState';
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
import { ForYou } from './components/ForYou';
import { PropertyTimeline } from './components/PropertyTimeline';
import { LocationDiscovery } from './components/home/LocationDiscovery';
import { getHomepageSectionOrder } from './lib/homeSectionOrder';
import { Header, Footer, FloatingButtons } from './components/Layout';
import { BlurFillImage } from './components/BlurFillImage';
import { PropertyCard as UnifiedPropertyCard } from './components/property/PropertyCard';
import { HomeSectionEmpty, HomeSectionLoading, getHomeSectionDisplayConfig } from './components/HomeSectionState';
import { buildNewsImageAlt } from './lib/propertyImages';
import { dedupeFeaturedSectionProperties } from './lib/featuredSectionDedupe';
import { getHomeDiscoveryOrder, type HomeDiscoveryAvailability } from './lib/discoveryJourney';
import { buildTruthfulHeroSubtitle } from './lib/homeTruthfulCopy';
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

type HomeAtmosphereVariant = 'soft' | 'warm' | 'ambient';

function HomeSectionAtmosphere({ variant }: { variant: HomeAtmosphereVariant }) {
  const primary = variant === 'soft'
    ? 'bg-slate-200/45'
    : variant === 'warm'
      ? 'bg-red-200/35'
      : 'bg-red-100/35';
  const secondary = variant === 'soft'
    ? 'bg-amber-100/25'
    : variant === 'warm'
      ? 'bg-amber-200/30'
      : 'bg-amber-100/20';

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className={`absolute -right-24 -top-28 h-72 w-72 rounded-full blur-3xl ${primary}`} />
      <div className={`absolute -bottom-32 -left-24 h-72 w-72 rounded-full blur-3xl ${secondary}`} />
    </div>
  );
}

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
  const supportHours = useSetting('support_hours', 'Hỗ trợ 7:00 – 21:00');
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
  const homeNewsCategoryLabels = newsCategoryRows.length
    ? newsCategoryRows.map(row => row.label)
    : [...NEWS_CATEGORIES];
  const homeNewsTabs = ['Tin tức', ...homeNewsCategoryLabels];
  const effectiveNewsTab = homeNewsTabs.includes(activeNewsTab) ? activeNewsTab : 'Tin tức';
  const selectedNewsCategory = effectiveNewsTab === 'Tin tức' ? undefined : effectiveNewsTab;
  const { data: selectedCategoryNews = [] } = useQuery({
    queryKey: qk.news(selectedNewsCategory, 20),
    queryFn: () => getNews(selectedNewsCategory, 20),
    enabled: Boolean(selectedNewsCategory),
    staleTime: 5 * 60_000,
  });
  const layoutQuery = useQuery({ queryKey: qk.pageLayout(), queryFn: getPageLayout });
  const pageLayout = layoutQuery.data ?? [];
  const { data: heroBanners = [] } = useQuery({ queryKey: qk.banners('hero'), queryFn: () => getBanners('hero') });
  const [activeHeroIndex, setActiveHeroIndex] = useState(0);
  const [heroInputFocused, setHeroInputFocused] = useState(false);
  const [heroControlsFocused, setHeroControlsFocused] = useState(false);
  const [heroControlsHovered, setHeroControlsHovered] = useState(false);
  const [heroDocumentHidden, setHeroDocumentHidden] = useState(false);
  const [heroMotionAllowed, setHeroMotionAllowed] = useState(true);
  const heroStartedAt = useRef<number | null>(null);
  const heroElapsed = useRef(0);
  const previousHeroIndex = useRef(activeHeroIndex);
  const heroPaused = heroInputFocused || heroControlsFocused || heroControlsHovered || heroDocumentHidden;
  useEffect(() => {
    const update = () => setHeroDocumentHidden(document.hidden);
    update();
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: no-preference)');
    const update = () => setHeroMotionAllowed(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  const activeHero = heroBanners[activeHeroIndex] ?? heroBanners[0];
  useEffect(() => {
    if (heroBanners.length > 0 && activeHeroIndex >= heroBanners.length) setActiveHeroIndex(0);
  }, [activeHeroIndex, heroBanners.length]);
  const heroBg = activeHero?.image_url || 'https://images.pexels.com/photos/1396122/pexels-photo-1396122.jpeg';
  useEffect(() => {
    if (previousHeroIndex.current !== activeHeroIndex) {
      previousHeroIndex.current = activeHeroIndex;
      heroElapsed.current = 0;
    }
    if (!heroMotionAllowed) { heroElapsed.current = 0; return; }
    if (heroBanners.length < 2 || heroPaused) return;
    heroStartedAt.current = Date.now();
    const timer = window.setTimeout(() => {
      heroStartedAt.current = null;
      heroElapsed.current = 0;
      setActiveHeroIndex(index => (index + 1) % heroBanners.length);
    }, Math.max(0, 7000 - heroElapsed.current));
    return () => {
      window.clearTimeout(timer);
      if (heroStartedAt.current !== null) {
        heroElapsed.current = Math.min(7000, heroElapsed.current + Date.now() - heroStartedAt.current);
        heroStartedAt.current = null;
      }
    };
  }, [heroBanners.length, activeHeroIndex, heroPaused, heroMotionAllowed]);

  const { data: featuredSections = [] } = useQuery({ queryKey: qk.featuredSections(), queryFn: getFeaturedSections });
  const { data: activeListingCount } = useQuery({
    queryKey: ['active-listing-count'],
    queryFn: async () => (await getAllProperties({ limit: 1 })).total,
    staleTime: 60_000,
  });

  // Per-section properties: 1 query mỗi section, chạy khi featuredSections có
  const sectionQueries = useQueries({
    queries: featuredSections.map((s) => ({
      queryKey: qk.sectionProperties(s.id),
      queryFn: () => getPropertiesForSection(s),
    })),
  });
  const sections = dedupeFeaturedSectionProperties(featuredSections
    .map((section, i) => ({ section, properties: (sectionQueries[i]?.data ?? []) as Property[] }))
    .filter((r) => r.properties.length > 0));

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
    onNavigate(buildHomepageListingTarget({
      activeTab,
      explicit,
      intent,
    }));
  };

  const goListings = (opts?: Partial<{ listingType: 'mua_ban' | 'cho_thue'; areaId: string; typeId: string; isFeatured: boolean; isHot: boolean }>) => {
    onNavigate({ name: 'listings', ...opts });
  };

  const renderSection = (id: string): React.ReactNode => {
    switch (id) {
      case 'hero': return null; // always rendered separately at the top
      case 'categories': return (
        <section key="categories" className="relative isolate overflow-hidden border-b border-slate-100 bg-slate-50 py-10">
          <HomeSectionAtmosphere variant="soft" />
          <div className="relative z-10 mx-auto max-w-7xl rounded-3xl border border-slate-200/80 bg-white/80 px-4 py-8 shadow-sm backdrop-blur-sm">
            <div className="mb-6 flex items-end justify-between gap-4">
              <div>
                <p className="cnv-eyebrow text-red-600">Khám phá theo nhu cầu</p>
                <h2 className="cnv-section-title mt-1 text-slate-900">Loại hình bất động sản</h2>
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
      case 'timeline': return <PropertyTimeline key="timeline" />;
      case 'for_you': return (
        <section key="for_you" className="relative isolate overflow-hidden bg-gradient-to-br from-white via-red-50/30 to-amber-50/20 pt-4 pb-2">
          <HomeSectionAtmosphere variant="warm" />
          <div className="relative z-10 max-w-7xl mx-auto px-4">
            <ForYou surface="home" source="home_for_you" />
          </div>
        </section>
      );
      case 'featured_sections': {
        const config = sectionConfig('featured_sections');
        const isLoading = featuredSections.length > 0 && sectionQueries.some(query => query.isLoading);

        if (isLoading) return (
          <section key="featured_sections_loading" className="relative isolate overflow-hidden bg-gradient-to-br from-white via-red-50/30 to-amber-50/20 py-10">
            <HomeSectionAtmosphere variant="warm" />
            <div className="relative z-10 max-w-7xl mx-auto px-4"><HomeSectionLoading /></div>
          </section>
        );

        if (sections.length === 0) {
          if (config.emptyBehavior !== 'empty_state') return null;
          return (
            <section key="featured_sections_empty" className="relative isolate overflow-hidden bg-gradient-to-br from-white via-red-50/30 to-amber-50/20 py-10">
              <HomeSectionAtmosphere variant="warm" />
              <div className="relative z-10 max-w-7xl mx-auto px-4"><HomeSectionEmpty config={config} /></div>
            </section>
          );
        }

        return (
          <React.Fragment key="featured_sections">
            {sections.map(({ section, properties }, sectionIndex) => {
              const warmSurface = sectionIndex % 2 === 0;
              return (
                <section key={section.id} className={`relative isolate overflow-hidden py-10 ${warmSurface ? 'bg-gradient-to-br from-white via-red-50/30 to-amber-50/20' : 'bg-slate-50'}`}>
                  <HomeSectionAtmosphere variant={warmSurface ? 'warm' : 'soft'} />
                  <div className="relative z-10 max-w-7xl mx-auto px-4">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h2 className="cnv-section-title text-gray-900">{section.title}</h2>
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
                        <div key={p.id} className="flex-shrink-0 w-[360px] sm:w-[300px] snap-start">
                          <PropertyCard property={p}
                            isFavorited={favoriteIds.has(p.id)}
                            onToggleFavorite={() => handleToggleFavorite(p)}
                            onContact={() => setContactProp(p)} />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
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
              );
            })}
          </React.Fragment>
        );
      }
      case 'region_banners': return <LocationDiscovery key="region_banners" settings={pageLayout.find(section => section.id === 'region_banners')?.settings ?? {}} />;
      case 'why_us': return (
        <section key="why_us" className="relative isolate overflow-hidden bg-slate-50 py-12">
          <HomeSectionAtmosphere variant="soft" />
          <div className="relative z-10 max-w-6xl mx-auto px-4">
            <div className="text-center mb-8">
              <h2 className="cnv-major-title text-gray-900">{sec('why_us')('title', 'Tại sao chọn chúng tôi?')}</h2>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { icon: <Shield className="w-6 h-6" />, title: sec('why_us')('f1_title', 'Uy tín – Chuyên nghiệp'), desc: sec('why_us')('f1_desc', 'Hơn 7 năm kinh nghiệm trong lĩnh vực BĐS tại Bình Dương') },
                { icon: <CheckCircle className="w-6 h-6" />, title: sec('why_us')('f2_title', 'Thông tin minh bạch'), desc: sec('why_us')('f2_desc', 'Mọi thông tin BĐS đều được xác thực và kiểm duyệt kỹ lưỡng') },
                { icon: <Phone className="w-6 h-6" />, title: sec('why_us')('f3_title', supportHours), desc: sec('why_us')('f3_desc', `Đội ngũ hỗ trợ hoạt động ${supportHours.replace(/^Hỗ trợ\s+/i, '')}`) },
                { icon: <TrendingUp className="w-6 h-6" />, title: sec('why_us')('f4_title', 'Pháp lý an toàn'), desc: sec('why_us')('f4_desc', 'Hỗ trợ đầy đủ thủ tục pháp lý từ A đến Z') },
              ].map((f, i) => (
                <div key={i} className="text-center">
                  <div className="w-14 h-14 bg-red-50 rounded-2xl flex items-center justify-center text-red-600 mx-auto mb-3">{f.icon}</div>
                  <h3 className="cnv-body-copy font-medium text-gray-900 mb-1.5">{f.title}</h3>
                  <p className="cnv-body-copy text-gray-500">{f.desc}</p>
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
            <section key="testimonials_empty" className="relative isolate overflow-hidden bg-gradient-to-br from-white via-red-50/30 to-amber-50/20 py-10">
              <HomeSectionAtmosphere variant="warm" />
              <div className="relative z-10 max-w-6xl mx-auto px-4"><HomeSectionEmpty config={config} /></div>
            </section>
          );
        }

        return (
          <section key="testimonials" className="relative isolate overflow-hidden bg-gradient-to-br from-white via-red-50/30 to-amber-50/20 py-10">
            <HomeSectionAtmosphere variant="warm" />
            <div className="relative z-10 max-w-6xl mx-auto px-4">
              <div className="text-center mb-6">
                <h2 className="cnv-section-title text-gray-900">{sec('testimonials')('title', 'Khách hàng nói gì về chúng tôi')}</h2>
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
            <section key="news_empty" className="relative isolate overflow-hidden bg-white py-10">
              <HomeSectionAtmosphere variant="ambient" />
              <div className="relative z-10 max-w-7xl mx-auto px-4"><HomeSectionEmpty config={config} /></div>
            </section>
          );
        }

        // Tab danh mục tải query riêng theo category. Không lọc trên 20 bài mới nhất
        // toàn site vì một danh mục nhiều bài có thể chiếm hết cửa sổ đó.
        const newsTabs = homeNewsTabs;
        const currentNews = selectedNewsCategory ? selectedCategoryNews : news;
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
          <section key="news" className="relative isolate overflow-hidden bg-white py-12 md:py-16">
            <HomeSectionAtmosphere variant="ambient" />
            <div className="relative z-10 max-w-7xl mx-auto px-4">
              <div className="mb-8 text-center">
                <div className="cnv-eyebrow mb-3 inline-flex items-center gap-2 text-red-600">
                  <span className="h-7 w-1 rounded-full bg-red-600" />
                  Tin tức bất động sản
                  <span className="h-7 w-1 rounded-full bg-red-600" />
                </div>
                <h2 className="cnv-major-title text-gray-900">
                  {sec('news')('title', 'Cập nhật thị trường')}
                </h2>
                <p className="mx-auto mt-2 max-w-2xl text-sm text-gray-500 md:text-base">
                  Những thông tin mới nhất về thị trường bất động sản Việt Nam
                </p>
              </div>

              <div className="grid min-w-0 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(250px,0.9fr)] lg:items-start">
                <div className="order-2 min-w-0 lg:order-1">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="cnv-section-title text-gray-900">Tin nổi bật</h3>
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
                        <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
                          <span>{new Date(leadNews.created_at).toLocaleDateString('vi-VN')}</span>
                          <span>•</span>
                          <span>{Math.max(1, Math.round((leadNews.content ?? leadNews.excerpt ?? '').split(/\s+/).length / 200))} phút đọc</span>
                        </div>
                        {leadNews.excerpt && <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-gray-600">{leadNews.excerpt}</p>}
                      </div>
                    </Link>
                  ) : (
                    <div className="flex min-h-64 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center text-sm text-gray-500">
                      Chưa có bài viết trong danh mục này.
                    </div>
                  )}
                </div>

                <div className="order-3 min-w-0">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="cnv-section-title text-gray-900">Đọc nhiều nhất</h3>
                    <Eye className="h-5 w-5 text-red-500" />
                  </div>
                  <div className="divide-y divide-gray-100 rounded-2xl border border-gray-100 bg-white px-4 shadow-sm">
                    {popularNews.map((article, index) => (
                      <Link key={article.id} href={newsHref(article)} className="group flex gap-3 py-3 text-left">
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm font-black ${index === 0 ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-400'}`}>{index + 1}</span>
                        <div className="min-w-0">
                          <h4 className="line-clamp-2 text-sm font-semibold leading-snug text-gray-800 transition-colors group-hover:text-red-600">{article.title}</h4>
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
        <section key="faq" className="relative isolate overflow-hidden bg-slate-50 py-12 border-t border-gray-100">
          <HomeSectionAtmosphere variant="soft" />
          <div className="relative z-10 max-w-6xl mx-auto px-4">
            <h2 className="cnv-major-title text-center text-gray-900 mb-2">{sec('faq')('title', 'Câu hỏi thường gặp')}</h2>
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
                      <span className="cnv-body-copy font-medium text-gray-900">{item.q}</span>
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-gray-50 border border-gray-100">
                        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                      </span>
                    </button>
                    <div className={`cnv-body-copy px-5 pb-4 text-gray-600 ${open ? 'block' : 'hidden'}`}>{item.a}</div>
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
            <h2 className="cnv-major-title mb-3">{sec('cta')('title', 'Bạn có bất động sản cần bán hoặc cho thuê?')}</h2>
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
              { icon: <Phone className="w-5 h-5 text-orange-600" />, text: supportHours },
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

  const configuredOrder = getHomepageSectionOrder(pageLayout);
  const hasEnoughTasteSignal = tasteProfileReady && hasEnoughSignal(tasteProfile);
  const availability: HomeDiscoveryAvailability = {
    featured_sections: featuredSections.length > 0 || sectionQueries.some(query => query.isLoading),
    region_banners: true,
    news: news.length > 0,
    testimonials: testimonials.length > 0,
  };
  const orderedIds = getHomeDiscoveryOrder({
    configuredOrder,
    availability,
    hasRecentlyViewed: false,
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

      <main id="main-content">
        {/* ─── HERO (always first, not controlled by page builder) ─── */}
      <section className="relative flex min-h-[520px] items-center justify-center overflow-hidden pt-[var(--cnv-header-height)] md:min-h-[600px]">
        <div className="absolute inset-0">
          <Image key={heroBg} src={heroBg} alt={activeHero?.title || 'Chợ Nhà Việt'} fill priority sizes="100vw" className="object-cover animate-hero-zoom motion-reduce:animate-none motion-safe:transition-transform motion-safe:duration-[7000ms]" />
          {/* Overlay mỏng để ảnh bìa sáng rõ. Ảnh do admin tải nên độ sáng không đoán
              trước — chữ dựa vào drop-shadow thay vì dựa vào nền tối. */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-black/15 to-black/30" />
        </div>

        <div className="relative z-10 w-full max-w-5xl mx-auto px-4 py-12 text-center">
          <div className="inline-flex animate-fade-in-up items-center gap-2 bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full mb-4 shadow-lg shadow-black/20">
            <MapPin className="w-3 h-3" />{sec('hero')('hero_label', 'Tập trung khu vực Bình Dương')}
          </div>
          <h1 className="animate-fade-in-up animation-delay-100 text-3xl md:text-5xl font-black text-white leading-tight mb-3 drop-shadow-[0_2px_14px_rgba(0,0,0,0.9)]">
            {sec('hero')('title', 'Tìm kiếm bất động sản tại Bình Dương')}
          </h1>
          <p className="animate-fade-in-up animation-delay-200 text-white/95 text-sm md:text-base mb-8 max-w-2xl mx-auto drop-shadow-[0_1px_10px_rgba(0,0,0,0.85)]">
            {buildTruthfulHeroSubtitle(sec('hero')('subtitle', ''), activeListingCount)}
          </p>

          {/* Search box */}
          <div className="home-search-surface animate-fade-in-up animation-delay-300 mx-auto max-w-4xl rounded-2xl bg-white p-3 shadow-card md:p-4" onFocusCapture={() => setHeroInputFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHeroInputFocused(false); }}>
            {/* Tabs kiểu gạch chân — nhẹ hơn khay xám, hợp tông sáng */}
            <div className="mb-3 flex items-center gap-6 border-b border-gray-100 px-1 md:mb-4">
              {LISTING_TYPE_TABS.map(tab => (
                <button
                  key={tab.key}
                  onClick={() => { setActiveTab(tab.key); setSearchPriceIdx(0); }}
                  className={`cnv-control-type pb-3 border-b-2 -mb-px transition-colors ${activeTab === tab.key ? 'text-red-600 border-red-600' : 'text-slate-600 border-transparent hover:text-red-600'}`}
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
                className="cnv-control-type flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-red-600 text-white transition-colors hover:bg-red-700 md:w-[140px] md:shrink-0"
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
          {heroBanners.length > 1 && <div className="mt-4 flex items-center justify-center gap-2" aria-label="Chuyển ảnh bìa" onMouseEnter={() => setHeroControlsHovered(true)} onMouseLeave={() => setHeroControlsHovered(false)} onFocusCapture={() => setHeroControlsFocused(true)} onBlurCapture={event => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setHeroControlsFocused(false); }}>
            {heroBanners.map((banner, index) => <button key={banner.id} type="button" aria-label={`Ảnh bìa ${index + 1}`} aria-pressed={activeHeroIndex === index} onClick={event => { setActiveHeroIndex(index); if (event.detail > 0) event.currentTarget.blur(); }} className="group flex h-11 w-11 shrink-0 items-center justify-center">
              <span className={`h-1.5 w-9 rounded-full ${activeHeroIndex === index ? 'bg-red-600' : 'bg-slate-300 group-hover:bg-red-300'}`}><span key={activeHeroIndex} className={activeHeroIndex === index ? 'cnv-hero-progress block h-full rounded-full bg-red-900/30' : 'hidden'} style={{ animationPlayState: heroPaused ? 'paused' : 'running' }} /></span>
            </button>)}
          </div>}
        </div>
      </section>

      {/* ─── DYNAMIC SECTIONS (order + visibility from Page Builder) ─── */}
      {layoutQuery.isPending ? <div role="status" className="mx-auto max-w-7xl px-4 py-10 text-sm text-slate-500">Đang tải nội dung trang chủ…</div>
        : layoutQuery.isError && !layoutQuery.data ? <div role="alert" className="mx-auto max-w-7xl px-4 py-10 text-sm text-amber-800">Không tải được cấu hình trang chủ. <button onClick={() => void layoutQuery.refetch()} className="font-bold underline">Thử lại</button></div>
        : orderedIds.map(id => renderSection(id))}
      </main>

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
      <h2 className="cnv-section-title text-gray-900">{title}</h2>
      {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
    </div>
  );
}

// Giữ nguyên chữ ký export cũ cho AccountPage và các caller hiện tại; phần hiển thị
// chuyển sang PropertyCard dùng chung (alias để tránh trùng tên với hàm này).
export function PropertyCard({ property: p, onContact, isFavorited = false, onToggleFavorite }: {
  property: Property; onContact: () => void;
  isFavorited?: boolean; onToggleFavorite?: () => void;
}) {
  return (
    <UnifiedPropertyCard
      property={p}
      href={buildPropertyPath(p)}
      variant="grid"
      onContact={onContact}
      isFavorited={isFavorited}
      onToggleFavorite={onToggleFavorite}
    />
  );
}