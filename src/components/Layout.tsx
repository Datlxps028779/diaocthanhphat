'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { Home, Menu, X, Phone, MessageCircle, User, LogOut, ChevronDown, Plus, Tag } from 'lucide-react';
import { type Page, pageToHref, scrollTop } from '../lib/router';
import { buildNavigationItems, buildMenuTree, type NavigationItem } from '../lib/navigation';
import { type Area, type District } from '../lib/supabase';
import { districtDisplaySlug } from '../lib/areaPath';
import { useContent, useSetting, useMenu } from '../lib/cms';
import type { User as SupabaseUser } from '@supabase/supabase-js';

const AiSearchChat = dynamic(() => import('./AiSearchChat').then(m => m.AiSearchChat), { ssr: false });

interface HeaderProps {
  currentPage: Page;
  onNavigate: (p: Page) => void;
  user?: SupabaseUser | null;
  onShowAuth?: (mode: 'login' | 'register') => void;
  onLogout?: () => void;
  areas?: Area[];
}

export function Header({ currentPage, onNavigate, user, onShowAuth, onLogout, areas = [] }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState<string | null>(null);
  const [mobileSubmenuOpen, setMobileSubmenuOpen] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const nav = useContent('navbar');
  const menu = useMenu();
  const siteName = useSetting('site_logo_text', 'BĐS BÌNH DƯƠNG');
  const siteSub = useSetting('site_logo_sub', 'Bất Động Sản Uy Tín');
  const logoUrl = useSetting('site_logo_url', '');

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 5);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  // Menu từ DB (admin quản lý); rỗng → fallback menu hardcode để không vỡ.
  const navItems = menu.length > 0 ? buildMenuTree(menu, areas) : buildNavigationItems(nav, areas);

  const isActive = (item: NavigationItem) => {
    const pageName = item.page?.name ?? item.activePage;
    if (pageName !== currentPage.name) return false;
    if (item.page?.name === 'listings' && currentPage.name === 'listings') {
      return item.page.listingType === currentPage.listingType;
    }
    return true;
  };

  const closeMenus = () => { setMobileOpen(false); setUserMenuOpen(false); setDesktopMenuOpen(null); };
  void onNavigate; // giữ prop cho tương thích caller; điều hướng nay dùng <Link>
  const hrefFor = (item: NavigationItem) => item.href ?? (item.page ? pageToHref(item.page) : '#');
  // Menu item bật "mở tab mới" (admin cấu hình) → target=_blank + chống tabnabbing.
  const newTabProps = (item: NavigationItem) => item.openNewTab ? { target: '_blank', rel: 'noopener noreferrer' } : {};

  return (
    <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-200 ${scrolled ? 'bg-white shadow-md' : 'bg-white shadow-sm'}`}>
      {/* Top bar */}
      <div className="bg-red-600 text-white text-xs py-1 px-4 hidden md:flex items-center justify-between">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />Hotline: {useSetting('phone_hotline', '0901 234 567')}</span>
          <span className="opacity-60">|</span>
          <span>{useSetting('address', 'Thủ Dầu Một, Bình Dương')}</span>
        </div>
        <div className="flex items-center gap-3 text-red-100">
          <span>{useSetting('support_hours', 'Hỗ trợ 7:00 – 21:00')}</span>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-2 flex items-center justify-between gap-3">
        <Link href="/" onClick={closeMenus} className="flex items-center gap-2.5 flex-shrink-0">
          {logoUrl && !logoError ? (
            <img
              src={logoUrl}
              alt={siteName}
              onError={() => setLogoError(true)}
              className="h-9 w-auto max-w-[160px] rounded-lg object-contain"
            />
          ) : (
            <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center">
              <Home className="w-5 h-5 text-white" />
            </div>
          )}
          <div className="hidden sm:block leading-tight">
            <div className="text-red-600 font-black text-sm tracking-tight">{siteName}</div>
            <div className="text-gray-400 text-[9px] tracking-wider uppercase">{siteSub}</div>
          </div>
        </Link>

        <nav className="hidden xl:flex items-center gap-0.5 flex-1 justify-center">
          {navItems.map(item => item.children ? (
            <div key={item.key} className="relative" onMouseEnter={() => setDesktopMenuOpen(item.key)} onMouseLeave={() => setDesktopMenuOpen(null)}>
              <button type="button" onClick={() => setDesktopMenuOpen(desktopMenuOpen === item.key ? null : item.key)}
                className={`px-3.5 py-2 text-[13px] font-medium rounded transition-colors whitespace-nowrap flex items-center gap-1 ${isActive(item) ? 'text-red-600 bg-red-50 font-semibold' : 'text-gray-600 hover:text-red-600 hover:bg-gray-50'}`}>
                {item.label}<ChevronDown className="w-3 h-3" />
              </button>
              {desktopMenuOpen === item.key && (
                <div className="absolute left-0 top-full pt-2 z-50">
                  <div className="w-56 bg-white rounded-xl shadow-xl border border-gray-100 py-2 max-h-[70vh] overflow-y-auto">
                    {item.children.map(child => child.children ? (
                      <div key={child.key} className="py-1">
                        <p className="px-4 pt-1 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{child.label}</p>
                        {child.children.map(grand => (
                          <Link key={grand.key} href={hrefFor(grand)} onClick={closeMenus} {...newTabProps(grand)}
                            className="block px-4 py-2 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors">
                            {grand.label}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <Link key={child.key} href={hrefFor(child)} onClick={closeMenus} {...newTabProps(child)}
                        className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-red-50 hover:text-red-600 transition-colors">
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link key={item.key} href={hrefFor(item)} onClick={closeMenus} {...newTabProps(item)}
              className={`px-3.5 py-2 text-[13px] font-medium rounded transition-colors whitespace-nowrap ${isActive(item) ? 'text-red-600 bg-red-50 font-semibold' : 'text-gray-600 hover:text-red-600 hover:bg-gray-50'}`}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden md:flex items-center gap-2 flex-shrink-0">
          {user ? (
            <div className="relative">
              <button onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                <div className="w-6 h-6 bg-red-100 rounded-full flex items-center justify-center">
                  <span className="text-red-600 font-bold text-xs">{user.email?.charAt(0).toUpperCase()}</span>
                </div>
                <span className="text-xs font-medium text-gray-700 max-w-[100px] truncate">{user.email}</span>
                <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-100 py-1.5 z-50 min-w-[180px]">
                  <Link href={pageToHref({ name: 'my-listings' })} onClick={closeMenus}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />Tin đăng của tôi
                  </Link>
                  <Link href={pageToHref({ name: 'post-listing' })} onClick={closeMenus}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-gray-400" />Đăng tin mới
                  </Link>
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <button onClick={onLogout}
                      className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 flex items-center gap-2">
                      <LogOut className="w-4 h-4" />Đăng xuất
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              <button onClick={() => onShowAuth?.('login')}
                className="border border-red-500 text-red-600 text-[13px] font-semibold px-4 py-1.5 rounded-md hover:bg-red-50 transition-colors">
                {nav.btn_login || 'Đăng nhập'}
              </button>
              <button onClick={() => onShowAuth?.('register')}
                className="bg-red-600 hover:bg-red-700 text-white text-[13px] font-semibold px-4 py-1.5 rounded-md transition-colors">
                {nav.btn_post || 'Đăng tin'}
              </button>
            </>
          )}
          {user && (
            <Link href={pageToHref({ name: 'post-listing' })} onClick={closeMenus}
              className="bg-red-600 hover:bg-red-700 text-white text-[13px] font-semibold px-4 py-1.5 rounded-md transition-colors flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" />Đăng tin
            </Link>
          )}
        </div>

        <button className="xl:hidden p-1.5 text-gray-600" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="xl:hidden bg-white border-t px-4 py-3 space-y-0.5 shadow-lg">
          {navItems.map(item => item.children ? (
            <div key={item.key}>
              <button type="button" onClick={() => setMobileSubmenuOpen(mobileSubmenuOpen === item.key ? null : item.key)}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-sm rounded-lg transition-colors ${isActive(item) ? 'text-red-600 bg-red-50 font-semibold' : 'text-gray-700 hover:text-red-600 hover:bg-red-50'}`}>
                <span>{item.label}</span><ChevronDown className={`w-4 h-4 transition-transform ${mobileSubmenuOpen === item.key ? 'rotate-180' : ''}`} />
              </button>
              {mobileSubmenuOpen === item.key && (
                <div className="ml-3 mt-1 border-l border-gray-100 pl-2 space-y-0.5">
                  {item.children.map(child => child.children ? (
                    <div key={child.key}>
                      <p className="px-3 pt-1.5 pb-0.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{child.label}</p>
                      {child.children.map(grand => (
                        <Link key={grand.key} href={hrefFor(grand)} onClick={closeMenus} {...newTabProps(grand)}
                          className="block px-3 py-2 text-sm rounded-lg text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors">
                          {grand.label}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <Link key={child.key} href={hrefFor(child)} onClick={closeMenus} {...newTabProps(child)}
                      className="block px-3 py-2 text-sm rounded-lg text-gray-600 hover:text-red-600 hover:bg-red-50 transition-colors">
                      {child.label}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Link key={item.key} href={hrefFor(item)} onClick={closeMenus} {...newTabProps(item)}
              className={`block w-full text-left px-3 py-2.5 text-sm rounded-lg transition-colors ${isActive(item) ? 'text-red-600 bg-red-50 font-semibold' : 'text-gray-700 hover:text-red-600 hover:bg-red-50'}`}>
              {item.label}
            </Link>
          ))}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            {user ? (
              <>
                <Link href={pageToHref({ name: 'my-listings' })} onClick={closeMenus} className="flex-1 border border-red-500 text-red-600 text-xs font-semibold py-2 rounded-lg text-center">Tin của tôi</Link>
                <Link href={pageToHref({ name: 'post-listing' })} onClick={closeMenus} className="flex-1 bg-red-600 text-white text-xs font-semibold py-2 rounded-lg text-center">Đăng tin</Link>
              </>
            ) : (
              <>
                <button onClick={() => { onShowAuth?.('login'); setMobileOpen(false); }} className="flex-1 border border-red-500 text-red-600 text-xs font-semibold py-2 rounded-lg">Đăng nhập</button>
                <button onClick={() => { onShowAuth?.('register'); setMobileOpen(false); }} className="flex-1 bg-red-600 text-white text-xs font-semibold py-2 rounded-lg">Đăng ký</button>
              </>
            )}
          </div>
        </div>
      )}

      {userMenuOpen && <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />}
    </header>
  );
}

interface FooterProps {
  areas: Area[];
  districts?: District[];
  onNavigate: (p: Page) => void;
}

// Chip quận/huyện của một tỉnh. Tỉnh nhiều huyện (TP.HCM 22) sẽ chiếm hết footer nên
// chỉ hiện 12 chip đầu, phần còn lại xổ ra tại chỗ khi bấm "Xem thêm".
const DISTRICT_CHIPS_VISIBLE = 12;

function AreaDistrictChips({ area, districts }: { area: Area; districts: District[] }) {
  const [expanded, setExpanded] = useState(false);
  const hidden = districts.length - DISTRICT_CHIPS_VISIBLE;
  const shown = expanded ? districts : districts.slice(0, DISTRICT_CHIPS_VISIBLE);

  return (
    <div className="space-y-2" data-testid="area-district-chips">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={`/khu-vuc/${area.slug}`} data-testid="area-name" className="text-sm font-bold text-gray-900 hover:text-red-600">
          Bất động sản {area.name}
        </Link>
        {districts.length > 0 && <span className="text-[11px] text-gray-400">{districts.length} quận/huyện</span>}
      </div>
      {districts.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {shown.map(d => (
            <Link
              key={d.id}
              data-testid="district-chip"
              href={`/mua-ban/${area.slug}/${districtDisplaySlug(area.slug, d.slug)}`}
              className="rounded-xl border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-600 shadow-sm transition-all duration-200 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
            >
              {d.name}
            </Link>
          ))}
          {hidden > 0 && !expanded && (
            <button
              onClick={() => setExpanded(true)}
              className="rounded-xl border border-dashed border-gray-300 px-3 py-1.5 text-xs font-bold text-gray-500 transition-colors hover:border-red-300 hover:text-red-600"
            >
              Xem thêm {hidden} quận/huyện
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function Footer({ areas, districts = [], onNavigate }: FooterProps) {
  void onNavigate; // giữ prop cho tương thích caller; điều hướng nay dùng <Link>
  const footer = useContent('footer');
  const siteName = useSetting('site_logo_text', 'BĐS BÌNH DƯƠNG');
  const logoUrl = useSetting('site_logo_url', '');
  const [logoError, setLogoError] = useState(false);
  const phone = useSetting('phone_main', '0901 234 567');
  const email = useSetting('email', 'info@bdsbinhduong.vn');
  const address = useSetting('address', 'Thủ Dầu Một, Bình Dương');
  const desc = useSetting('footer_description', 'Nền tảng bất động sản uy tín tại Bình Dương và các tỉnh lân cận.');
  const col3sub1 = useSetting('footer_col3_sub1', 'Chuyên sâu: Bình Dương');
  const col3sub2 = useSetting('footer_col3_sub2', 'Mở rộng: Bình Phước, Đồng Nai');
  const license = useSetting('footer_license', 'Giấy phép ĐKKD: 0000000000 | Bình Dương');
  const seoTagline = useSetting('seo_block_tagline', 'Nền tảng bất động sản thông minh — tìm kiếm căn hộ, nhà phố, đất nền, biệt thự với pháp lý minh bạch, dữ liệu giá cập nhật từ tin đăng thực tế.');
  // Số ĐKKD toàn số 0 là placeholder chưa điền. Công bố số giả làm mất E-E-A-T
  // (Google đánh giá độ tin cậy doanh nghiệp), nên thà ẩn còn hơn hiện số sai.
  const hasRealLicense = !/\b0{6,}\b/.test(license);

  const fallbackLinks: { label: string; href: string }[] = [
    { label: 'Trang chủ', href: pageToHref({ name: 'home' }) },
    { label: 'Mua bán BĐS', href: pageToHref({ name: 'listings', listingType: 'mua_ban' }) },
    { label: 'BĐS Cho thuê', href: pageToHref({ name: 'listings', listingType: 'cho_thue' }) },
    { label: 'Dự án', href: pageToHref({ name: 'projects' }) },
    { label: 'Đầu tư', href: pageToHref({ name: 'invest' }) },
    { label: 'Khu vực', href: pageToHref({ name: 'regions' }) },
    { label: 'Khu dân cư', href: '/khu-dan-cu' },
    { label: 'Dữ liệu giá', href: '/du-lieu-gia' },
    { label: 'Tin tức', href: pageToHref({ name: 'news' }) },
    { label: 'Kiến thức', href: '/kien-thuc' },
    { label: 'Về chúng tôi', href: pageToHref({ name: 'about' }) },
  ];

  const quickLinksRaw = useSetting('footer_quick_links', '');
  const links: { label: string; href: string }[] = (() => {
    if (!quickLinksRaw.trim()) return fallbackLinks;
    try {
      const parsed = JSON.parse(quickLinksRaw);
      if (!Array.isArray(parsed)) return fallbackLinks;
      const cleaned = parsed
        .filter((x): x is { label: string; href: string } =>
          x && typeof x.label === 'string' && typeof x.href === 'string' && x.label.trim() !== '' && x.href.trim() !== '')
        .map(x => ({ label: x.label.trim(), href: x.href.trim() }));
      return cleaned.length > 0 ? cleaned : fallbackLinks;
    } catch {
      return fallbackLinks;
    }
  })();

  return (
    <>
      {/* Khối liên kết nội bộ trên footer: chip khu vực sinh từ bảng areas nên chỉ
          trỏ tới tỉnh có dữ liệu thật, không dẫn khách vào trang rỗng. */}
      {areas.length > 0 && (
        <div className="relative overflow-hidden border-t border-gray-100 bg-[#fafafa] py-9">
          <div
            className="pointer-events-none absolute inset-0 opacity-[0.15]"
            style={{ backgroundImage: 'radial-gradient(#d1d5db 0.8px, transparent 0.8px)', backgroundSize: '12px 12px' }}
          />
          <div className="relative z-10 mx-auto max-w-7xl px-4">
            <div className="space-y-6 text-sm leading-relaxed text-gray-600">
              <div className="space-y-3 text-center">
                <p className="text-2xl font-black tracking-tight text-gray-900">
                  {siteName} — <span className="text-red-600">Mua bán, cho thuê bất động sản</span> toàn quốc
                </p>
                <p className="mx-auto max-w-3xl text-base font-medium text-gray-600">
                  {seoTagline}
                </p>
              </div>

              <div className="space-y-5 pt-2">
                <div className="flex items-center gap-3">
                  <h2 className="text-[13px] font-bold uppercase tracking-widest text-gray-500">Khu vực trọng điểm</h2>
                  <div className="h-px flex-grow bg-gray-200" />
                </div>
                {areas.map(a => (
                  <AreaDistrictChips key={a.id} area={a} districts={districts.filter(d => d.area_id === a.id)} />
                ))}
              </div>

              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <h2 className="text-[13px] font-bold uppercase tracking-widest text-gray-500">Tìm kiếm nhanh</h2>
                  <div className="h-px flex-grow bg-gray-200" />
                </div>
                <div className="flex flex-wrap gap-2">
                  {areas.flatMap(a => [
                    { key: `${a.id}-buy`, label: `Nhà đất bán ${a.name}`, href: `/mua-ban/${a.slug}` },
                    { key: `${a.id}-rent`, label: `Cho thuê ${a.name}`, href: `/cho-thue/${a.slug}` },
                  ]).map(item => (
                    <Link
                      key={item.key}
                      href={item.href}
                      data-testid="quick-search-chip"
                      className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-600 shadow-sm transition-all duration-200 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            {logoUrl && !logoError ? (
              <img
                src={logoUrl}
                alt={siteName}
                onError={() => setLogoError(true)}
                className="h-9 w-auto max-w-[160px] rounded-lg object-contain bg-white/10"
              />
            ) : (
              <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center">
                <Home className="w-5 h-5 text-white" />
              </div>
            )}
            <div>
              <div className="text-red-400 font-black text-sm">{siteName}</div>
              <div className="text-gray-500 text-[10px]">{useSetting('site_logo_sub', 'Kênh BĐS uy tín')}</div>
            </div>
          </div>
          <p className="text-gray-400 text-xs leading-relaxed mb-3">{desc}</p>
        </div>

        <div>
          <h4 className="font-bold text-sm mb-3 text-white">{footer.col2_title || 'LIÊN KẾT NHANH'}</h4>
          <ul className="grid grid-cols-1 gap-1.5">
            {links.map(({ label, href }) => (
              <li key={`${label}-${href}`}>
                <Link href={href} onClick={() => scrollTop()} className="text-gray-400 hover:text-red-400 text-xs transition-colors">{label}</Link>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <h4 className="font-bold text-sm mb-3 text-white">{footer.col3_title || 'KHU VỰC'}</h4>
          {areas.map(a => (
            <Link key={a.id} href={`/khu-vuc/${a.slug}`} onClick={() => scrollTop()}
              className="block text-gray-400 hover:text-red-400 text-xs mb-2 transition-colors">{a.name}</Link>
          ))}
          <div className="mt-2 pt-2 border-t border-gray-800">
            <p className="text-gray-500 text-xs">{col3sub1}</p>
            <p className="text-gray-500 text-xs">{col3sub2}</p>
          </div>
        </div>

        <div>
          <h4 className="font-bold text-sm mb-3 text-white">{footer.col4_title || 'LIÊN HỆ'}</h4>
          <div className="space-y-2 text-xs text-gray-400">
            <p className="flex items-start gap-2">
              <Phone className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{phone}</span>
            </p>
            <p className="flex items-start gap-2">
              <MessageCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{email}</span>
            </p>
            <p className="flex items-start gap-2">
              <Home className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
              <span>{address}</span>
            </p>
          </div>
        </div>
      </div>
      <div className="border-t border-gray-800 py-4 px-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
          <p className="text-gray-500 text-[11px]">{footer.copyright || '© 2025 BĐS Bình Dương. Tất cả quyền được bảo lưu.'}</p>
          {hasRealLicense && <p className="text-gray-600 text-[11px]">{license}</p>}
        </div>
      </div>
    </footer>
    </>
  );
}

export function FloatingButtons({ onNavigate }: { onNavigate?: (p: Page) => void }) {
  return (
    <>
      <AiSearchChat onNavigate={onNavigate} />
    </>
  );
}

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

export function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-8">
      <h2 className="inline-block text-2xl md:text-3xl font-black text-gray-900 leading-tight">{title}</h2>
      {subtitle && <p className="text-gray-500 mt-2 text-sm">{subtitle}</p>}
    </div>
  );
}

export function SidebarCta({ onContact }: { onContact: () => void }) {
  const phone = useSetting('phone_hotline', '0901 234 567');
  const title = useSetting('sidebar_cta_title', 'Cần tư vấn ngay?');
  const sub = useSetting('sidebar_cta_sub', 'Chuyên gia sẵn sàng hỗ trợ 7:00–21:00');
  const btnLabel = useSetting('sidebar_cta_btn', 'Gửi yêu cầu tư vấn');
  return (
    <div className="bg-red-600 rounded-xl p-4 text-white sticky top-20">
      <h4 className="font-bold text-sm mb-1">{title}</h4>
      <p className="text-red-100 text-xs mb-3">{sub}</p>
      <a href={`tel:${phone.replace(/\s/g, '')}`}
        className="block w-full bg-white text-red-600 font-bold text-xs py-2.5 rounded-lg hover:bg-red-50 transition-colors text-center mb-2">
        <Phone className="w-3.5 h-3.5 inline mr-1" />{phone}
      </a>
      <button onClick={onContact} className="w-full border border-red-400 text-red-100 font-semibold text-xs py-2 rounded-lg hover:bg-red-700 transition-colors">
        {btnLabel}
      </button>
    </div>
  );
}
