'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { Home, Menu, X, Phone, MessageCircle, User, LogOut, ChevronDown, Plus, Tag } from 'lucide-react';
import { type Page, scrollTop } from '../lib/router';
import { type Area } from '../lib/supabase';
import { useContent, useSetting } from '../lib/cms';
import type { User as SupabaseUser } from '@supabase/supabase-js';

interface HeaderProps {
  currentPage: Page;
  onNavigate: (p: Page) => void;
  user?: SupabaseUser | null;
  onShowAuth?: (mode: 'login' | 'register') => void;
  onLogout?: () => void;
}

export function Header({ currentPage, onNavigate, user, onShowAuth, onLogout }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const nav = useContent('navbar');
  const siteName = useSetting('site_logo_text', 'BĐS BÌNH DƯƠNG');
  const siteSub = useSetting('site_logo_sub', 'Bất Động Sản Uy Tín');

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 5);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const navItems: { label: string; page: Page }[] = [
    { label: nav.menu_home || 'Trang chủ', page: { name: 'home' } },
    { label: nav.menu_buy || 'Mua bán', page: { name: 'listings', listingType: 'mua_ban' } },
    { label: nav.menu_rent || 'Cho thuê', page: { name: 'listings', listingType: 'cho_thue' } },
    { label: nav.menu_projects || 'Dự án', page: { name: 'projects' } },
    { label: nav.menu_invest || 'Đầu tư', page: { name: 'invest' } },
    { label: nav.menu_valuation || 'Định giá', page: { name: 'valuation' } },
    { label: nav.menu_news || 'Tin tức', page: { name: 'news' } },
    { label: nav.menu_about || 'Về chúng tôi', page: { name: 'about' } },
  ];

  const isActive = (item: { page: Page }) => {
    if (item.page.name !== currentPage.name) return false;
    if (item.page.name === 'listings' && currentPage.name === 'listings') {
      return item.page.listingType === currentPage.listingType;
    }
    return true;
  };

  const go = (page: Page) => { onNavigate(page); setMobileOpen(false); setUserMenuOpen(false); };

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
        <button onClick={() => go({ name: 'home' })} className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center">
            <Home className="w-5 h-5 text-white" />
          </div>
          <div className="hidden sm:block leading-tight">
            <div className="text-red-600 font-black text-sm tracking-tight">{siteName}</div>
            <div className="text-gray-400 text-[9px] tracking-wider uppercase">{siteSub}</div>
          </div>
        </button>

        <nav className="hidden xl:flex items-center gap-0.5 flex-1 justify-center">
          {navItems.map(({ label, page }) => (
            <button key={label} onClick={() => go(page)}
              className={`px-3.5 py-2 text-[13px] font-medium rounded transition-colors whitespace-nowrap ${isActive({ page }) ? 'text-red-600 bg-red-50 font-semibold' : 'text-gray-600 hover:text-red-600 hover:bg-gray-50'}`}>
              {label}
            </button>
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
                  <button onClick={() => go({ name: 'my-listings' })}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <User className="w-4 h-4 text-gray-400" />Tin đăng của tôi
                  </button>
                  <button onClick={() => go({ name: 'post-listing' })}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2">
                    <Tag className="w-4 h-4 text-gray-400" />Đăng tin mới
                  </button>
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
            <button onClick={() => go({ name: 'post-listing' })}
              className="bg-red-600 hover:bg-red-700 text-white text-[13px] font-semibold px-4 py-1.5 rounded-md transition-colors flex items-center gap-1">
              <Plus className="w-3.5 h-3.5" />Đăng tin
            </button>
          )}
        </div>

        <button className="xl:hidden p-1.5 text-gray-600" onClick={() => setMobileOpen(!mobileOpen)}>
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="xl:hidden bg-white border-t px-4 py-3 space-y-0.5 shadow-lg">
          {navItems.map(({ label, page }) => (
            <button key={label} onClick={() => go(page)}
              className={`block w-full text-left px-3 py-2.5 text-sm rounded-lg transition-colors ${isActive({ page }) ? 'text-red-600 bg-red-50 font-semibold' : 'text-gray-700 hover:text-red-600 hover:bg-red-50'}`}>
              {label}
            </button>
          ))}
          <div className="flex gap-2 pt-2 border-t border-gray-100">
            {user ? (
              <>
                <button onClick={() => go({ name: 'my-listings' })} className="flex-1 border border-red-500 text-red-600 text-xs font-semibold py-2 rounded-lg">Tin của tôi</button>
                <button onClick={() => go({ name: 'post-listing' })} className="flex-1 bg-red-600 text-white text-xs font-semibold py-2 rounded-lg">Đăng tin</button>
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
  onNavigate: (p: Page) => void;
}

export function Footer({ areas, onNavigate }: FooterProps) {
  const go = (page: Page) => { onNavigate(page); scrollTop(); };
  const footer = useContent('footer');
  const siteName = useSetting('site_logo_text', 'BĐS BÌNH DƯƠNG');
  const phone = useSetting('phone_main', '0901 234 567');
  const email = useSetting('email', 'info@bdsbinhduong.vn');
  const address = useSetting('address', 'Thủ Dầu Một, Bình Dương');
  const desc = useSetting('footer_description', 'Nền tảng bất động sản uy tín tại Bình Dương và các tỉnh lân cận.');
  const col3sub1 = useSetting('footer_col3_sub1', 'Chuyên sâu: Bình Dương');
  const col3sub2 = useSetting('footer_col3_sub2', 'Mở rộng: Bình Phước, Đồng Nai');
  const license = useSetting('footer_license', 'Giấy phép ĐKKD: 0000000000 | Bình Dương');

  const links: { label: string; page: Page }[] = [
    { label: 'Trang chủ', page: { name: 'home' } },
    { label: 'Mua bán BĐS', page: { name: 'listings', listingType: 'mua_ban' } },
    { label: 'BĐS Cho thuê', page: { name: 'listings', listingType: 'cho_thue' } },
    { label: 'Dự án', page: { name: 'projects' } },
    { label: 'Đầu tư', page: { name: 'invest' } },
    { label: 'Khu vực', page: { name: 'regions' } },
    { label: 'Tin tức', page: { name: 'news' } },
    { label: 'Về chúng tôi', page: { name: 'about' } },
  ];

  return (
    <footer className="bg-gray-900 text-white">
      <div className="max-w-7xl mx-auto px-4 py-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        <div>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-9 h-9 bg-red-600 rounded-lg flex items-center justify-center">
              <Home className="w-5 h-5 text-white" />
            </div>
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
            {links.map(({ label, page }) => (
              <li key={label}>
                <button onClick={() => go(page)} className="text-gray-400 hover:text-red-400 text-xs transition-colors">{label}</button>
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

export function FloatingButtons() {
  const zaloLink = useSetting('zalo_link', 'https://zalo.me');
  const phone = useSetting('phone_hotline', '0901234567');
  return (
    <>
      <div className="fixed bottom-6 right-4 z-40 flex flex-col gap-2.5">
        <a href={zaloLink} target="_blank" rel="noreferrer"
          className="w-12 h-12 bg-blue-500 hover:bg-blue-600 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all"
          title="Zalo">
          <MessageCircle className="w-5 h-5 text-white" />
        </a>
        <a href={`tel:${phone.replace(/\s/g, '')}`}
          className="w-12 h-12 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all animate-pulse"
          title="Gọi ngay">
          <Phone className="w-5 h-5 text-white" />
        </a>
      </div>
    </>
  );
}

export function Breadcrumb({ items }: { items: { label: string; onClick?: () => void }[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-xs text-gray-500 mb-4 flex-wrap">
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-gray-300">/</span>}
          {item.onClick
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
