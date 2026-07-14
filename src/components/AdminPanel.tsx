import { useState, useEffect, lazy, Suspense } from 'react';
import {
  LayoutDashboard, Building2, Users, Star, Newspaper,
  FolderOpen, LogOut, Bell, Menu, X, TrendingUp,
  CheckCircle, Settings, Type, Image as ImageIcon,
  RefreshCw, FileText, Database, Layers, PanelLeft, UserCog
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { getDashboardStats, type DashboardStats } from '../lib/api';
import type { AdminTab, AdminPanelProps } from './admin/types';
import { visibleTabs } from '../lib/adminAccess';
import { SlaBell } from './admin/shared/SlaBell';

const DashboardTab = lazy(() => import('./admin/tabs/DashboardTab').then(m => ({ default: m.DashboardTab })));
const PropertiesTab = lazy(() => import('./admin/tabs/PropertiesTab').then(m => ({ default: m.PropertiesTab })));
const LeadsTab = lazy(() => import('./admin/tabs/LeadsTab').then(m => ({ default: m.LeadsTab })));
const UserListingsApprovalTab = lazy(() => import('./admin/tabs/UserListingsApprovalTab').then(m => ({ default: m.UserListingsApprovalTab })));
const UsersTab = lazy(() => import('./admin/tabs/UsersTab').then(m => ({ default: m.UsersTab })));
const StaffTab = lazy(() => import('./admin/tabs/StaffTab').then(m => ({ default: m.StaffTab })));
const ProjectsTab = lazy(() => import('./admin/tabs/ProjectsTab').then(m => ({ default: m.ProjectsTab })));
const NewsTab = lazy(() => import('./admin/tabs/NewsTab').then(m => ({ default: m.NewsTab })));
const TestimonialsTab = lazy(() => import('./admin/tabs/TestimonialsTab').then(m => ({ default: m.TestimonialsTab })));
const CmsContentTab = lazy(() => import('./admin/tabs/CmsContentTab').then(m => ({ default: m.CmsContentTab })));
const BannersTab = lazy(() => import('./admin/tabs/BannersTab').then(m => ({ default: m.BannersTab })));
const FeaturedSectionsTab = lazy(() => import('./admin/tabs/FeaturedSectionsTab').then(m => ({ default: m.FeaturedSectionsTab })));
const PageBuilderTab = lazy(() => import('./admin/tabs/PageBuilderTab').then(m => ({ default: m.PageBuilderTab })));
const PagesTab = lazy(() => import('./admin/tabs/PagesTab').then(m => ({ default: m.PagesTab })));
const SiteSettingsTab = lazy(() => import('./admin/tabs/SiteSettingsTab').then(m => ({ default: m.SiteSettingsTab })));
const BackupTab = lazy(() => import('./admin/tabs/BackupTab').then(m => ({ default: m.BackupTab })));
const AiAnalyticsTab = lazy(() => import('./admin/tabs/AiAnalyticsTab').then(m => ({ default: m.AiAnalyticsTab })));

export function AdminPanel({ onLogout, initialTab, role }: AdminPanelProps) {
  const allowedTabs = visibleTabs(role);
  // Tab mặc định: initialTab nếu hợp quyền, else tab đầu tiên staff/admin được thấy.
  const defaultTab: AdminTab = (initialTab && allowedTabs.includes(initialTab as AdminTab))
    ? (initialTab as AdminTab)
    : (allowedTabs[0] ?? 'dashboard');
  const [tab, setTabRaw] = useState<AdminTab>(defaultTab);
  // Chặn chuyển sang tab ngoài quyền (staff gõ tay / initialTab lạ).
  const setTab = (t: AdminTab) => { if (allowedTabs.includes(t)) setTabRaw(t); };
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stats, setStats] = useState<DashboardStats>({
    totalProperties: 0, activeProperties: 0, featuredProperties: 0, hotProperties: 0,
    saleProperties: 0, rentProperties: 0, totalLeads: 0, newLeads: 0, pendingListings: 0,
    totalViews: 0, monthLeads: 0, lastMonthLeads: 0, leadGrowth: 0, monthProperties: 0, totalNews: 0,
  });

  const loadStats = () => getDashboardStats().then(setStats).catch(() => {});
  useEffect(() => { loadStats(); }, []);

  const handleLogout = async () => { await supabase.auth.signOut(); onLogout(); };

  const navItems: { id: AdminTab; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: 'dashboard', label: 'Tổng quan', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'properties', label: 'Bất động sản', icon: <Building2 className="w-4 h-4" />, badge: stats.activeProperties },
    { id: 'leads', label: 'Khách hàng', icon: <Users className="w-4 h-4" />, badge: stats.newLeads },
    { id: 'user-listings', label: 'Duyệt tin đăng', icon: <CheckCircle className="w-4 h-4" />, badge: stats.pendingListings },
    { id: 'users', label: 'Người dùng', icon: <Users className="w-4 h-4" /> },
    { id: 'staff', label: 'Nhân viên', icon: <UserCog className="w-4 h-4" /> },
    { id: 'projects', label: 'Dự án', icon: <FolderOpen className="w-4 h-4" /> },
    { id: 'news', label: 'Tin tức', icon: <Newspaper className="w-4 h-4" /> },
    { id: 'testimonials', label: 'Đánh giá', icon: <Star className="w-4 h-4" /> },
    { id: 'cms', label: 'Nội dung trang', icon: <Type className="w-4 h-4" /> },
    { id: 'banners', label: 'Banners', icon: <ImageIcon className="w-4 h-4" /> },
    { id: 'featured-sections', label: 'Tin nổi bật', icon: <Layers className="w-4 h-4" /> },
    { id: 'page-builder', label: 'Bố cục trang', icon: <PanelLeft className="w-4 h-4" /> },
    { id: 'pages', label: 'Quản lý trang', icon: <FileText className="w-4 h-4" /> },
    { id: 'settings', label: 'Cài đặt', icon: <Settings className="w-4 h-4" /> },
    { id: 'backup', label: 'Sao lưu dữ liệu', icon: <Database className="w-4 h-4" /> },
    { id: 'ai-analytics', label: 'AI Phân tích', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-56' : 'w-16'} bg-gray-900 text-white flex-shrink-0 transition-all duration-300 flex flex-col`}>
        <div className="p-4 flex items-center justify-between border-b border-gray-700">
          {sidebarOpen && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                <Building2 className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="font-black text-sm text-red-400">QUẢN TRỊ</span>
            </div>
          )}
          <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-gray-400 hover:text-white transition-colors">
            {sidebarOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>

        <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
          {navItems.filter(item => allowedTabs.includes(item.id)).map(item => (
            <button key={item.id} onClick={() => setTab(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left ${tab === item.id ? 'bg-red-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'}`}>
              <span className="flex-shrink-0">{item.icon}</span>
              {sidebarOpen && (
                <>
                  <span className="text-sm font-medium flex-1 truncate">{item.label}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{item.badge}</span>
                  )}
                </>
              )}
            </button>
          ))}
        </nav>

        <div className="p-2 border-t border-gray-700">
          <button onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-gray-400 hover:bg-gray-800 hover:text-red-400 transition-colors">
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {sidebarOpen && <span className="text-sm">Đăng xuất</span>}
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
          <div>
            <h1 className="font-bold text-gray-900 text-base">{navItems.find(n => n.id === tab)?.label}</h1>
            <p className="text-gray-400 text-xs">BĐS Bình Dương – Hệ thống quản trị</p>
          </div>
          <div className="flex items-center gap-3">
            {allowedTabs.includes('leads') && <SlaBell onOpenLeads={() => setTab('leads')} />}
            <button onClick={loadStats} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors" title="Làm mới số liệu">
              <RefreshCw className="w-4 h-4" />
            </button>
            {stats.newLeads > 0 && (
              <button onClick={() => setTab('leads')} className="relative">
                <Bell className="w-5 h-5 text-gray-500" />
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                  {stats.newLeads}
                </span>
              </button>
            )}
            <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
              <span className="text-red-600 font-bold text-sm">A</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-6">
          <Suspense fallback={<div className="p-8 text-center text-gray-400">Đang tải...</div>}>
          {tab === 'dashboard' && <DashboardTab stats={stats} setTab={setTab} />}
          {tab === 'properties' && <PropertiesTab onStatsRefresh={loadStats} />}
          {tab === 'leads' && <LeadsTab onRefreshStats={loadStats} />}
          {tab === 'user-listings' && <UserListingsApprovalTab onRefreshStats={loadStats} />}
          {tab === 'users' && <UsersTab />}
          {tab === 'staff' && <StaffTab />}
          {tab === 'projects' && <ProjectsTab />}
          {tab === 'news' && <NewsTab />}
          {tab === 'testimonials' && <TestimonialsTab />}
          {tab === 'cms' && <CmsContentTab />}
          {tab === 'banners' && <BannersTab />}
          {tab === 'featured-sections' && <FeaturedSectionsTab />}
          {tab === 'page-builder' && <PageBuilderTab />}
          {tab === 'pages' && <PagesTab />}
          {tab === 'settings' && <SiteSettingsTab />}
          {tab === 'backup' && <BackupTab />}
          {tab === 'ai-analytics' && <AiAnalyticsTab />}
          </Suspense>
        </main>
      </div>
    </div>
  );
}
