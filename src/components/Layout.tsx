'use client';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useState, useEffect } from 'react';
import { Home, Menu, X, Phone, MessageCircle, User, LogOut, ChevronDown, Tag } from 'lucide-react';
import { type Page, pageToHref, scrollTop } from '../lib/router';
import { buildNavigationItems, buildMenuTree, type NavigationItem } from '../lib/navigation';
import { type Area } from '../lib/supabase';
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
  const phoneHotline = useSetting('phone_hotline', '0901 234 567');
  const supportHours = useSetting('support_hours', 'Hỗ trợ 7:00 – 21:00');
  const promoText = useSetting('header_promo_text', 'Đăng tin miễn phí — tiếp cận hàng nghìn người mua mỗi ngày');

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

  const primaryNav = navItems.slice(0, 6);
  const secondaryNav: { label: string; href: string }[] = [
    { label: 'Nhà đất bán', href: pageToHref({ name: 'listings', listingType: 'mua_ban' }) },
    { label: 'Nhà đất cho thuê', href: pageToHref({ name: 'listings', listingType: 'cho_thue' }) },
    { label: 'Dự án', href: pageToHref({ name: 'projects' }) },
    { label: 'Khu vực', href: pageToHref({ name: 'regions' }) },
    { label: 'Dữ liệu giá', href: '/du-lieu-gia' },
  ];

  return (
    <header className={`fixed inset-x-0 top-0 z-50 bg-white transition-shadow duration-200 ${scrolled ? 'shadow-[var(--cnv-shadow-soft)]' : 'shadow-sm'}`}>
      <div className="hidden bg-gradient-to-r from-red-800 via-red-600 to-amber-500 text-white md:block">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2 text-[13px] font-semibold">
          <div className="flex min-w-0 items-center gap-3">
            <Tag className="h-4 w-4 flex-shrink-0 text-white/90" />
            <span className="truncate">{promoText}</span>
            <Link href={pageToHref({ name: 'post-listing' })} onClick={closeMenus} className="rounded-full bg-white/20 px-3 py-1 text-xs font-bold text-white transition-colors hover:bg-white/30">
              Đăng ngay →
            </Link>
          </div>
          <div className="flex flex-shrink-0 items-center gap-4 text-white/90">
            <a href={`tel:${phoneHotline.replace(/\s/g, '')}`} className="flex items-center gap-1.5 font-bold text-white"><Phone className="h-3.5 w-3.5" />{phoneHotline}</a>
            <span className="h-4 w-px bg-white/25" />
            <span className="hidden lg:inline">{supportHours}</span>
          </div>
        </div>
      </div>

      <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-4 py-3 md:py-6">
        <Link href="/" onClick={closeMenus} className="flex flex-shrink-0 items-center gap-3">
          {logoUrl && !logoError ? (
            <img
              src={logoUrl}
              alt={siteName}
              onError={() => setLogoError(true)}
              className="h-10 w-auto max-w-[190px] object-contain md:h-12"
            />
          ) : (
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-red-600 to-amber-500 shadow-sm md:h-12 md:w-12">
              <Home className="h-6 w-6 text-white" />
            </div>
          )}
          <div className="hidden leading-tight sm:block">
            <div className="font-display text-lg font-extrabold tracking-tight text-red-700 md:text-2xl">{siteName}</div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400 md:text-xs">{siteSub}</div>
          </div>
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-2 xl:flex">
          {primaryNav.map(item => item.children ? (
            <div key={item.key} className="relative" onMouseEnter={() => setDesktopMenuOpen(item.key)} onMouseLeave={() => setDesktopMenuOpen(null)}>
              <button type="button" onClick={() => setDesktopMenuOpen(desktopMenuOpen === item.key ? null : item.key)}
                className={`flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[15px] font-bold transition-colors whitespace-nowrap ${isActive(item) ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50 hover:text-red-700'}`}>
                {item.label}<ChevronDown className="h-4 w-4" />
              </button>
              {desktopMenuOpen === item.key && (
                <div className="absolute left-0 top-full z-50 pt-2">
                  <div className="max-h-[70vh] w-64 overflow-y-auto rounded-2xl border border-slate-100 bg-white py-2 shadow-xl">
                    {item.children.map(child => child.children ? (
                      <div key={child.key} className="py-1">
                        <p className="px-4 pb-0.5 pt-1 text-[11px] font-bold uppercase tracking-wide text-slate-400">{child.label}</p>
                        {child.children.map(grand => (
                          <Link key={grand.key} href={hrefFor(grand)} onClick={closeMenus} {...newTabProps(grand)}
                            className="block px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-red-50 hover:text-red-600">
                            {grand.label}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <Link key={child.key} href={hrefFor(child)} onClick={closeMenus} {...newTabProps(child)}
                        className="block px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-red-50 hover:text-red-600">
                        {child.label}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Link key={item.key} href={hrefFor(item)} onClick={closeMenus} {...newTabProps(item)}
              className={`rounded-full px-4 py-2.5 text-[15px] font-bold transition-colors whitespace-nowrap ${isActive(item) ? 'bg-red-50 text-red-700' : 'text-slate-700 hover:bg-slate-50 hover:text-red-700'}`}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <div className="relative">
              <button onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 rounded-full border border-slate-200 px-4 py-2.5 transition-colors hover:bg-slate-50">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-50">
                  <span className="text-sm font-bold text-red-700">{user.email?.charAt(0).toUpperCase()}</span>
                </div>
                <span className="max-w-[120px] truncate text-sm font-bold text-slate-700">{user.email}</span>
                <ChevronDown className="h-4 w-4 text-slate-400" />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-full z-50 mt-2 min-w-[190px] rounded-2xl border border-slate-100 bg-white py-1.5 shadow-xl">
                  <Link href={pageToHref({ name: 'my-listings' })} onClick={closeMenus}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                    <User className="h-4 w-4 text-slate-400" />Tin đăng của tôi
                  </Link>
                  <Link href={pageToHref({ name: 'post-listing' })} onClick={closeMenus}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-slate-700 hover:bg-slate-50">
                    <Tag className="h-4 w-4 text-slate-400" />Đăng tin mới
                  </Link>
                  <div className="mt-1 border-t border-slate-100 pt-1">
                    <button onClick={onLogout}
                      className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm text-red-600 hover:bg-red-50">
                      <LogOut className="h-4 w-4" />Đăng xuất
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <button onClick={() => onShowAuth?.('login')}
              className="flex items-center gap-2 rounded-full border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-700">
              <User className="h-4 w-4" />{nav.btn_login || 'Đăng nhập'}
            </button>
          )}
          <Link href={pageToHref({ name: 'post-listing' })} onClick={closeMenus}
            className="rounded-full bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-sm transition-colors hover:bg-red-700">
            {nav.btn_post || 'Đăng tin'}
          </Link>
        </div>

        <button className="xl:hidden rounded-full border border-slate-200 p-2 text-slate-700" onClick={() => setMobileOpen(!mobileOpen)} aria-label="Mở menu">
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      <div className="hidden border-y border-slate-100 bg-slate-50/95 md:block">
        <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 py-2">
          {secondaryNav.map((item, i) => (
            <Link key={item.href} href={item.href} onClick={closeMenus}
              className="whitespace-nowrap px-4 py-1.5 text-sm font-semibold text-slate-600 transition-colors hover:text-red-700">
              {item.label}{i < secondaryNav.length - 1 && <span className="ml-4 text-slate-300">|</span>}
            </Link>
          ))}
        </div>
      </div>

      {mobileOpen && (
        <div className="xl:hidden border-t bg-white/98 px-4 py-3 shadow-lg backdrop-blur-xl">
          <div className="mb-3 flex gap-2 overflow-x-auto border-b border-slate-100 pb-3">
            {secondaryNav.slice(0, 4).map(item => (
              <Link key={item.href} href={item.href} onClick={closeMenus} className="whitespace-nowrap rounded-full bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700">
                {item.label}
              </Link>
            ))}
          </div>
          <div className="space-y-0.5">
            {navItems.map(item => item.children ? (
              <div key={item.key}>
                <button type="button" onClick={() => setMobileSubmenuOpen(mobileSubmenuOpen === item.key ? null : item.key)}
                  className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-sm transition-colors ${isActive(item) ? 'bg-red-50 font-semibold text-red-600' : 'text-slate-700 hover:bg-red-50 hover:text-red-600'}`}>
                  <span>{item.label}</span><ChevronDown className={`h-4 w-4 transition-transform ${mobileSubmenuOpen === item.key ? 'rotate-180' : ''}`} />
                </button>
                {mobileSubmenuOpen === item.key && (
                  <div className="ml-3 mt-1 space-y-0.5 border-l border-slate-100 pl-2">
                    {item.children.map(child => child.children ? (
                      <div key={child.key}>
                        <p className="px-3 pb-0.5 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400">{child.label}</p>
                        {child.children.map(grand => (
                          <Link key={grand.key} href={hrefFor(grand)} onClick={closeMenus} {...newTabProps(grand)}
                            className="block rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600">
                            {grand.label}
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <Link key={child.key} href={hrefFor(child)} onClick={closeMenus} {...newTabProps(child)}
                        className="block rounded-lg px-3 py-2 text-sm text-slate-600 transition-colors hover:bg-red-50 hover:text-red-600">
                        {child.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <Link key={item.key} href={hrefFor(item)} onClick={closeMenus} {...newTabProps(item)}
                className={`block w-full rounded-xl px-3 py-2.5 text-left text-sm transition-colors ${isActive(item) ? 'bg-red-50 font-semibold text-red-600' : 'text-slate-700 hover:bg-red-50 hover:text-red-600'}`}>
                {item.label}
              </Link>
            ))}
          </div>
          <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
            {user ? (
              <>
                <Link href={pageToHref({ name: 'my-listings' })} onClick={closeMenus} className="flex-1 rounded-xl border border-red-500 py-2 text-center text-xs font-semibold text-red-600">Tin của tôi</Link>
                <Link href={pageToHref({ name: 'post-listing' })} onClick={closeMenus} className="flex-1 rounded-xl bg-red-600 py-2 text-center text-xs font-semibold text-white">Đăng tin</Link>
              </>
            ) : (
              <>
                <button onClick={() => { onShowAuth?.('login'); setMobileOpen(false); }} className="flex-1 rounded-xl border border-red-500 py-2 text-xs font-semibold text-red-600">Đăng nhập</button>
                <button onClick={() => { onShowAuth?.('register'); setMobileOpen(false); }} className="flex-1 rounded-xl bg-red-600 py-2 text-xs font-semibold text-white">Đăng ký</button>
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
  onNavigate: (p: Page) => void;
}

export function Footer({ areas, onNavigate }: FooterProps) {
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
    <footer className="bg-slate-950 text-white border-t border-slate-900">
      <div className="max-w-7xl mx-auto px-4 py-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
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
          <p className="text-gray-600 text-[11px]">{license}</p>
        </div>
      </div>
    </footer>
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
      <h2 className="inline-block font-display text-2xl font-bold leading-tight text-gray-900 md:text-3xl">{title}</h2>
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
    <div className="sticky top-20 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-red-950 p-4 text-white shadow-[var(--cnv-shadow-soft)]">
      <div className="mb-3 h-1 w-10 bg-gradient-to-r from-red-500 to-amber-400" />
      <h4 className="mb-1 text-sm font-bold">{title}</h4>
      <p className="mb-3 text-xs text-slate-300">{sub}</p>
      <a href={`tel:${phone.replace(/\s/g, '')}`}
        className="mb-2 block w-full bg-white py-2.5 text-center text-xs font-bold text-red-700 transition-colors hover:bg-amber-50">
        <Phone className="mr-1 inline h-3.5 w-3.5" />{phone}
      </a>
      <button onClick={onContact} className="w-full border border-white/30 py-2 text-xs font-semibold text-white transition-colors hover:bg-white/10">
        {btnLabel}
      </button>
    </div>
  );
}
