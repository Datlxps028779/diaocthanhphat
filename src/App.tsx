import { useState, useEffect, lazy, Suspense } from 'react';
import { supabase } from './lib/supabase';
import { type Page, scrollTop } from './lib/router';
import { AuthProvider, useAuth } from './lib/auth';
import { CmsProvider, useCms } from './lib/cms';
import { applySeoMeta } from './lib/seo';
import { LandingPage } from './LandingPage';
import { AdminLogin } from './components/AdminLogin';
// AdminPanel (~193KB) chỉ dùng ở trang quản trị — lazy-load để không đưa vào bundle của khách vãng lai
const AdminPanel = lazy(() => import('./components/AdminPanel').then((m) => ({ default: m.AdminPanel })));
import { UserAuthModal } from './components/UserAuthModal';
import { Header, Footer, FloatingButtons } from './components/Layout';
import { ListingsPage } from './pages/ListingsPage';
import { PropertyDetailPage } from './pages/PropertyDetailPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { InvestPage } from './pages/InvestPage';
import { RegionsPage } from './pages/RegionsPage';
import { NewsPage } from './pages/NewsPage';
import { AboutPage } from './pages/AboutPage';
import { PostListingPage } from './pages/PostListingPage';
import { MyListingsPage } from './pages/MyListingsPage';
import { AccountPage } from './pages/AccountPage';
import { getAreas, getAdminRole } from './lib/api';
import { type Area } from './lib/supabase';

const ADMIN_PATH = '/quantrihethong';

const PAGE_TITLES: Partial<Record<string, string>> = {
  home: 'Trang chủ',
  listings: 'Danh sách bất động sản',
  projects: 'Dự án bất động sản',
  invest: 'Đầu tư bất động sản',
  regions: 'Khu vực',
  news: 'Tin tức thị trường',
  about: 'Về chúng tôi',
  'post-listing': 'Đăng tin bất động sản',
  'my-listings': 'Tin đăng của tôi',
};

function getInitialPage(): Page {
  const path = window.location.pathname;
  if (path === ADMIN_PATH) {
    return { name: 'quantri-login' };
  }
  // Deep-link: /bat-dong-san/{slug} → property detail
  const bdsMatch = path.match(/^\/bat-dong-san\/(.+)$/);
  if (bdsMatch) {
    return { name: 'property', id: bdsMatch[1], slug: bdsMatch[1] };
  }
  // Deep-link: /tin-tuc/{slug} → news article
  const newsMatch = path.match(/^\/tin-tuc\/(.+)$/);
  if (newsMatch) {
    return { name: 'news', slug: newsMatch[1] };
  }
  // Deep-link: /mua-ban, /cho-thue → listings
  if (path === '/mua-ban') return { name: 'listings', listingType: 'mua_ban' };
  if (path === '/cho-thue') return { name: 'listings', listingType: 'cho_thue' };
  // Deep-link: /danh-sach → listings all
  if (path === '/danh-sach') return { name: 'listings' };
  // Deep-link: /dau-tu → invest
  if (path === '/dau-tu') return { name: 'invest' };
  // Deep-link: /ve-chung-toi → about
  if (path === '/ve-chung-toi') return { name: 'about' };
  // Deep-link: /dang-tin → post-listing
  if (path === '/dang-tin') return { name: 'post-listing' };
  return { name: 'home' };
}

function pushUrl(page: Page) {
  const isAdmin = page.name === 'quantri' || page.name === 'quantri-login';
  if (isAdmin) {
    if (window.location.pathname !== ADMIN_PATH) {
      window.history.pushState(null, '', ADMIN_PATH);
    }
    return;
  }
  // Deep-link URL cho từng trang
  let target = '/';
  if (page.name === 'property') {
    // Ưu tiên slug đẹp; fallback UUID nếu tin chưa có slug — getPropertyByIdOrSlug
    // load được cả hai, nên URL luôn hiển thị & chia sẻ được.
    target = `/bat-dong-san/${page.slug ?? page.id}`;
  } else if (page.name === 'news' && page.slug) {
    target = `/tin-tuc/${page.slug}`;
  } else if (page.name === 'listings') {
    if (page.listingType === 'mua_ban') target = '/mua-ban';
    else if (page.listingType === 'cho_thue') target = '/cho-thue';
    else target = '/danh-sach';
  } else if (page.name === 'invest') {
    target = '/dau-tu';
  } else if (page.name === 'about') {
    target = '/ve-chung-toi';
  } else if (page.name === 'post-listing') {
    target = '/dang-tin';
  }
  if (window.location.pathname !== target) {
    window.history.pushState(null, '', target);
  }
}

function AppInner() {
  const { user, loading: authLoading } = useAuth();
  const { settings } = useCms();
  const [page, setPage] = useState<Page>(getInitialPage);
  const [areas, setAreas] = useState<Area[]>([]);
  const [authModal, setAuthModal] = useState<{ mode: 'login' | 'register' } | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminChecked, setAdminChecked] = useState(false);

  useEffect(() => { getAreas().then(setAreas).catch(() => {}); }, []);

  useEffect(() => {
    if (user) {
      getAdminRole()
        .then(r => { setIsAdmin(r); setAdminChecked(true); })
        .catch(() => { setIsAdmin(false); setAdminChecked(true); });
    } else {
      setIsAdmin(false);
      setAdminChecked(true);
    }
  }, [user]);

  // Sync URL on page changes
  useEffect(() => { pushUrl(page); }, [page]);

  // Handle browser back/forward — parse URL giống getInitialPage
  useEffect(() => {
    const handlePop = () => {
      setPage(getInitialPage());
    };
    window.addEventListener('popstate', handlePop);
    return () => window.removeEventListener('popstate', handlePop);
  }, []);

  // Inject SEO meta per page
  useEffect(() => {
    if (page.name === 'property' || page.name === 'quantri' || page.name === 'quantri-login') return;
    const siteName = settings.site_logo_text || 'BĐS Bình Dương';
    const baseTitle = settings.meta_title || `${siteName} – Mua Bán Cho Thuê Bất Động Sản Uy Tín`;
    const pageLabel = PAGE_TITLES[page.name];
    const title = pageLabel ? `${pageLabel} | ${siteName}` : baseTitle;
    applySeoMeta({
      title,
      description: settings.meta_description || '',
      keywords: settings.meta_keywords || '',
      ogTitle: title,
      ogImage: settings.og_image || '',
      ogUrl: window.location.href,
    });
  }, [page, settings]);

  const navigate = (p: Page) => { setPage(p); scrollTop(); };

  const handleNavigate = (p: Page) => {
    if ((p.name === 'post-listing' || p.name === 'my-listings') && !user) {
      setAuthModal({ mode: 'login' });
      return;
    }
    navigate(p);
  };

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );

  // ── Admin login page (/quantrihethong while not authenticated)
  if (page.name === 'quantri-login') {
    return <AdminLogin onSuccess={() => navigate({ name: 'quantri' })} />;
  }

  // ── Admin panel (/quantrihethong while authenticated)
  if (page.name === 'quantri') {
    if (!adminChecked) return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
    if (!user || !isAdmin) {
      return <AdminLogin onSuccess={() => navigate({ name: 'quantri' })} />;
    }
    return (
      <Suspense fallback={
        <div className="min-h-screen bg-gray-950 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
        </div>
      }>
        <AdminPanel onLogout={() => { supabase.auth.signOut(); navigate({ name: 'quantri-login' }); }} initialTab={page.tab} />
      </Suspense>
    );
  }

  // ── Home page (has its own Header/Footer/FloatingButtons)
  if (page.name === 'home') {
    return (
      <>
        <LandingPage
          onAdmin={() => navigate({ name: 'quantri-login' })}
          onNavigate={handleNavigate}
          user={user}
          onShowAuth={(mode) => setAuthModal({ mode })}
        />
        {authModal && (
          <UserAuthModal
            mode={authModal.mode}
            onClose={() => setAuthModal(null)}
            onSuccess={() => setAuthModal(null)}
            onSwitchMode={(m) => setAuthModal({ mode: m })}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Header
        currentPage={page}
        onNavigate={handleNavigate}
        user={user}
        onShowAuth={(mode) => setAuthModal({ mode })}
        onLogout={async () => { await supabase.auth.signOut(); navigate({ name: 'home' }); }}
      />
      {page.name === 'listings' && (
        <ListingsPage
          initialFilters={{
            listingType: page.listingType,
            areaId: page.areaId, typeId: page.typeId, keyword: page.keyword,
            minPrice: page.minPrice, maxPrice: page.maxPrice,
            minArea: page.minArea, maxArea: page.maxArea,
            bedrooms: page.bedrooms, direction: page.direction, legal: page.legal,
            isFeatured: page.isFeatured, isHot: page.isHot, sort: page.sort,
          }}
          onNavigate={handleNavigate}
        />
      )}
      {page.name === 'property' && <PropertyDetailPage propertyId={page.id} onNavigate={handleNavigate} />}
      {page.name === 'projects' && <ProjectsPage onNavigate={handleNavigate} initialPhase={page.phase} />}
      {page.name === 'invest' && <InvestPage onNavigate={handleNavigate} />}
      {page.name === 'regions' && <RegionsPage initialAreaId={page.areaId} onNavigate={handleNavigate} />}
      {page.name === 'news' && <NewsPage onNavigate={handleNavigate} articleId={page.articleId} />}
      {page.name === 'about' && <AboutPage onNavigate={handleNavigate} />}
      {page.name === 'post-listing' && <PostListingPage onNavigate={handleNavigate} />}
      {page.name === 'my-listings' && <MyListingsPage onNavigate={handleNavigate} />}
      {page.name === 'account' && <AccountPage onNavigate={handleNavigate} />}

      <Footer areas={areas} onNavigate={handleNavigate} />
      <FloatingButtons />

      {authModal && (
        <UserAuthModal
          mode={authModal.mode}
          onClose={() => setAuthModal(null)}
          onSuccess={() => setAuthModal(null)}
          onSwitchMode={(m) => setAuthModal({ mode: m })}
        />
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CmsProvider>
        <AppInner />
      </CmsProvider>
    </AuthProvider>
  );
}
