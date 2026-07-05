import { useState, useEffect, useRef, useCallback } from 'react';
import {
  LayoutDashboard, Building2, Users, Star, Newspaper,
  FolderOpen, LogOut, Bell, Menu, X, TrendingUp,
  Eye, Plus, Edit2, Trash2, CheckCircle, XCircle,
  Phone, MapPin, Clock, ChevronDown, Search,
  Save, AlertCircle, Settings, Type, Image as ImageIcon,
  BarChart3, ArrowUp, ArrowDown, Home, Tag, Globe,
  RefreshCw, Download, FileText, Database, Shield, Zap, MousePointer,
  Layers, Filter, List, LayoutGrid, GripVertical, PanelLeft
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  getDashboardStats, adminGetAllProperties, getAreas, getPropertyTypes,
  createProperty, updateProperty, deleteProperty,
  getLeads, updateLeadStatus, deleteLead,
  adminGetTestimonials, createTestimonial, updateTestimonial, deleteTestimonial,
  adminGetAllNews, createNews, updateNews, deleteNews,
  adminGetAllProjects, createProject, updateProject, deleteProject,
  adminGetUserListings, approveUserListing, rejectUserListing,
  adminGetAllSiteSettings, updateSiteSetting,
  adminGetAllSiteContent, updateSiteContent,
  adminGetAllBanners, createBanner, updateBanner, deleteBanner,
  exportTableData, callAiAnalytics, getDistricts,
  adminGetFeaturedSections, adminCreateFeaturedSection, adminUpdateFeaturedSection,
  adminDeleteFeaturedSection, adminGetSectionItems, adminSetSectionItems,
  getPageLayout, adminSavePageLayout,
  adminGetAllManagedPages, adminCreateManagedPage, adminUpdateManagedPage, adminDeleteManagedPage,
  adminGetPageBlocks, adminSavePageBlock, adminDeletePageBlock,
  type DashboardStats,
} from '../lib/api';
import { ImageUpload, ImageUrlInput } from './ImageUpload';
import { useSEOAutofill, SEOPreview, generateSlug } from '../lib/useSEOAutofill';
import type { UserListing, SiteSetting, SiteContent, Banner, District, FeaturedSection, FeaturedSectionItem, PageSection, ManagedPage, PageBlock } from '../lib/supabase';
import type { Property, Lead, Testimonial, NewsArticle, Project, Area, PropertyType } from '../lib/supabase';

type AdminTab = 'dashboard' | 'properties' | 'leads' | 'user-listings' | 'projects' | 'news' | 'testimonials' | 'cms' | 'settings' | 'banners' | 'featured-sections' | 'page-builder' | 'pages' | 'backup' | 'ai-analytics';

interface AdminPanelProps { onLogout: () => void; initialTab?: string; }

export function AdminPanel({ onLogout, initialTab }: AdminPanelProps) {
  const [tab, setTab] = useState<AdminTab>((initialTab as AdminTab) ?? 'dashboard');
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
          {navItems.map(item => (
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
          {tab === 'dashboard' && <DashboardTab stats={stats} setTab={setTab} />}
          {tab === 'properties' && <PropertiesTab onStatsRefresh={loadStats} />}
          {tab === 'leads' && <LeadsTab onRefreshStats={loadStats} />}
          {tab === 'user-listings' && <UserListingsApprovalTab onRefreshStats={loadStats} />}
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
        </main>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function DashboardTab({ stats, setTab }: { stats: DashboardStats; setTab: (t: AdminTab) => void }) {
  return (
    <div className="space-y-6">
      {/* Main stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'Tổng BĐS', value: stats.totalProperties, sub: `${stats.activeProperties} đang hiển thị`,
            icon: <Building2 className="w-5 h-5 text-blue-500" />, bg: 'bg-blue-50',
            onClick: () => setTab('properties'),
            extra: <span className="text-[10px] text-blue-600 font-semibold">+{stats.monthProperties} tháng này</span>
          },
          {
            label: 'Lượt xem', value: stats.totalViews.toLocaleString('vi-VN'), sub: 'Tất cả BĐS',
            icon: <Eye className="w-5 h-5 text-purple-500" />, bg: 'bg-purple-50',
          },
          {
            label: 'Khách hàng', value: stats.totalLeads, sub: `${stats.newLeads} chưa xử lý`,
            icon: <Users className="w-5 h-5 text-emerald-500" />, bg: 'bg-emerald-50',
            onClick: () => setTab('leads'),
            extra: (
              <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${stats.leadGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {stats.leadGrowth >= 0 ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
                {Math.abs(stats.leadGrowth)}% so với tháng trước
              </span>
            )
          },
          {
            label: 'Tin đăng chờ duyệt', value: stats.pendingListings, sub: 'Cần xem xét',
            icon: <CheckCircle className="w-5 h-5 text-amber-500" />, bg: 'bg-amber-50',
            onClick: () => setTab('user-listings'),
          },
        ].map(c => (
          <button key={c.label} onClick={c.onClick}
            className={`${c.bg} rounded-xl p-5 text-left border border-white shadow-sm hover:shadow-md transition-all ${c.onClick ? 'cursor-pointer' : 'cursor-default'}`}>
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 bg-white rounded-xl flex items-center justify-center shadow-sm">{c.icon}</div>
              {c.onClick && <ChevronDown className="w-4 h-4 text-gray-400 -rotate-90" />}
            </div>
            <p className="text-2xl font-black text-gray-900">{c.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{c.label}</p>
            <p className="text-xs text-gray-400 mt-0.5">{c.sub}</p>
            {c.extra && <div className="mt-1">{c.extra}</div>}
          </button>
        ))}
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'BĐS Mua bán', value: stats.saleProperties, icon: <Home className="w-4 h-4 text-red-500" />, color: 'text-red-600' },
          { label: 'BĐS Cho thuê', value: stats.rentProperties, icon: <Tag className="w-4 h-4 text-blue-500" />, color: 'text-blue-600' },
          { label: 'BĐS Nổi bật', value: stats.featuredProperties, icon: <Star className="w-4 h-4 text-amber-500" />, color: 'text-amber-600' },
          { label: 'Tin tức', value: stats.totalNews, icon: <Newspaper className="w-4 h-4 text-green-500" />, color: 'text-green-600' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl p-4 border border-gray-200 shadow-sm flex items-center gap-3">
            <div className="w-9 h-9 bg-gray-50 rounded-lg flex items-center justify-center">{s.icon}</div>
            <div>
              <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-gray-500 text-xs">{s.label}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Quick actions */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-4">Thao tác nhanh</h3>
          <div className="space-y-2">
            {[
              { label: 'Thêm BĐS mới', onClick: () => setTab('properties'), color: 'bg-blue-600' },
              { label: 'Duyệt tin đăng mới', onClick: () => setTab('user-listings'), color: 'bg-amber-600', badge: stats.pendingListings },
              { label: 'Xem khách hàng mới', onClick: () => setTab('leads'), color: 'bg-emerald-600', badge: stats.newLeads },
              { label: 'Chỉnh sửa nội dung trang', onClick: () => setTab('cms'), color: 'bg-purple-600' },
              { label: 'Viết tin tức mới', onClick: () => setTab('news'), color: 'bg-gray-700' },
            ].map(a => (
              <button key={a.label} onClick={a.onClick}
                className={`w-full ${a.color} hover:opacity-90 text-white text-sm font-semibold py-2.5 px-4 rounded-lg text-left transition-opacity flex items-center justify-between`}>
                <span className="flex items-center gap-2"><Plus className="w-4 h-4" />{a.label}</span>
                {a.badge !== undefined && a.badge > 0 && (
                  <span className="bg-white/20 text-white text-[11px] font-bold px-2 py-0.5 rounded-full">{a.badge}</span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Performance bars */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
          <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-red-500" />Chỉ số hoạt động
          </h3>
          <div className="space-y-4">
            {[
              { label: 'BĐS đang hoạt động', value: stats.activeProperties, total: stats.totalProperties, color: 'bg-blue-500' },
              { label: 'Khách hàng đã xử lý', value: stats.totalLeads - stats.newLeads, total: Math.max(stats.totalLeads, 1), color: 'bg-emerald-500' },
              { label: 'BĐS mua bán / tổng', value: stats.saleProperties, total: Math.max(stats.totalProperties, 1), color: 'bg-red-500' },
              { label: 'BĐS cho thuê / tổng', value: stats.rentProperties, total: Math.max(stats.totalProperties, 1), color: 'bg-blue-400' },
            ].map(m => (
              <div key={m.label}>
                <div className="flex justify-between text-xs text-gray-600 mb-1.5">
                  <span>{m.label}</span>
                  <span className="font-semibold">{m.value}/{m.total} ({m.total > 0 ? Math.round((m.value / m.total) * 100) : 0}%)</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className={`h-full ${m.color} rounded-full transition-all duration-700`}
                    style={{ width: m.total > 0 ? `${Math.min((m.value / m.total) * 100, 100)}%` : '0%' }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span>Khách hàng tháng này: <strong className="text-gray-900">{stats.monthLeads}</strong></span>
              <span className={`flex items-center gap-1 font-semibold ${stats.leadGrowth >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {stats.leadGrowth >= 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                {stats.leadGrowth >= 0 ? '+' : ''}{stats.leadGrowth}%
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Properties Tab ───────────────────────────────────────────────────────────
function PropertiesTab({ onStatsRefresh }: { onStatsRefresh?: () => void }) {
  const [properties, setProperties] = useState<Property[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [types, setTypes] = useState<PropertyType[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('');
  const [editing, setEditing] = useState<Property | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [p, a, t] = await Promise.all([adminGetAllProperties(), getAreas(), getPropertyTypes()]);
    setProperties(p); setAreas(a); setTypes(t);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = properties.filter(p =>
    (!search || p.title.toLowerCase().includes(search.toLowerCase()) || p.city.toLowerCase().includes(search.toLowerCase())) &&
    (!filterType || p.listing_type === filterType)
  );

  const handleSave = async (data: Partial<Property>) => {
    setSaving(true);
    try {
      if (creating) await createProperty(data as Omit<Property, 'id' | 'created_at' | 'updated_at' | 'views' | 'areas' | 'property_types'>);
      else if (editing) await updateProperty(editing.id, data);
      await load(); onStatsRefresh?.();
      setEditing(null); setCreating(false);
    } catch (e) {
      console.error("[AdminPanel] Lưu BĐS thất bại:", e);
      const err = e as { message?: string; code?: string; details?: string };
      const msg = err?.message ?? 'Lỗi không xác định';
      const code = err?.code ? ` [${err.code}]` : '';
      alert('Lưu thất bại: ' + msg + code + (err?.details ? '\n' + err.details : ''));
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string) => {
    await deleteProperty(id);
    setConfirmDelete(null);
    await load(); onStatsRefresh?.();
  };

  if (editing || creating) {
    return (
      <PropertyForm
        property={creating ? null : editing}
        areas={areas} types={types}
        saving={saving}
        onSave={handleSave}
        onCancel={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Tìm BĐS..." className="pl-9 pr-4 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white w-56" />
          </div>
          <select value={filterType} onChange={e => setFilterType(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2.5 text-sm bg-white focus:outline-none">
            <option value="">Tất cả loại</option>
            <option value="mua_ban">Mua bán</option>
            <option value="cho_thue">Cho thuê</option>
          </select>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />Thêm BĐS
        </button>
      </div>

      {loading ? (
        <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Tiêu đề</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Loại</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase hidden md:table-cell">Khu vực</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Giá</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase hidden sm:table-cell">Trạng thái</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase hidden lg:table-cell">Lượt xem</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 uppercase">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <img src={p.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'} alt="" className="w-12 h-10 object-cover rounded-lg flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="font-medium text-gray-900 text-sm truncate max-w-[200px]">{p.title}</p>
                          <div className="flex gap-1 mt-0.5">
                            {p.is_featured && <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">Nổi bật</span>}
                            {p.is_hot && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded">HOT</span>}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${p.listing_type === 'cho_thue' ? 'bg-blue-100 text-blue-700' : 'bg-red-100 text-red-700'}`}>
                        {p.listing_type === 'mua_ban' ? 'Mua bán' : 'Cho thuê'}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="text-gray-600 text-xs">{p.city}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-bold text-red-600 text-sm">{p.price_label ?? `${p.price} ${p.price_unit}`}</span>
                    </td>
                    <td className="px-4 py-3 text-center hidden sm:table-cell">
                      <button onClick={async () => { await updateProperty(p.id, { is_active: !p.is_active }); await load(); }}
                        className={`flex items-center justify-center mx-auto gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-colors ${p.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                        {p.is_active ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                        {p.is_active ? 'Hiển thị' : 'Ẩn'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-center text-gray-500 text-xs hidden lg:table-cell">
                      <span className="flex items-center justify-center gap-1"><Eye className="w-3 h-3" />{p.views}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => setEditing(p)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Sửa">
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setConfirmDelete(p.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Xóa">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <div className="text-center py-10 text-gray-400 text-sm">Không tìm thấy bất động sản nào</div>}
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog message="Bạn có chắc chắn muốn xóa bất động sản này?"
          onConfirm={() => handleDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}

// ─── SEO Score ────────────────────────────────────────────────────────────────
function calcSeoScore(title: string, description: string, imageUrl: string, areaSqm: unknown, price: unknown): number {
  let score = 0;
  const titleLen = title.trim().length;
  if (titleLen >= 30 && titleLen <= 65) score += 30;
  else if (titleLen >= 15) score += 15;
  const descLen = (description ?? '').trim().length;
  if (descLen >= 120) score += 30;
  else if (descLen >= 60) score += 15;
  if (imageUrl) score += 15;
  if (areaSqm) score += 10;
  if (price) score += 15;
  return Math.min(score, 100);
}

// ─── Admin Pin Map ─────────────────────────────────────────────────────────────
function AdminPinMap({ lat, lng, searchQuery, onChange }: {
  lat: string; lng: string; searchQuery: string;
  onChange: (lat: string, lng: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);
  const searchRef = useRef('');
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    import('leaflet').then(module => {
      const L = module.default;
      import('leaflet/dist/leaflet.css');
      const map = L.map(containerRef.current!, { center: [10.9804, 106.6519], zoom: 10, attributionControl: false });
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      L.control.attribution({ prefix: '© OpenStreetMap' }).addTo(map);
      const pinIcon = L.divIcon({
        className: '',
        html: `<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0z" fill="#dc2626"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`,
        iconSize: [28, 36], iconAnchor: [14, 36],
      });
      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        const { lat, lng } = e.latlng;
        if (markerRef.current) markerRef.current.setLatLng([lat, lng]);
        else {
          markerRef.current = L.marker([lat, lng], { icon: pinIcon, draggable: true }).addTo(map);
          markerRef.current.on('dragend', () => {
            const pos = markerRef.current!.getLatLng();
            onChangeRef.current(pos.lat.toFixed(6), pos.lng.toFixed(6));
          });
        }
        onChangeRef.current(lat.toFixed(6), lng.toFixed(6));
      });
    });
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; } };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !lat || !lng) return;
    const latN = parseFloat(lat), lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN)) return;
    import('leaflet').then(module => {
      const L = module.default;
      if (markerRef.current) {
        markerRef.current.setLatLng([latN, lngN]);
      } else {
        const pinIcon = L.divIcon({ className: '', html: `<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0z" fill="#dc2626"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`, iconSize: [28, 36], iconAnchor: [14, 36] });
        markerRef.current = L.marker([latN, lngN], { icon: pinIcon, draggable: true }).addTo(map);
        markerRef.current.on('dragend', () => { const pos = markerRef.current!.getLatLng(); onChangeRef.current(pos.lat.toFixed(6), pos.lng.toFixed(6)); });
      }
      map.setView([latN, lngN], Math.max(map.getZoom(), 14));
    });
  }, [lat, lng]);

  useEffect(() => {
    if (!searchQuery || searchQuery === searchRef.current) return;
    searchRef.current = searchQuery;
    const map = mapRef.current;
    if (!map) return;
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(searchQuery + ', Vietnam')}&format=json&limit=1`)
      .then(r => r.json()).then((results: Array<{ lat: string; lon: string }>) => {
        if (results.length > 0) map.flyTo([parseFloat(results[0].lat), parseFloat(results[0].lon)], 13, { duration: 1.2 });
      }).catch(() => {});
  }, [searchQuery]);

  return <div ref={containerRef} style={{ width: '100%', height: '220px' }} className="rounded-lg overflow-hidden border border-gray-200" />;
}

// ─── Property Form ────────────────────────────────────────────────────────────
function PropertyForm({ property, areas, types, saving, onSave, onCancel }: {
  property: Property | null; areas: Area[]; types: PropertyType[];
  saving: boolean; onSave: (data: Partial<Property>) => void; onCancel: () => void;
}) {
  const [form, setForm] = useState({
    title: property?.title ?? '',
    description: property?.description ?? '',
    listing_type: property?.listing_type ?? 'mua_ban',
    price: property?.price ?? 0,
    price_unit: property?.price_unit ?? 'tỷ',
    price_label: property?.price_label ?? '',
    price_per_month: property?.price_per_month ?? '',
    area_sqm: property?.area_sqm ?? '',
    address: property?.address ?? '',
    city: property?.city ?? '',
    district: property?.district ?? '',
    area_id: property?.area_id ?? '',
    property_type_id: property?.property_type_id ?? '',
    image_url: property?.image_url ?? '',
    images: property?.images ?? [] as string[],
    badge: property?.badge ?? '',
    badge_color: property?.badge_color ?? 'red',
    legal_status: property?.legal_status ?? '',
    is_featured: property?.is_featured ?? false,
    is_hot: property?.is_hot ?? false,
    is_active: property?.is_active ?? true,
    contact_name: property?.contact_name ?? '',
    contact_phone: property?.contact_phone ?? '',
    contact_zalo: property?.contact_zalo ?? '',
    bedrooms: property?.bedrooms ?? '',
    bathrooms: property?.bathrooms ?? '',
    direction: property?.direction ?? '',
    road_width: property?.road_width ?? '',
    frontage: property?.frontage ?? '',
    floor_count: property?.floor_count ?? '',
    latitude: property?.latitude ? String(property.latitude) : '',
    longitude: property?.longitude ? String(property.longitude) : '',
    vr_tour_url: property?.vr_tour_url ?? '',
    video_url: property?.video_url ?? '',
    meta_title: property?.meta_title ?? '',
    meta_description: property?.meta_description ?? '',
    focus_keywords: property?.focus_keywords ?? '',
    schema_markup: property?.schema_markup ? JSON.stringify(property.schema_markup, null, 2) : '',
  });

  const [districts, setDistricts] = useState<District[]>([]);
  const [mapSearchQuery, setMapSearchQuery] = useState(property?.city ?? '');
  const isRent = form.listing_type === 'cho_thue';
  const seoScore = calcSeoScore(form.title, form.description, form.image_url, form.area_sqm, form.price);

  // ─── SEO Autofill ───────────────────────────────────────────────────────────
  const seo = useSEOAutofill({
    title: form.title,
    description: form.description,
    price: form.price,
    price_unit: form.price_unit,
    listing_type: form.listing_type,
    city: form.city,
    district: form.district,
    area_sqm: form.area_sqm,
    bedrooms: form.bedrooms,
    bathrooms: form.bathrooms,
    image_url: form.image_url,
    images: form.images,
    address: form.address,
    latitude: form.latitude,
    longitude: form.longitude,
    contact_name: form.contact_name,
    contact_phone: form.contact_phone,
    property_type_name: types.find(t => t.id === form.property_type_id)?.name ?? '',
  });
  // Sync SEO vào form
  useEffect(() => { setForm(f => ({ ...f, meta_title: seo.metaTitle })); }, [seo.metaTitle]);
  useEffect(() => { setForm(f => ({ ...f, meta_description: seo.metaDescription })); }, [seo.metaDescription]);
  useEffect(() => { setForm(f => ({ ...f, focus_keywords: seo.focusKeywords })); }, [seo.focusKeywords]);
  useEffect(() => { setForm(f => ({ ...f, schema_markup: seo.schemaMarkup })); }, [seo.schemaMarkup]);

  const setField = (name: string, value: unknown) => setForm(f => ({ ...f, [name]: value }));

  const handleAreaChange = useCallback((areaId: string) => {
    const area = areas.find(a => a.id === areaId);
    setField('area_id', areaId);
    setField('city', area?.name ?? '');
    setField('district', '');
    if (areaId) {
      getDistricts(areaId).then(setDistricts).catch(() => setDistricts([]));
      if (area?.name) setMapSearchQuery(area.name);
    } else {
      setDistricts([]);
    }
  }, [areas]);

  const handleDistrictChange = useCallback((districtName: string) => {
    setField('district', districtName);
    if (districtName && form.city) setMapSearchQuery(`${districtName}, ${form.city}`);
  }, [form.city]);

  useEffect(() => {
    if (property?.area_id) getDistricts(property.area_id).then(setDistricts).catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const seoColor = seoScore >= 70 ? 'text-emerald-600' : seoScore >= 40 ? 'text-amber-600' : 'text-red-600';
  const seoBarColor = seoScore >= 70 ? 'bg-emerald-500' : seoScore >= 40 ? 'bg-amber-500' : 'bg-red-500';
  const seoLabel = seoScore >= 70 ? 'Tốt' : seoScore >= 40 ? 'Trung bình' : 'Cần cải thiện';

  // ─── Handle Save Click an toàn ──────────────────────────────────────────────
  const handleSaveClick = () => {
    let parsedSchema: Record<string, unknown> | null = null;
    if (form.schema_markup && form.schema_markup.trim()) {
      try { parsedSchema = JSON.parse(form.schema_markup); }
      catch { parsedSchema = null; console.error('[PropertyForm] schema_markup JSON không hợp lệ'); }
    }
    const cs = (v: string) => v?.trim() || null;
    const cn = (v: string | number) => (v !== '' && v != null && !isNaN(Number(v))) ? Number(v) : null;
    onSave({
      title: form.title,
      description: cs(form.description),
      listing_type: form.listing_type,
      price: Number(form.price) || 0,
      price_unit: form.price_unit,
      price_label: cs(form.price_label),
      price_per_month: cn(form.price_per_month),
      area_sqm: cn(form.area_sqm),
      address: cs(form.address),
      city: form.city,
      district: cs(form.district),
      area_id: cs(form.area_id),
      property_type_id: cs(form.property_type_id),
      image_url: cs(form.image_url),
      images: form.images.length > 0 ? form.images : null,
      badge: cs(form.badge),
      badge_color: form.badge_color || null,
      legal_status: cs(form.legal_status),
      is_featured: form.is_featured,
      is_hot: form.is_hot,
      is_active: form.is_active,
      contact_name: cs(form.contact_name),
      contact_phone: cs(form.contact_phone),
      contact_zalo: cs(form.contact_zalo),
      bedrooms: cn(form.bedrooms),
      bathrooms: cn(form.bathrooms),
      direction: cs(form.direction),
      road_width: cn(form.road_width),
      frontage: cn(form.frontage),
      floor_count: cn(form.floor_count),
      latitude: cn(form.latitude),
      longitude: cn(form.longitude),
      vr_tour_url: cs(form.vr_tour_url),
      video_url: cs(form.video_url),
      meta_title: cs(form.meta_title),
      meta_description: cs(form.meta_description),
      focus_keywords: cs(form.focus_keywords),
      schema_markup: parsedSchema,
    } as Partial<Property>);
  };

  const fld = (lbl: string, key: string, opts?: { type?: string; placeholder?: string; rows?: number; options?: string[] }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-700 mb-1">{lbl}</label>
      {opts?.rows ? (
        <textarea value={String(form[key as keyof typeof form] ?? '')} onChange={e => setField(key, e.target.value)}
          rows={opts.rows} placeholder={opts?.placeholder}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
      ) : opts?.options ? (
        <select value={String(form[key as keyof typeof form] ?? '')} onChange={e => setField(key, e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
          <option value="">-- Chọn --</option>
          {opts.options.map(o => <option key={o}>{o}</option>)}
        </select>
      ) : (
        <input type={opts?.type ?? 'text'} value={String(form[key as keyof typeof form] ?? '')}
          onChange={e => setField(key, e.target.value)} placeholder={opts?.placeholder}
          className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
      )}
    </div>
  );

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
        <div>
          <h2 className="font-bold text-gray-900 text-lg">{property ? 'Chỉnh sửa BĐS' : 'Thêm BĐS mới'}</h2>
          <p className="text-gray-400 text-xs mt-0.5">Điền đầy đủ thông tin để tăng điểm SEO và tỷ lệ chuyển đổi</p>
        </div>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 p-1"><X className="w-5 h-5" /></button>
      </div>

      <div className="flex gap-0">
        {/* Main form */}
        <div className="flex-1 p-6 space-y-5 overflow-y-auto" style={{ maxHeight: 'calc(100vh - 180px)' }}>

          {/* Listing type */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Loại tin đăng *</label>
            <div className="flex gap-2">
              {[{ v: 'mua_ban', l: 'Mua bán' }, { v: 'cho_thue', l: 'Cho thuê' }].map(({ v, l }) => (
                <button key={v} type="button" onClick={() => setField('listing_type', v)}
                  className={`px-4 py-2 text-sm font-semibold rounded-lg border-2 transition-colors ${form.listing_type === v ? 'bg-red-600 text-white border-red-600' : 'border-gray-200 text-gray-600 hover:border-red-400'}`}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Tiêu đề *
              <span className={`ml-2 text-[10px] font-normal ${form.title.length >= 30 && form.title.length <= 65 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {form.title.length}/65 ký tự
              </span>
            </label>
            <input value={form.title} onChange={e => setField('title', e.target.value)}
              placeholder="Tiêu đề BĐS (30–65 ký tự tối ưu SEO)"
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>

          {/* Price row */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="block text-xs font-semibold text-gray-700 mb-1">{isRent ? 'Giá thuê' : 'Giá bán'} *</label>
              <div className="flex gap-2">
                <input type="number" value={String(form.price)} onChange={e => setField('price', parseFloat(e.target.value) || 0)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                <select value={form.price_unit} onChange={e => setField('price_unit', e.target.value)}
                  className="border border-gray-200 rounded-lg px-2 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                  <option value="tỷ">tỷ</option>
                  <option value="triệu">triệu</option>
                  {isRent && <option value="triệu/tháng">tr/tháng</option>}
                </select>
              </div>
            </div>
            {fld('Nhãn giá', 'price_label', { placeholder: '2.5 tỷ, Thỏa thuận...' })}
          </div>

          {/* Province → District cascade */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Tỉnh/Thành phố *</label>
              <select value={form.area_id} onChange={e => handleAreaChange(e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                <option value="">-- Chọn tỉnh/thành --</option>
                {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Quận/Huyện</label>
              {districts.length > 0 ? (
                <select value={form.district} onChange={e => handleDistrictChange(e.target.value)}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                  <option value="">-- Chọn quận/huyện --</option>
                  {districts.map(d => <option key={d.id} value={d.name}>{d.name}</option>)}
                </select>
              ) : (
                <input value={form.district} onChange={e => handleDistrictChange(e.target.value)}
                  placeholder="Nhập quận/huyện..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              )}
            </div>
          </div>

          {fld('Địa chỉ chi tiết', 'address', { placeholder: 'Số nhà, tên đường...' })}

          {/* Pin-drop map */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5 flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-red-500" />
              Xác định vị trí trên bản đồ
              <span className="font-normal text-gray-400 text-[10px]">(click để đặt ghim)</span>
            </label>
            <AdminPinMap
              lat={String(form.latitude)}
              lng={String(form.longitude)}
              searchQuery={mapSearchQuery}
              onChange={(lat, lng) => { setField('latitude', lat); setField('longitude', lng); }}
            />
            <div className="grid grid-cols-2 gap-3 mt-2">
              <input type="number" step="any" value={String(form.latitude)} onChange={e => setField('latitude', e.target.value)}
                placeholder="Vĩ độ (latitude)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400" />
              <input type="number" step="any" value={String(form.longitude)} onChange={e => setField('longitude', e.target.value)}
                placeholder="Kinh độ (longitude)"
                className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
          </div>

          {/* Area + type — fix: dùng id thay vì name */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Loại BĐS</label>
              <select value={form.property_type_id} onChange={e => setField('property_type_id', e.target.value)}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                <option value="">-- Chọn loại --</option>
                {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            {fld('Diện tích (m²)', 'area_sqm', { type: 'number', placeholder: '120' })}
          </div>

          {/* Specs */}
          <div className="grid grid-cols-4 gap-3">
            {fld('Phòng ngủ', 'bedrooms', { type: 'number', placeholder: '3' })}
            {fld('Phòng tắm', 'bathrooms', { type: 'number', placeholder: '2' })}
            {fld('Mặt tiền (m)', 'frontage', { type: 'number', placeholder: '5' })}
            {fld('Đường rộng (m)', 'road_width', { type: 'number', placeholder: '8' })}
          </div>

          {/* Legal + direction */}
          <div className="grid grid-cols-2 gap-3">
            {fld('Pháp lý', 'legal_status', { options: ['Sổ đỏ', 'Sổ hồng', 'Sổ đỏ/sổ hồng', 'Giấy tay', 'Hợp đồng mua bán', 'Chưa có sổ'] })}
            {fld('Hướng nhà', 'direction', { options: ['Đông', 'Tây', 'Nam', 'Bắc', 'Đông Nam', 'Đông Bắc', 'Tây Nam', 'Tây Bắc'] })}
          </div>

          {/* Contact */}
          <div className="grid grid-cols-2 gap-3">
            {fld('Tên người liên hệ', 'contact_name')}
            {fld('SĐT liên hệ', 'contact_phone')}
          </div>
          {fld('Zalo liên hệ', 'contact_zalo', { placeholder: '0901234567 hoặc https://zalo.me/...' })}

          {/* Images */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Ảnh đại diện</label>
            <ImageUrlInput value={form.image_url} onChange={url => setField('image_url', url)} placeholder="URL ảnh đại diện" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Thư viện ảnh</label>
            <ImageUpload images={form.images} onChange={imgs => setField('images', imgs)} maxImages={15} />
          </div>

          {/* Media */}
          {fld('Link video thực tế (YouTube hoặc MP4)', 'video_url', { type: 'url', placeholder: 'https://youtube.com/...' })}
          {fld('Link VR Tour 360°', 'vr_tour_url', { type: 'url', placeholder: 'https://...' })}

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Mô tả chi tiết
              <span className={`ml-2 text-[10px] font-normal ${form.description.length >= 120 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {form.description.length} ký tự (tối thiểu 120)
              </span>
            </label>
            <textarea value={form.description} onChange={e => setField('description', e.target.value)} rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
          </div>

          {/* Badge */}
          <div className="grid grid-cols-2 gap-3">
            {fld('Badge nhãn', 'badge', { placeholder: 'Độc quyền, Giảm giá...' })}
            {fld('Màu badge', 'badge_color', { options: ['red', 'green', 'blue', 'orange'] })}
          </div>

          {/* Toggles */}
          <div className="flex flex-wrap gap-4 pt-2 border-t border-gray-100">
            {[{ key: 'is_active', label: 'Đang hiển thị' }, { key: 'is_featured', label: 'Nổi bật' }, { key: 'is_hot', label: 'HOT' }].map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!form[key as keyof typeof form]}
                  onChange={e => setField(key, e.target.checked)} className="accent-red-500 w-4 h-4" />
                <span className="text-sm text-gray-700 font-medium">{label}</span>
              </label>
            ))}
          </div>

          {/* ─── SEO Configuration ─────────────────────────────────────────────── */}
          <div className="pt-4 border-t border-gray-100">
            <h3 className="font-bold text-gray-900 text-sm mb-3 flex items-center gap-2">
              <Search className="w-4 h-4 text-red-500" />Cấu hình SEO
            </h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Tiêu đề SEO (tối đa 60 ký tự)
                  <span className={`ml-2 text-[10px] font-normal ${seo.titleValid ? 'text-emerald-600' : 'text-amber-600'}`}>{seo.titleLength}/60</span>
                </label>
                <input value={seo.metaTitle} onChange={e => seo.setMetaTitle(e.target.value)} maxLength={70}
                  placeholder="Tự động từ tiêu đề..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Meta Description (tối đa 155 ký tự)
                  <span className={`ml-2 text-[10px] font-normal ${seo.descValid ? 'text-emerald-600' : 'text-amber-600'}`}>{seo.descLength}/155</span>
                </label>
                <textarea value={seo.metaDescription} onChange={e => seo.setMetaDescription(e.target.value)} rows={2} maxLength={170}
                  placeholder="Tự động từ mô tả..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Từ khóa chính (Focus Keywords)</label>
                <input value={seo.focusKeywords} onChange={e => seo.setFocusKeywords(e.target.value)}
                  placeholder="bất động sản, Bình Dương, ..."
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">URL thân thiện (Slug)</label>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 flex-shrink-0">/bat-dong-san/</span>
                  <input value={generateSlug(form.title)} readOnly
                    className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-600" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Schema Markup (JSON-LD)</label>
                <textarea value={seo.schemaMarkup} onChange={e => seo.setSchemaMarkup(e.target.value)} rows={6}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-xs font-mono focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
              </div>
              <button type="button" onClick={seo.resetAuto} className="text-xs text-red-600 hover:underline">↻ Tự động điền lại</button>
              <SEOPreview metaTitle={seo.metaTitle} metaDescription={seo.metaDescription} focusKeywords={seo.focusKeywords} />
            </div>
          </div>
        </div>

        {/* SEO Score Sidebar */}
        <div className="w-56 flex-shrink-0 bg-gray-50 border-l border-gray-200 p-4 space-y-4" style={{ maxHeight: 'calc(100vh - 180px)', overflowY: 'auto' }}>
          <div>
            <p className="text-xs font-bold text-gray-700 mb-2 flex items-center gap-1.5">
              <Zap className="w-3.5 h-3.5 text-amber-500" />Điểm SEO
            </p>
            <div className="bg-white rounded-xl p-3 border border-gray-200 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <span className={`text-3xl font-black ${seoColor}`}>{seoScore}</span>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${seoScore >= 70 ? 'bg-emerald-100 text-emerald-700' : seoScore >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                  {seoLabel}
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${seoBarColor} rounded-full transition-all duration-500`}
                  style={{ width: `${seoScore}%` }} />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Checklist SEO</p>
            {[
              { label: 'Tiêu đề 30–65 ký tự', ok: form.title.length >= 30 && form.title.length <= 65 },
              { label: 'Mô tả ≥ 120 ký tự', ok: form.description.length >= 120 },
              { label: 'Ảnh đại diện', ok: !!form.image_url },
              { label: 'Diện tích', ok: !!form.area_sqm },
              { label: 'Giá bán', ok: Number(form.price) > 0 },
              { label: 'Vị trí bản đồ', ok: !!form.latitude && !!form.longitude },
              { label: 'Pháp lý', ok: !!form.legal_status },
              { label: 'Người liên hệ', ok: !!form.contact_phone },
            ].map(({ label, ok }) => (
              <div key={label} className="flex items-center gap-2">
                {ok
                  ? <CheckCircle className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                  : <div className="w-3.5 h-3.5 border-2 border-gray-300 rounded-full flex-shrink-0" />}
                <span className={`text-[11px] ${ok ? 'text-gray-700' : 'text-gray-400'}`}>{label}</span>
              </div>
            ))}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-2.5">
            <p className="text-[10px] font-bold text-blue-800 mb-1">Mẹo tăng điểm</p>
            {form.title.length < 30 && <p className="text-[10px] text-blue-700 mb-0.5">• Tiêu đề quá ngắn — thêm khu vực & diện tích</p>}
            {form.description.length < 120 && <p className="text-[10px] text-blue-700 mb-0.5">• Mô tả thêm tiện ích, vị trí, ưu điểm</p>}
            {!form.latitude && <p className="text-[10px] text-blue-700 mb-0.5">• Click bản đồ để lấy tọa độ</p>}
            {!form.image_url && <p className="text-[10px] text-blue-700">• Thêm ảnh đại diện</p>}
          </div>
        </div>
      </div>

      <div className="flex justify-end gap-3 px-6 py-4 border-t border-gray-100 bg-gray-50">
        <button onClick={onCancel} className="border border-gray-200 text-gray-600 px-5 py-2.5 rounded-lg text-sm hover:bg-gray-100 transition-colors">Hủy</button>
        <button onClick={handleSaveClick} disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2 shadow-sm">
          <Save className="w-4 h-4" />{saving ? 'Đang lưu...' : 'Lưu BĐS'}
        </button>
      </div>
    </div>
  );
}


// ─── CMS Content Tab ──────────────────────────────────────────────────────────
function CmsContentTab() {
  const [items, setItems] = useState<SiteContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editVals, setEditVals] = useState<Record<string, string>>({});
  const [activeSection, setActiveSection] = useState('hero');
  const [saved, setSaved] = useState<Record<string, boolean>>({});

  useEffect(() => {
    adminGetAllSiteContent().then(data => {
      setItems(data);
      const vals: Record<string, string> = {};
      data.forEach(item => { vals[item.id] = item.value ?? ''; });
      setEditVals(vals);
      setLoading(false);
    });
  }, []);

  const sections = [...new Set(items.map(i => i.section))];
  const sectionItems = items.filter(i => i.section === activeSection);

  const handleSave = async (id: string) => {
    setSaving(id);
    try {
      await updateSiteContent(id, editVals[id] ?? '');
      setSaved(s => ({ ...s, [id]: true }));
      setTimeout(() => setSaved(s => ({ ...s, [id]: false })), 2000);
    } catch (e) { console.error("[AdminPanel]", e); } finally { setSaving(null); }
  };

  const SECTION_LABELS: Record<string, string> = {
    navbar: 'Menu điều hướng', hero: 'Trang chủ – Hero', stats: 'Thống kê',
    featured: 'Section Nổi bật', hot: 'Section HOT', whyus: 'Tại sao chọn chúng tôi',
    cta: 'Banner CTA', footer: 'Footer',
  };

  if (loading) return <div className="text-center py-12"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <Globe className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-blue-900">Chỉnh sửa nội dung trang web</p>
          <p className="text-xs text-blue-700 mt-0.5">Mọi thay đổi sẽ hiển thị ngay trên trang web sau khi lưu. Không cần đụng vào code.</p>
        </div>
      </div>

      {/* Section tabs */}
      <div className="flex flex-wrap gap-2">
        {sections.map(sec => (
          <button key={sec} onClick={() => setActiveSection(sec)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeSection === sec ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-red-400'}`}>
            {SECTION_LABELS[sec] ?? sec}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="bg-gray-50 border-b border-gray-200 px-4 py-3">
          <h3 className="font-bold text-gray-900 text-sm">{SECTION_LABELS[activeSection] ?? activeSection}</h3>
          <p className="text-gray-400 text-xs mt-0.5">{sectionItems.length} mục có thể chỉnh sửa</p>
        </div>
        <div className="divide-y divide-gray-100">
          {sectionItems.map(item => (
            <div key={item.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">{item.label}</label>
                  {item.type === 'textarea' || (editVals[item.id] ?? '').length > 80 ? (
                    <textarea
                      value={editVals[item.id] ?? ''}
                      onChange={e => setEditVals(v => ({ ...v, [item.id]: e.target.value }))}
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    />
                  ) : item.type === 'image_url' ? (
                    <ImageUrlInput value={editVals[item.id] ?? ''} onChange={url => setEditVals(v => ({ ...v, [item.id]: url }))} />
                  ) : (
                    <input
                      type="text"
                      value={editVals[item.id] ?? ''}
                      onChange={e => setEditVals(v => ({ ...v, [item.id]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  )}
                  <p className="text-gray-400 text-[10px] mt-1">key: <code className="bg-gray-100 px-1 rounded">{item.section}.{item.key}</code></p>
                </div>
                <button
                  onClick={() => handleSave(item.id)}
                  disabled={saving === item.id}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex-shrink-0 mt-5 ${saved[item.id] ? 'bg-emerald-100 text-emerald-700' : 'bg-red-600 hover:bg-red-700 text-white'}`}
                >
                  {saving === item.id ? <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                    : saved[item.id] ? <CheckCircle className="w-3.5 h-3.5" />
                    : <Save className="w-3.5 h-3.5" />}
                  {saved[item.id] ? 'Đã lưu' : 'Lưu'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Site Settings Tab ────────────────────────────────────────────────────────
function SiteSettingsTab() {
  const [settings, setSettings] = useState<SiteSetting[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [editVals, setEditVals] = useState<Record<string, string>>({});
  const [savedKeys, setSavedKeys] = useState<Record<string, boolean>>({});
  const [activeGroup, setActiveGroup] = useState('general');

  useEffect(() => {
    adminGetAllSiteSettings().then(data => {
      setSettings(data);
      const vals: Record<string, string> = {};
      data.forEach(s => { vals[s.key] = s.value ?? ''; });
      setEditVals(vals);
      setLoading(false);
    });
  }, []);

  const groups = [...new Set(settings.map(s => s.group_name))];
  const groupSettings = settings.filter(s => s.group_name === activeGroup);

  const handleSave = async (key: string) => {
    setSaving(key);
    try {
      await updateSiteSetting(key, editVals[key] ?? '');
      setSavedKeys(s => ({ ...s, [key]: true }));
      setTimeout(() => setSavedKeys(s => ({ ...s, [key]: false })), 2000);
    } catch (e) { console.error("[AdminPanel]", e); } finally { setSaving(null); }
  };

  const GROUP_LABELS: Record<string, string> = {
    general: 'Chung', contact: 'Liên hệ', social: 'Mạng xã hội', seo: 'SEO',
    footer: 'Footer', hero: 'Hero / Banner', sections: 'Tiêu đề Section',
  };

  if (loading) return <div className="text-center py-12"><div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" /></div>;

  return (
    <div className="space-y-4">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
        <Settings className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-amber-900">Cài đặt trang web</p>
          <p className="text-xs text-amber-700 mt-0.5">Thay đổi tên, logo, thông tin liên hệ, SEO mà không cần sửa code.</p>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        {groups.map(g => (
          <button key={g} onClick={() => setActiveGroup(g)}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${activeGroup === g ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-red-400'}`}>
            {GROUP_LABELS[g] ?? g}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="divide-y divide-gray-100">
          {groupSettings.map(setting => (
            <div key={setting.key} className="p-4">
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <label className="block text-xs font-bold text-gray-700 mb-1.5">{setting.label}</label>
                  {setting.type === 'textarea' ? (
                    <textarea
                      value={editVals[setting.key] ?? ''}
                      onChange={e => setEditVals(v => ({ ...v, [setting.key]: e.target.value }))}
                      rows={3}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none"
                    />
                  ) : setting.type === 'color' ? (
                    <div className="flex items-center gap-2">
                      <input type="color" value={editVals[setting.key] ?? '#dc2626'}
                        onChange={e => setEditVals(v => ({ ...v, [setting.key]: e.target.value }))}
                        className="w-10 h-10 rounded cursor-pointer border border-gray-200" />
                      <input type="text" value={editVals[setting.key] ?? ''}
                        onChange={e => setEditVals(v => ({ ...v, [setting.key]: e.target.value }))}
                        className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
                    </div>
                  ) : (
                    <input
                      type={setting.type === 'url' ? 'url' : setting.type === 'phone' ? 'tel' : 'text'}
                      value={editVals[setting.key] ?? ''}
                      onChange={e => setEditVals(v => ({ ...v, [setting.key]: e.target.value }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                    />
                  )}
                  <p className="text-gray-400 text-[10px] mt-1">key: <code className="bg-gray-100 px-1 rounded">{setting.key}</code></p>
                </div>
                <button onClick={() => handleSave(setting.key)} disabled={saving === setting.key}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg transition-colors flex-shrink-0 mt-5 ${savedKeys[setting.key] ? 'bg-emerald-100 text-emerald-700' : 'bg-red-600 hover:bg-red-700 text-white'}`}>
                  {saving === setting.key ? <div className="w-3.5 h-3.5 border border-white border-t-transparent rounded-full animate-spin" />
                    : savedKeys[setting.key] ? <CheckCircle className="w-3.5 h-3.5" />
                    : <Save className="w-3.5 h-3.5" />}
                  {savedKeys[setting.key] ? 'Đã lưu' : 'Lưu'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Banners Tab ──────────────────────────────────────────────────────────────
function BannersTab() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Banner | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => { setLoading(true); const d = await adminGetAllBanners(); setBanners(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  const [form, setForm] = useState<Partial<Banner>>({
    title: '', subtitle: '', cta_text: '', cta_link: '',
    image_url: '', bg_color: '#dc2626', position: 'hero', is_active: true, order_index: 0,
  });

  const openCreate = () => {
    setForm({ title: '', subtitle: '', cta_text: '', cta_link: '', image_url: '', bg_color: '#dc2626', position: 'hero', is_active: true, order_index: banners.length });
    setCreating(true);
  };
  const openEdit = (b: Banner) => { setForm(b); setEditing(b); };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (creating) await createBanner(form as Omit<Banner, 'id' | 'created_at' | 'updated_at'>);
      else if (editing) await updateBanner(editing.id, form);
      await load(); setEditing(null); setCreating(false);
    } catch (e) { console.error("[AdminPanel]", e); } finally { setSaving(false); }
  };

  const POSITION_LABELS: Record<string, string> = {
    hero: 'Hero (Trang chủ)', sidebar: 'Sidebar', footer_cta: 'CTA Footer', listings_top: 'Đầu trang listing',
  };

  if (creating || editing) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6 max-w-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-bold text-gray-900 text-lg">{editing ? 'Sửa banner' : 'Thêm banner mới'}</h2>
          <button onClick={() => { setEditing(null); setCreating(false); }}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Vị trí hiển thị</label>
            <select value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value as Banner['position'] }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
              {Object.entries(POSITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          {[
            { key: 'title', label: 'Tiêu đề *' },
            { key: 'subtitle', label: 'Mô tả phụ' },
            { key: 'cta_text', label: 'Nội dung nút' },
            { key: 'cta_link', label: 'Link nút' },
          ].map(f => (
            <div key={f.key}>
              <label className="text-xs font-semibold text-gray-700 block mb-1">{f.label}</label>
              <input value={(form as Record<string, string>)[f.key] ?? ''}
                onChange={e => setForm(ff => ({ ...ff, [f.key]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
          ))}
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Ảnh nền</label>
            <ImageUrlInput value={form.image_url ?? ''} onChange={url => setForm(f => ({ ...f, image_url: url }))} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-700 block mb-1">Màu nền dự phòng</label>
            <div className="flex items-center gap-2">
              <input type="color" value={form.bg_color ?? '#dc2626'}
                onChange={e => setForm(f => ({ ...f, bg_color: e.target.value }))}
                className="w-10 h-10 rounded cursor-pointer border border-gray-200" />
              <input type="text" value={form.bg_color ?? ''}
                onChange={e => setForm(f => ({ ...f, bg_color: e.target.value }))}
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={form.is_active} onChange={e => setForm(f => ({ ...f, is_active: e.target.checked }))} className="accent-red-500 w-4 h-4" />
            <span className="text-sm font-medium text-gray-700">Đang hiển thị</span>
          </label>
        </div>
        <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
          <button onClick={() => { setEditing(null); setCreating(false); }} className="border border-gray-200 text-gray-600 px-5 py-2.5 rounded-lg text-sm">Hủy</button>
          <button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm flex items-center gap-2">
            <Save className="w-4 h-4" />{saving ? 'Đang lưu...' : 'Lưu'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={openCreate} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm">
          <Plus className="w-4 h-4" />Thêm banner
        </button>
      </div>
      {loading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div> : (
        <div className="space-y-3">
          {banners.map(b => (
            <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4 shadow-sm">
              {b.image_url ? (
                <img src={b.image_url} alt={b.title} className="w-20 h-14 object-cover rounded-lg flex-shrink-0" />
              ) : (
                <div className="w-20 h-14 rounded-lg flex-shrink-0 flex items-center justify-center" style={{ backgroundColor: b.bg_color }}>
                  <ImageIcon className="w-6 h-6 text-white/60" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-gray-900 text-sm truncate">{b.title}</h4>
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{POSITION_LABELS[b.position] ?? b.position}</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${b.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {b.is_active ? 'Hiển thị' : 'Ẩn'}
                  </span>
                </div>
                {b.subtitle && <p className="text-gray-500 text-xs mt-0.5 truncate">{b.subtitle}</p>}
                <div className="flex items-center gap-3 mt-1.5">
                  <span className="flex items-center gap-1 text-[11px] text-gray-500">
                    <Eye className="w-3 h-3" />{(b.impressions ?? 0).toLocaleString('vi-VN')} lượt xem
                  </span>
                  <span className="flex items-center gap-1 text-[11px] text-gray-500">
                    <MousePointer className="w-3 h-3" />{(b.clicks ?? 0).toLocaleString('vi-VN')} click
                  </span>
                  {(b.impressions ?? 0) > 0 && (
                    <span className="text-[11px] text-blue-600 font-medium">
                      CTR: {((b.clicks ?? 0) / (b.impressions ?? 1) * 100).toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button onClick={() => openEdit(b)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => setConfirmDelete(b.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}
          {banners.length === 0 && <div className="text-center py-10 text-gray-400 text-sm bg-white rounded-xl border border-gray-200">Chưa có banner nào</div>}
        </div>
      )}
      {confirmDelete && (
        <ConfirmDialog message="Xóa banner này?" onConfirm={async () => { await deleteBanner(confirmDelete); setConfirmDelete(null); await load(); }} onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}

// ─── Leads Tab ────────────────────────────────────────────────────────────────
function LeadsTab({ onRefreshStats }: { onRefreshStats: () => void }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => { setLoading(true); const data = await getLeads(statusFilter); setLeads(data); setLoading(false); };
  useEffect(() => { load(); }, [statusFilter]);

  const handleStatus = async (id: string, status: Lead['status']) => {
    await updateLeadStatus(id, status); await load(); onRefreshStats();
  };
  const handleDelete = async (id: string) => {
    await deleteLead(id); setConfirmDelete(null); await load(); onRefreshStats();
  };

  const STATUS_CONFIG = {
    new: { label: 'Mới', color: 'bg-blue-100 text-blue-700', dot: 'bg-blue-500' },
    contacted: { label: 'Đã liên hệ', color: 'bg-amber-100 text-amber-700', dot: 'bg-amber-500' },
    closed: { label: 'Hoàn thành', color: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'new', 'contacted', 'closed'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${statusFilter === s ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-red-400'}`}>
            {s === 'all' ? 'Tất cả' : STATUS_CONFIG[s].label}
          </button>
        ))}
        <button onClick={load} className="ml-auto text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1">
          <RefreshCw className="w-3.5 h-3.5" />Làm mới
        </button>
      </div>

      {loading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        : leads.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400">
            <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Chưa có khách hàng tiềm năng nào</p>
          </div>
        ) : (
          <div className="space-y-3">
            {leads.map(lead => (
              <div key={lead.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-gray-900 text-sm">{lead.full_name}</h4>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_CONFIG[lead.status].color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${STATUS_CONFIG[lead.status].dot}`} />
                        {STATUS_CONFIG[lead.status].label}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>
                      {lead.area_interest && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{lead.area_interest}</span>}
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(lead.created_at).toLocaleString('vi-VN')}</span>
                    </div>
                    {lead.message && <p className="mt-2 text-xs text-gray-600 bg-gray-50 rounded-lg p-2.5 italic">"{lead.message}"</p>}
                    {lead.properties && <p className="mt-1 text-xs text-blue-600">BĐS: {lead.properties.title}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <a href={`tel:${lead.phone}`} className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">
                      <Phone className="w-3 h-3" />Gọi
                    </a>
                    <div className="relative group">
                      <button className="flex items-center gap-1 border border-gray-200 text-gray-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-gray-50 transition-colors">
                        Trạng thái <ChevronDown className="w-3 h-3" />
                      </button>
                      <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border border-gray-100 py-1 z-10 hidden group-hover:block min-w-[140px]">
                        {(['new', 'contacted', 'closed'] as const).map(s => (
                          <button key={s} onClick={() => handleStatus(lead.id, s)}
                            className={`w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition-colors ${lead.status === s ? 'font-bold text-red-600' : 'text-gray-700'}`}>
                            {STATUS_CONFIG[s].label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button onClick={() => setConfirmDelete(lead.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

      {confirmDelete && (
        <ConfirmDialog message="Xóa khách hàng này khỏi danh sách?" onConfirm={() => handleDelete(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
      )}
    </div>
  );
}

// ─── Projects Tab ─────────────────────────────────────────────────────────────
function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Project | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => { setLoading(true); const [p, a] = await Promise.all([adminGetAllProjects(), getAreas()]); setProjects(p); setAreas(a); setLoading(false); };
  useEffect(() => { load(); }, []);

  const PHASE_COLORS: Record<string, string> = {
    'Đang mở bán': 'bg-emerald-100 text-emerald-700',
    'Sắp ra mắt': 'bg-amber-100 text-amber-700',
    'Đã bàn giao': 'bg-blue-100 text-blue-700',
  };

  if (creating || editing) {
    const p = editing;
    return (
      <SimpleForm
        title={p ? 'Sửa dự án' : 'Thêm dự án mới'}
        fields={[
          { name: 'name', label: 'Tên dự án *', value: p?.name ?? '', required: true },
          { name: 'location', label: 'Địa điểm', value: p?.location ?? '' },
          { name: 'city', label: 'Tỉnh/TP', value: p?.city ?? '' },
          { name: 'developer', label: 'Chủ đầu tư', value: p?.developer ?? '' },
          { name: 'phase', label: 'Giai đoạn', value: p?.phase ?? 'Đang mở bán', type: 'select', options: ['Đang mở bán', 'Sắp ra mắt', 'Đã bàn giao'] },
          { name: 'price_from', label: 'Giá từ (tỷ)', value: String(p?.price_from ?? ''), type: 'number' },
          { name: 'price_to', label: 'Giá đến (tỷ)', value: String(p?.price_to ?? ''), type: 'number' },
          { name: 'total_units', label: 'Tổng số nền/căn', value: String(p?.total_units ?? ''), type: 'number' },
          { name: 'sold_units', label: 'Đã bán', value: String(p?.sold_units ?? 0), type: 'number' },
          { name: 'image_url', label: 'URL ảnh', value: p?.image_url ?? '' },
          { name: 'description', label: 'Mô tả', value: p?.description ?? '', type: 'textarea' },
        ]}
        areaId={p?.area_id ?? ''}
        areas={areas}
        onSave={async (data) => {
          if (creating) await createProject(data as Omit<Project, 'id' | 'created_at' | 'updated_at' | 'areas'>);
          else if (editing) await updateProject(editing.id, data);
          await load(); setEditing(null); setCreating(false);
        }}
        onCancel={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />Thêm dự án
        </button>
      </div>
      {loading ? <div className="h-40 bg-gray-100 rounded-xl animate-pulse" /> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(proj => (
            <div key={proj.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
              <img src={proj.image_url ?? ''} alt={proj.name} className="w-full h-36 object-cover" />
              <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="font-bold text-gray-900 text-sm line-clamp-2">{proj.name}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${PHASE_COLORS[proj.phase] ?? 'bg-gray-100 text-gray-600'}`}>{proj.phase}</span>
                </div>
                <p className="text-xs text-gray-500 flex items-center gap-1 mb-2"><MapPin className="w-3 h-3 text-red-400" />{proj.location}</p>
                {proj.price_from && <p className="text-red-600 font-bold text-sm">Từ {proj.price_from} → {proj.price_to} tỷ</p>}
                {proj.total_units && (
                  <div className="mt-2">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>Đã bán: {proj.sold_units}/{proj.total_units}</span>
                      <span>{Math.round((proj.sold_units / proj.total_units) * 100)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(proj.sold_units / proj.total_units) * 100}%` }} />
                    </div>
                  </div>
                )}
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setEditing(proj)} className="flex-1 border border-blue-400 text-blue-600 text-xs font-semibold py-1.5 rounded-lg hover:bg-blue-50 transition-colors flex items-center justify-center gap-1"><Edit2 className="w-3 h-3" />Sửa</button>
                  <button onClick={() => setConfirmDelete(proj.id)} className="flex-1 border border-red-300 text-red-600 text-xs font-semibold py-1.5 rounded-lg hover:bg-red-50 transition-colors flex items-center justify-center gap-1"><Trash2 className="w-3 h-3" />Xóa</button>
                </div>
              </div>
            </div>
          ))}
          {projects.length === 0 && <div className="col-span-3 text-center py-8 text-gray-400 text-sm">Chưa có dự án nào</div>}
        </div>
      )}
      {confirmDelete && <ConfirmDialog message="Xóa dự án này?" onConfirm={async () => { await deleteProject(confirmDelete); setConfirmDelete(null); await load(); }} onCancel={() => setConfirmDelete(null)} />}
    </div>
  );
}

// ─── News Tab ─────────────────────────────────────────────────────────────────
function NewsTab() {
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<NewsArticle | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const CATEGORIES = ['Thị trường', 'Hạ tầng', 'Đầu tư', 'Hướng dẫn', 'Tài chính', 'Quy hoạch'];

  const load = async () => { setLoading(true); const d = await adminGetAllNews(); setArticles(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  const a = editing;
  if (creating || editing) {
    return (
      <SimpleForm
        title={a ? 'Sửa bài viết' : 'Viết bài mới'}
        fields={[
          { name: 'title', label: 'Tiêu đề *', value: a?.title ?? '', required: true },
          { name: 'slug', label: 'Slug URL *', value: a?.slug ?? '', required: true },
          { name: 'category', label: 'Danh mục', value: a?.category ?? 'Thị trường', type: 'select', options: CATEGORIES },
          { name: 'author', label: 'Tác giả', value: a?.author ?? 'Ban biên tập' },
          { name: 'image_url', label: 'URL ảnh bìa', value: a?.image_url ?? '' },
          { name: 'excerpt', label: 'Tóm tắt', value: a?.excerpt ?? '', type: 'textarea' },
          { name: 'content', label: 'Nội dung đầy đủ', value: a?.content ?? '', type: 'textarea', rows: 8 },
        ]}
        onSave={async (data) => {
          const payload = { ...data, is_published: true };
          if (creating) await createNews(payload as Omit<NewsArticle, 'id' | 'created_at' | 'updated_at' | 'views'>);
          else if (editing) await updateNews(editing.id, payload);
          await load(); setEditing(null); setCreating(false);
        }}
        onCancel={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />Viết bài mới
        </button>
      </div>
      {loading ? <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 bg-gray-100 rounded-xl animate-pulse" />)}</div> : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600">Tiêu đề</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 hidden md:table-cell">Danh mục</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-600 hidden lg:table-cell">Ngày đăng</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600 hidden lg:table-cell">Lượt xem</th>
                <th className="text-center px-4 py-3 text-xs font-semibold text-gray-600">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {articles.map(a => (
                <tr key={a.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {a.image_url && <img src={a.image_url} alt="" className="w-12 h-9 object-cover rounded-lg flex-shrink-0" />}
                      <div>
                        <p className="font-medium text-gray-900 text-sm line-clamp-1 max-w-xs">{a.title}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${a.is_published ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                          {a.is_published ? 'Đã đăng' : 'Nháp'}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 hidden md:table-cell"><span className="text-[11px] bg-amber-50 text-amber-700 px-2 py-0.5 rounded">{a.category}</span></td>
                  <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">{new Date(a.created_at).toLocaleDateString('vi-VN')}</td>
                  <td className="px-4 py-3 text-center text-xs text-gray-500 hidden lg:table-cell">
                    <span className="flex items-center justify-center gap-1"><Eye className="w-3 h-3" />{a.views}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setEditing(a)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                      <button onClick={async () => { await updateNews(a.id, { is_published: !a.is_published }); await load(); }}
                        className={`p-1.5 rounded-lg transition-colors ${a.is_published ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}`}>
                        {a.is_published ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                      </button>
                      <button onClick={() => setConfirmDelete(a.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {articles.length === 0 && <div className="text-center py-8 text-gray-400 text-sm">Chưa có bài viết nào</div>}
        </div>
      )}
      {confirmDelete && <ConfirmDialog message="Xóa bài viết này?" onConfirm={async () => { await deleteNews(confirmDelete); setConfirmDelete(null); await load(); }} onCancel={() => setConfirmDelete(null)} />}
    </div>
  );
}

// ─── Testimonials Tab ─────────────────────────────────────────────────────────
function TestimonialsTab() {
  const [testimonials, setTestimonials] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Testimonial | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => { setLoading(true); const d = await adminGetTestimonials(); setTestimonials(d); setLoading(false); };
  useEffect(() => { load(); }, []);

  const t = editing;
  if (creating || editing) {
    return (
      <SimpleForm
        title={t ? 'Sửa đánh giá' : 'Thêm đánh giá mới'}
        fields={[
          { name: 'name', label: 'Họ tên *', value: t?.name ?? '', required: true },
          { name: 'location', label: 'Địa điểm', value: t?.location ?? '' },
          { name: 'rating', label: 'Đánh giá (1-5)', value: String(t?.rating ?? 5), type: 'number' },
          { name: 'content', label: 'Nội dung *', value: t?.content ?? '', required: true, type: 'textarea' },
        ]}
        onSave={async (data) => {
          const payload = { ...data, rating: parseInt(String(data.rating)) || 5, is_active: true };
          if (creating) await createTestimonial(payload as Omit<Testimonial, 'id' | 'created_at'>);
          else if (editing) await updateTestimonial(editing.id, payload);
          await load(); setEditing(null); setCreating(false);
        }}
        onCancel={() => { setEditing(null); setCreating(false); }}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setCreating(true)} className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-lg text-sm transition-colors">
          <Plus className="w-4 h-4" />Thêm đánh giá
        </button>
      </div>
      {loading ? <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}</div> : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {testimonials.map(t => (
            <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="font-bold text-gray-900 text-sm">{t.name}</p>
                  {t.location && <p className="text-gray-400 text-xs">{t.location}</p>}
                  <div className="flex gap-0.5 mt-1">
                    {Array.from({ length: t.rating }).map((_, i) => <Star key={i} className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />)}
                  </div>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(t)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setConfirmDelete(t.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <p className="text-gray-600 text-xs italic line-clamp-3">"{t.content}"</p>
              <button onClick={async () => { await updateTestimonial(t.id, { is_active: !t.is_active }); await load(); }}
                className={`mt-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${t.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                {t.is_active ? 'Đang hiển thị' : 'Đã ẩn'}
              </button>
            </div>
          ))}
          {testimonials.length === 0 && <div className="col-span-3 text-center py-8 text-gray-400 text-sm">Chưa có đánh giá nào</div>}
        </div>
      )}
      {confirmDelete && <ConfirmDialog message="Xóa đánh giá này?" onConfirm={async () => { await deleteTestimonial(confirmDelete); setConfirmDelete(null); await load(); }} onCancel={() => setConfirmDelete(null)} />}
    </div>
  );
}

// ─── User Listings Approval Tab ───────────────────────────────────────────────
function UserListingsApprovalTab({ onRefreshStats }: { onRefreshStats: () => void }) {
  const [listings, setListings] = useState<UserListing[]>([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [loading, setLoading] = useState(true);
  const [rejectModal, setRejectModal] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);

  const load = async () => { setLoading(true); const data = await adminGetUserListings(statusFilter); setListings(data); setLoading(false); };
  useEffect(() => { load(); }, [statusFilter]);

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try { await approveUserListing(id); await load(); onRefreshStats(); }
    catch (e) { console.error("[AdminPanel]", e); } finally { setProcessingId(null); }
  };
  const handleReject = async () => {
    if (!rejectModal) return;
    setProcessingId(rejectModal);
    try { await rejectUserListing(rejectModal, rejectReason || 'Không đáp ứng yêu cầu đăng tin'); await load(); onRefreshStats(); }
    catch (e) { console.error("[AdminPanel]", e); } finally { setProcessingId(null); setRejectModal(null); setRejectReason(''); }
  };

  const STATUS_CONFIG = {
    pending: { label: 'Chờ duyệt', cls: 'bg-amber-100 text-amber-700' },
    approved: { label: 'Đã duyệt', cls: 'bg-emerald-100 text-emerald-700' },
    rejected: { label: 'Từ chối', cls: 'bg-red-100 text-red-700' },
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        {(['all', 'pending', 'approved', 'rejected'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${statusFilter === s ? 'bg-red-600 text-white' : 'bg-white border border-gray-200 text-gray-600 hover:border-red-400'}`}>
            {s === 'all' ? 'Tất cả' : STATUS_CONFIG[s]?.label}
          </button>
        ))}
      </div>

      {loading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)}</div>
        : listings.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200 text-gray-400">
            <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Không có tin đăng nào trong trạng thái này</p>
          </div>
        ) : (
          <div className="space-y-3">
            {listings.map(listing => (
              <div key={listing.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                <div className="flex gap-4">
                  <div className="w-20 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-gray-100">
                    {listing.image_url
                      ? <img src={listing.image_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center"><Building2 className="w-6 h-6 text-gray-300" /></div>
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div>
                        <h4 className="font-bold text-gray-900 text-sm line-clamp-1">{listing.title}</h4>
                        <p className="text-red-600 font-bold text-sm">{listing.price} {listing.price_unit}</p>
                        <div className="flex gap-3 text-xs text-gray-500 mt-1 flex-wrap">
                          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{listing.city}</span>
                          <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{listing.contact_phone}</span>
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{new Date(listing.created_at).toLocaleString('vi-VN')}</span>
                        </div>
                        {listing.status === 'rejected' && listing.reject_reason && (
                          <p className="text-xs text-red-600 mt-1 bg-red-50 px-2 py-1 rounded">Lý do: {listing.reject_reason}</p>
                        )}
                      </div>
                      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_CONFIG[listing.status].cls}`}>
                        {STATUS_CONFIG[listing.status].label}
                      </span>
                    </div>
                  </div>
                  {listing.status === 'pending' && (
                    <div className="flex flex-col gap-2 flex-shrink-0">
                      <button onClick={() => handleApprove(listing.id)} disabled={processingId === listing.id}
                        className="flex items-center gap-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60">
                        <CheckCircle className="w-3.5 h-3.5" />Duyệt
                      </button>
                      <button onClick={() => { setRejectModal(listing.id); setRejectReason(''); }}
                        className="flex items-center gap-1 border border-red-300 text-red-600 text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors">
                        <XCircle className="w-3.5 h-3.5" />Từ chối
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

      {rejectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setRejectModal(null)} />
          <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-bold text-gray-900 mb-3">Từ chối tin đăng</h3>
            <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)}
              placeholder="Lý do từ chối (không bắt buộc)..." rows={3}
              className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none mb-4" />
            <div className="flex gap-3">
              <button onClick={() => setRejectModal(null)} className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl text-sm">Hủy</button>
              <button onClick={handleReject} disabled={!!processingId}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60">
                {processingId ? 'Đang xử lý...' : 'Xác nhận từ chối'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── SimpleForm ───────────────────────────────────────────────────────────────
function SimpleForm({ title, fields, areaId, areas, onSave, onCancel }: {
  title: string;
  fields: { name: string; label: string; value: string; type?: string; required?: boolean; options?: string[]; rows?: number }[];
  areaId?: string; areas?: Area[];
  onSave: (data: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const init: Record<string, string> = {};
  fields.forEach(f => { init[f.name] = f.value; });
  if (areaId !== undefined) init['area_id'] = areaId;

  const [form, setForm] = useState(init);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); } catch (e) { console.error("[AdminPanel]", e); } finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 max-w-2xl">
      <div className="flex items-center justify-between mb-5">
        <h2 className="font-bold text-gray-900 text-lg">{title}</h2>
        <button onClick={onCancel}><X className="w-5 h-5 text-gray-400 hover:text-gray-600" /></button>
      </div>
      <div className="space-y-3">
        {areas && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Khu vực</label>
            <select value={form['area_id'] ?? ''} onChange={e => setForm(f => ({ ...f, area_id: e.target.value }))}
              className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
              <option value="">-- Chọn khu vực --</option>
              {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        )}
        {fields.map(f => (
          <div key={f.name}>
            <label className="block text-xs font-semibold text-gray-700 mb-1">{f.label}</label>
            {f.type === 'textarea' ? (
              <textarea value={form[f.name] ?? ''} onChange={e => setForm(ff => ({ ...ff, [f.name]: e.target.value }))}
                rows={f.rows ?? 4} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
            ) : f.type === 'select' ? (
              <select value={form[f.name] ?? ''} onChange={e => setForm(ff => ({ ...ff, [f.name]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400">
                {f.options?.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input type={f.type ?? 'text'} value={form[f.name] ?? ''} onChange={e => setForm(ff => ({ ...ff, [f.name]: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
            )}
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-3 mt-5 pt-4 border-t border-gray-100">
        <button onClick={onCancel} className="border border-gray-200 text-gray-600 px-5 py-2.5 rounded-lg text-sm hover:bg-gray-50 transition-colors">Hủy</button>
        <button onClick={handleSave} disabled={saving}
          className="bg-red-600 hover:bg-red-700 text-white font-semibold px-6 py-2.5 rounded-lg text-sm transition-colors flex items-center gap-2">
          <Save className="w-4 h-4" />{saving ? 'Đang lưu...' : 'Lưu'}
        </button>
      </div>
    </div>
  );
}

// ─── Backup Tab ───────────────────────────────────────────────────────────────
function BackupTab() {
  const TABLES = [
    { id: 'properties', label: 'Bất động sản', icon: <Building2 className="w-4 h-4" /> },
    { id: 'leads', label: 'Khách hàng (Leads)', icon: <Users className="w-4 h-4" /> },
    { id: 'user_listings', label: 'Tin đăng người dùng', icon: <FileText className="w-4 h-4" /> },
    { id: 'projects', label: 'Dự án', icon: <FolderOpen className="w-4 h-4" /> },
    { id: 'news', label: 'Tin tức', icon: <Newspaper className="w-4 h-4" /> },
    { id: 'testimonials', label: 'Đánh giá', icon: <Star className="w-4 h-4" /> },
    { id: 'site_settings', label: 'Cài đặt hệ thống', icon: <Settings className="w-4 h-4" /> },
    { id: 'site_content', label: 'Nội dung CMS', icon: <Type className="w-4 h-4" /> },
  ];

  const [loading, setLoading] = useState<string | null>(null);
  const [lastExport, setLastExport] = useState<string | null>(null);

  const downloadJSON = async (tableId: string, label: string) => {
    setLoading(tableId);
    try {
      const data = await exportTableData(tableId);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${tableId}_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLastExport(`${label} — ${new Date().toLocaleTimeString('vi-VN')}`);
    } catch {
      alert('Lỗi xuất dữ liệu. Vui lòng thử lại.');
    } finally {
      setLoading(null);
    }
  };

  const downloadAll = async () => {
    setLoading('all');
    try {
      const results: Record<string, unknown[]> = {};
      for (const t of TABLES) {
        results[t.id] = await exportTableData(t.id);
      }
      const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `full_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setLastExport(`Toàn bộ dữ liệu — ${new Date().toLocaleTimeString('vi-VN')}`);
    } catch {
      alert('Lỗi xuất dữ liệu. Vui lòng thử lại.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Sao lưu dữ liệu</h2>
        <p className="text-gray-500 text-sm mt-0.5">Xuất dữ liệu dạng JSON để sao lưu hoặc chuyển đổi hosting.</p>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
        <Shield className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-amber-800 text-sm font-semibold">Sao lưu định kỳ được khuyến nghị</p>
          <p className="text-amber-700 text-xs mt-0.5">Xuất dữ liệu ít nhất 1 lần/tuần. File JSON có thể import lại khi chuyển hosting.</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-gray-900 text-sm">Xuất toàn bộ dữ liệu</h3>
          <button
            onClick={downloadAll}
            disabled={loading === 'all'}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2.5 rounded-xl text-sm transition-colors disabled:opacity-60"
          >
            {loading === 'all'
              ? <RefreshCw className="w-4 h-4 animate-spin" />
              : <Download className="w-4 h-4" />}
            {loading === 'all' ? 'Đang xuất...' : 'Xuất tất cả (.json)'}
          </button>
        </div>
        {lastExport && (
          <p className="text-emerald-600 text-xs flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />Đã xuất: {lastExport}
          </p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 text-sm">Xuất từng bảng dữ liệu</h3>
        </div>
        <div className="divide-y divide-gray-50">
          {TABLES.map(t => (
            <div key={t.id} className="flex items-center justify-between px-5 py-3.5">
              <div className="flex items-center gap-3">
                <span className="text-gray-400">{t.icon}</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">{t.label}</p>
                  <p className="text-xs text-gray-400 font-mono">{t.id}</p>
                </div>
              </div>
              <button
                onClick={() => downloadJSON(t.id, t.label)}
                disabled={loading === t.id || loading === 'all'}
                className="flex items-center gap-1.5 border border-gray-200 text-gray-600 hover:border-red-400 hover:text-red-600 text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40"
              >
                {loading === t.id
                  ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  : <Download className="w-3.5 h-3.5" />}
                Xuất JSON
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 space-y-1">
        <p className="font-semibold text-gray-700 mb-2">Hướng dẫn khôi phục dữ liệu:</p>
        <p>1. Đăng nhập Supabase Dashboard của hosting mới</p>
        <p>2. Vào Table Editor → Import từng bảng bằng file .json tương ứng</p>
        <p>3. Hoặc dùng API Supabase để import hàng loạt</p>
        <p>4. Cập nhật các biến môi trường SUPABASE_URL và SUPABASE_ANON_KEY trong file .env</p>
      </div>
    </div>
  );
}

// ─── AI Analytics Tab ─────────────────────────────────────────────────────────
function AiAnalyticsTab() {
  const [loading, setLoading] = useState(false);
  const [analysis, setAnalysis] = useState('');
  const [error, setError] = useState('');
  const [lastRun, setLastRun] = useState<string | null>(null);

  const run = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await callAiAnalytics();
      setAnalysis(result.analysis);
      setLastRun(new Date().toLocaleString('vi-VN'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra. Vui lòng thử lại.');
    } finally { setLoading(false); }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(analysis).catch(() => {});
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-red-500" />AI Phân Tích Thị Trường
          </h2>
          <p className="text-gray-500 text-sm mt-0.5">
            AI đọc toàn bộ số liệu thống kê và đưa ra nhận xét chuyên sâu về xu hướng thị trường BĐS vùng ven.
          </p>
        </div>
        <button
          onClick={run}
          disabled={loading}
          className="flex items-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white font-bold px-5 py-2.5 rounded-xl text-sm transition-all shadow-sm disabled:opacity-60 flex-shrink-0"
        >
          {loading
            ? <><RefreshCw className="w-4 h-4 animate-spin" />Đang phân tích...</>
            : <><TrendingUp className="w-4 h-4" />AI Phân Tích Ngay</>
          }
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 p-4 bg-gradient-to-r from-slate-50 to-gray-50 rounded-xl border border-gray-200">
        {[
          { icon: <Building2 className="w-4 h-4 text-blue-500" />, label: 'Phân tích BĐS', desc: 'Cơ cấu mua bán / cho thuê, tỷ lệ BĐS hot' },
          { icon: <Users className="w-4 h-4 text-emerald-500" />, label: 'Đánh giá Leads', desc: 'Xu hướng tăng trưởng, tỷ lệ xử lý' },
          { icon: <BarChart3 className="w-4 h-4 text-purple-500" />, label: 'Chiến lược', desc: 'Gợi ý hành động cụ thể từ AI' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-lg p-3 border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2 mb-1">{c.icon}<span className="text-xs font-bold text-gray-800">{c.label}</span></div>
            <p className="text-[11px] text-gray-500 leading-relaxed">{c.desc}</p>
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-red-800 text-sm font-semibold">Lỗi phân tích</p>
            <p className="text-red-700 text-xs mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {loading && (
        <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
          <div className="w-12 h-12 border-3 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderWidth: 3 }} />
          <p className="font-semibold text-gray-700">AI đang đọc dữ liệu và phân tích...</p>
          <p className="text-gray-400 text-sm mt-1">Quá trình này mất khoảng 5-15 giây</p>
        </div>
      )}

      {analysis && !loading && (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-sm font-bold text-gray-800">Kết quả phân tích AI</span>
              {lastRun && <span className="text-xs text-gray-400">— {lastRun}</span>}
            </div>
            <button
              onClick={copyToClipboard}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-800 border border-gray-200 hover:border-gray-300 px-3 py-1.5 rounded-lg transition-colors"
            >
              <Download className="w-3.5 h-3.5" />Sao chép
            </button>
          </div>
          <div className="p-5">
            <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed whitespace-pre-wrap text-sm">
              {analysis}
            </div>
          </div>
        </div>
      )}

      {!analysis && !loading && !error && (
        <div className="bg-white border-2 border-dashed border-gray-200 rounded-xl p-10 text-center">
          <div className="w-16 h-16 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-8 h-8 text-red-400" />
          </div>
          <h3 className="font-bold text-gray-800 mb-1.5">Bắt đầu phân tích với AI</h3>
          <p className="text-gray-400 text-sm mb-4 max-w-sm mx-auto">
            Nhấn nút "AI Phân Tích Ngay" để nhận báo cáo thị trường BĐS chuyên sâu được tạo tự động từ dữ liệu thực tế của website.
          </p>
          <button onClick={run} className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 py-2.5 rounded-xl text-sm transition-colors">
            Phân tích ngay
          </button>
        </div>
      )}
    </div>
  );
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────
function ConfirmDialog({ message, onConfirm, onCancel }: { message: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-xl shadow-2xl p-6 max-w-sm w-full mx-4">
        <div className="flex items-start gap-3 mb-4">
          <AlertCircle className="w-6 h-6 text-red-500 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="font-bold text-gray-900">Xác nhận xóa</h3>
            <p className="text-gray-600 text-sm mt-1">{message}</p>
          </div>
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onCancel} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">Hủy</button>
          <button onClick={onConfirm} className="bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-lg text-sm transition-colors">Xóa</button>
        </div>
      </div>
    </div>
  );
}

// ─── FeaturedSectionsTab ──────────────────────────────────────────────────────
const BLANK_SECTION: Omit<FeaturedSection, 'id' | 'created_at' | 'updated_at'> = {
  title: '', subtitle: null, mode: 'auto',
  filter_area_id: null, filter_listing_type: null, filter_property_type_id: null,
  filter_is_hot: false, filter_is_featured: false,
  auto_sort: 'newest', display_count: 8, display_style: 'grid',
  is_active: true, order_index: 0,
};

function FeaturedSectionsTab() {
  const [sections, setSections] = useState<FeaturedSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSection, setEditingSection] = useState<Partial<FeaturedSection> | null>(null);
  const [isNew, setIsNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [manualItems, setManualItems] = useState<FeaturedSectionItem[]>([]);
  const [allProperties, setAllProperties] = useState<Property[]>([]);
  const [propSearch, setPropSearch] = useState('');
  const [areas, setAreas] = useState<Area[]>([]);
  const [types, setTypes] = useState<PropertyType[]>([]);

  const load = () => {
    setLoading(true);
    Promise.all([adminGetFeaturedSections(), getAreas(), getPropertyTypes()])
      .then(([s, a, t]) => { setSections(s); setAreas(a); setTypes(t); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setIsNew(true);
    setEditingSection({ ...BLANK_SECTION, order_index: sections.length });
    setManualItems([]);
    setError('');
  };

  const openEdit = async (s: FeaturedSection) => {
    setIsNew(false);
    setEditingSection({ ...s });
    setError('');
    if (s.mode === 'manual') {
      const items = await adminGetSectionItems(s.id);
      setManualItems(items);
    } else {
      setManualItems([]);
    }
    if (allProperties.length === 0) {
      adminGetAllProperties().then(setAllProperties);
    }
  };

  const openManualPicker = async () => {
    if (allProperties.length === 0) {
      const props = await adminGetAllProperties();
      setAllProperties(props);
    }
  };

  const handleSave = async () => {
    if (!editingSection?.title?.trim()) { setError('Tiêu đề không được để trống'); return; }
    setSaving(true); setError('');
    try {
      const payload = {
        title: editingSection.title!,
        subtitle: editingSection.subtitle ?? null,
        mode: editingSection.mode ?? 'auto',
        filter_area_id: editingSection.filter_area_id ?? null,
        filter_listing_type: editingSection.filter_listing_type ?? null,
        filter_property_type_id: editingSection.filter_property_type_id ?? null,
        filter_is_hot: editingSection.filter_is_hot ?? false,
        filter_is_featured: editingSection.filter_is_featured ?? false,
        auto_sort: editingSection.auto_sort ?? 'newest',
        display_count: editingSection.display_count ?? 8,
        display_style: editingSection.display_style ?? 'grid',
        is_active: editingSection.is_active ?? true,
        order_index: editingSection.order_index ?? 0,
      };
      if (isNew) {
        const created = await adminCreateFeaturedSection(payload);
        if (editingSection.mode === 'manual') {
          await adminSetSectionItems(created.id, manualItems.map(i => i.property_id));
        }
      } else {
        await adminUpdateFeaturedSection(editingSection.id!, payload);
        if (editingSection.mode === 'manual') {
          await adminSetSectionItems(editingSection.id!, manualItems.map(i => i.property_id));
        }
      }
      setEditingSection(null);
      load();
    } catch (e: any) {
      setError(e.message ?? 'Lỗi khi lưu');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    await adminDeleteFeaturedSection(id);
    setConfirmDelete(null);
    load();
  };

  const moveSection = async (index: number, dir: 'up' | 'down') => {
    const arr = [...sections];
    const swap = dir === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= arr.length) return;
    [arr[index], arr[swap]] = [arr[swap], arr[index]];
    setSections(arr);
    await Promise.all([
      adminUpdateFeaturedSection(arr[index].id, { order_index: index }),
      adminUpdateFeaturedSection(arr[swap].id, { order_index: swap }),
    ]);
  };

  const addManualItem = (prop: Property) => {
    if (manualItems.some(i => i.property_id === prop.id)) return;
    const newItem: FeaturedSectionItem = {
      id: `temp-${prop.id}`, section_id: editingSection?.id ?? '', property_id: prop.id,
      order_index: manualItems.length, created_at: '',
      properties: prop,
    };
    setManualItems(prev => [...prev, newItem]);
  };

  const removeManualItem = (propertyId: string) => {
    setManualItems(prev => prev.filter(i => i.property_id !== propertyId).map((i, idx) => ({ ...i, order_index: idx })));
  };

  const moveManualItem = (index: number, dir: 'up' | 'down') => {
    const arr = [...manualItems];
    const swap = dir === 'up' ? index - 1 : index + 1;
    if (swap < 0 || swap >= arr.length) return;
    [arr[index], arr[swap]] = [arr[swap], arr[index]];
    setManualItems(arr.map((i, idx) => ({ ...i, order_index: idx })));
  };

  const filteredProps = allProperties.filter(p =>
    !propSearch || p.title.toLowerCase().includes(propSearch.toLowerCase()) ||
    (p.city ?? '').toLowerCase().includes(propSearch.toLowerCase())
  );

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-8 h-8 border-4 border-red-600 border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-bold text-gray-900 text-lg">Quản lý Tin đăng nổi bật</h2>
          <p className="text-gray-500 text-sm mt-0.5">Tạo và sắp xếp các nhóm tin hiển thị trên trang chủ</p>
        </div>
        <button onClick={openCreate} className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-semibold flex items-center gap-2 transition-colors">
          <Plus className="w-4 h-4" />Thêm nhóm mới
        </button>
      </div>

      {sections.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
          <Layers className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">Chưa có nhóm tin nào. Nhấn "Thêm nhóm mới" để bắt đầu.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sections.map((s, i) => (
            <div key={s.id} className={`bg-white rounded-xl border ${s.is_active ? 'border-gray-200' : 'border-gray-100 opacity-60'} p-4 flex items-center gap-4`}>
              <div className="flex flex-col gap-1">
                <button onClick={() => moveSection(i, 'up')} disabled={i === 0} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => moveSection(i, 'down')} disabled={i === sections.length - 1} className="p-0.5 text-gray-400 hover:text-gray-700 disabled:opacity-30 transition-colors"><ArrowDown className="w-3.5 h-3.5" /></button>
              </div>
              <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <Layers className="w-4 h-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-sm">{s.title}</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${s.mode === 'auto' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {s.mode === 'auto' ? 'Tự động' : 'Thủ công'}
                  </span>
                  {!s.is_active && <span className="text-[10px] bg-gray-100 text-gray-500 font-bold px-2 py-0.5 rounded-full">Tắt</span>}
                </div>
                {s.subtitle && <p className="text-gray-500 text-xs mt-0.5 truncate">{s.subtitle}</p>}
                <div className="flex items-center gap-3 mt-1 text-xs text-gray-400 flex-wrap">
                  <span>{s.display_count} tin</span>
                  <span className="flex items-center gap-1">{s.display_style === 'grid' ? <LayoutGrid className="w-3 h-3" /> : <List className="w-3 h-3" />}{s.display_style === 'grid' ? 'Dạng lưới' : 'Dạng ngang'}</span>
                  {s.mode === 'auto' && s.filter_is_hot && <span className="text-orange-500 font-semibold">HOT</span>}
                  {s.mode === 'auto' && s.filter_is_featured && <span className="text-amber-600 font-semibold">Nổi bật</span>}
                  {s.mode === 'auto' && s.filter_listing_type && <span>{s.filter_listing_type === 'mua_ban' ? 'Mua bán' : 'Cho thuê'}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => adminUpdateFeaturedSection(s.id, { is_active: !s.is_active }).then(load)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${s.is_active ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {s.is_active ? 'Bật' : 'Tắt'}
                </button>
                <button onClick={() => openEdit(s)} className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"><Edit2 className="w-4 h-4" /></button>
                <button onClick={() => setConfirmDelete(s.id)} className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"><Trash2 className="w-4 h-4" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Edit / Create Modal */}
      {editingSection && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-10">
          <div className="absolute inset-0 bg-black/50" onClick={() => setEditingSection(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-base">{isNew ? 'Thêm nhóm tin mới' : 'Chỉnh sửa nhóm tin'}</h3>
              <button onClick={() => setEditingSection(null)} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100"><X className="w-4 h-4" /></button>
            </div>

            {error && <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2.5 rounded-lg flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" />{error}</div>}

            {/* Basic info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Tiêu đề *</label>
                <input value={editingSection.title ?? ''} onChange={e => setEditingSection(p => ({ ...p, title: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" placeholder="Tin đăng nổi bật" />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">Mô tả phụ</label>
                <input value={editingSection.subtitle ?? ''} onChange={e => setEditingSection(p => ({ ...p, subtitle: e.target.value || null }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" placeholder="Hiển thị bên dưới tiêu đề" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Số lượng hiển thị</label>
                <input type="number" min={1} max={24} value={editingSection.display_count ?? 8} onChange={e => setEditingSection(p => ({ ...p, display_count: parseInt(e.target.value) || 8 }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Kiểu hiển thị</label>
                <select value={editingSection.display_style ?? 'grid'} onChange={e => setEditingSection(p => ({ ...p, display_style: e.target.value as 'grid' | 'horizontal' }))}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 bg-white">
                  <option value="grid">Dạng lưới</option>
                  <option value="horizontal">Dạng ngang (cuộn)</option>
                </select>
              </div>
            </div>

            {/* Mode */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-2">Chế độ lấy tin</label>
              <div className="flex gap-3">
                {(['auto', 'manual'] as const).map(m => (
                  <button key={m} onClick={() => { setEditingSection(p => ({ ...p, mode: m })); if (m === 'manual') openManualPicker(); }}
                    className={`flex-1 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${editingSection.mode === m ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'}`}>
                    {m === 'auto' ? 'Tự động (theo bộ lọc)' : 'Thủ công (chọn tay)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto filters */}
            {editingSection.mode === 'auto' && (
              <div className="bg-blue-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-blue-700 flex items-center gap-1.5"><Filter className="w-3.5 h-3.5" />Bộ lọc tự động</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Khu vực</label>
                    <select value={editingSection.filter_area_id ?? ''} onChange={e => setEditingSection(p => ({ ...p, filter_area_id: e.target.value || null }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="">Tất cả khu vực</option>
                      {areas.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Loại giao dịch</label>
                    <select value={editingSection.filter_listing_type ?? ''} onChange={e => setEditingSection(p => ({ ...p, filter_listing_type: e.target.value || null }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="">Tất cả</option>
                      <option value="mua_ban">Mua bán</option>
                      <option value="cho_thue">Cho thuê</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Loại BĐS</label>
                    <select value={editingSection.filter_property_type_id ?? ''} onChange={e => setEditingSection(p => ({ ...p, filter_property_type_id: e.target.value || null }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="">Tất cả loại</option>
                      {types.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Sắp xếp theo</label>
                    <select value={editingSection.auto_sort ?? 'newest'} onChange={e => setEditingSection(p => ({ ...p, auto_sort: e.target.value as FeaturedSection['auto_sort'] }))}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
                      <option value="newest">Mới nhất</option>
                      <option value="views">Lượt xem cao nhất</option>
                      <option value="price_asc">Giá thấp đến cao</option>
                      <option value="price_desc">Giá cao đến thấp</option>
                    </select>
                  </div>
                </div>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editingSection.filter_is_featured ?? false} onChange={e => setEditingSection(p => ({ ...p, filter_is_featured: e.target.checked }))}
                      className="w-4 h-4 accent-red-600 rounded" />
                    <span className="text-sm text-gray-700">Chỉ tin nổi bật</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={editingSection.filter_is_hot ?? false} onChange={e => setEditingSection(p => ({ ...p, filter_is_hot: e.target.checked }))}
                      className="w-4 h-4 accent-red-600 rounded" />
                    <span className="text-sm text-gray-700">Chỉ tin HOT</span>
                  </label>
                </div>
              </div>
            )}

            {/* Manual picker */}
            {editingSection.mode === 'manual' && (
              <div className="bg-purple-50 rounded-xl p-4 space-y-3">
                <p className="text-xs font-bold text-purple-700 flex items-center gap-1.5"><GripVertical className="w-3.5 h-3.5" />Chọn thủ công ({manualItems.length} tin đã chọn)</p>

                {/* Selected items */}
                {manualItems.length > 0 && (
                  <div className="space-y-2 max-h-48 overflow-y-auto">
                    {manualItems.map((item, idx) => (
                      <div key={item.property_id} className="flex items-center gap-2 bg-white rounded-lg p-2 border border-purple-100">
                        <div className="flex flex-col gap-0.5">
                          <button onClick={() => moveManualItem(idx, 'up')} disabled={idx === 0} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowUp className="w-3 h-3" /></button>
                          <button onClick={() => moveManualItem(idx, 'down')} disabled={idx === manualItems.length - 1} className="p-0.5 text-gray-400 hover:text-gray-600 disabled:opacity-30"><ArrowDown className="w-3 h-3" /></button>
                        </div>
                        {item.properties?.image_url && (
                          <img src={item.properties.image_url} alt="" className="w-10 h-8 object-cover rounded flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-800 truncate">{item.properties?.title ?? item.property_id}</p>
                          <p className="text-[11px] text-gray-500">{item.properties?.city}</p>
                        </div>
                        <button onClick={() => removeManualItem(item.property_id)} className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded flex-shrink-0"><X className="w-3.5 h-3.5" /></button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Property search */}
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                  <input value={propSearch} onChange={e => setPropSearch(e.target.value)} placeholder="Tìm kiếm tin đăng để thêm..."
                    className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-purple-400" />
                </div>
                {propSearch && (
                  <div className="max-h-40 overflow-y-auto space-y-1.5">
                    {filteredProps.slice(0, 20).map(p => {
                      const already = manualItems.some(i => i.property_id === p.id);
                      return (
                        <button key={p.id} onClick={() => !already && addManualItem(p)} disabled={already}
                          className={`w-full flex items-center gap-2 p-2 rounded-lg text-left text-xs transition-colors ${already ? 'opacity-40 cursor-not-allowed bg-gray-50' : 'bg-white hover:bg-purple-50 border border-gray-100'}`}>
                          {p.image_url && <img src={p.image_url} alt="" className="w-8 h-6 object-cover rounded flex-shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-gray-800 truncate">{p.title}</p>
                            <p className="text-gray-400">{p.city} – {p.price_label ?? `${p.price} ${p.price_unit}`}</p>
                          </div>
                          {!already && <Plus className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 pt-2">
              <label className="flex items-center gap-2 cursor-pointer flex-1">
                <input type="checkbox" checked={editingSection.is_active ?? true} onChange={e => setEditingSection(p => ({ ...p, is_active: e.target.checked }))}
                  className="w-4 h-4 accent-red-600 rounded" />
                <span className="text-sm text-gray-700">Hiển thị trên trang chủ</span>
              </label>
              <button onClick={() => setEditingSection(null)} className="border border-gray-200 text-gray-600 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors">Hủy</button>
              <button onClick={handleSave} disabled={saving} className="bg-red-600 hover:bg-red-700 text-white font-semibold px-5 py-2 rounded-lg text-sm flex items-center gap-2 transition-colors disabled:opacity-60">
                {saving ? <><div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />Đang lưu...</> : <><Save className="w-3.5 h-3.5" />Lưu</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <ConfirmDialog
          message="Bạn có chắc muốn xóa nhóm tin này?"
          onConfirm={() => handleDelete(confirmDelete)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  );
}

// ─── Page Builder Tab ─────────────────────────────────────────────────────────
const SECTION_ICON_MAP: Record<string, React.ReactNode> = {
  Home: <Home className="w-5 h-5" />,
  BarChart3: <BarChart3 className="w-5 h-5" />,
  Grid3X3: <LayoutGrid className="w-5 h-5" />,
  Layers: <Layers className="w-5 h-5" />,
  MapPin: <MapPin className="w-5 h-5" />,
  Shield: <Shield className="w-5 h-5" />,
  Star: <Star className="w-5 h-5" />,
  Newspaper: <Newspaper className="w-5 h-5" />,
  Zap: <Zap className="w-5 h-5" />,
  CheckCircle: <CheckCircle className="w-5 h-5" />,
};

type SectionSettings = Record<string, unknown>;

function SectionEditor({ sectionId, settings, onChange }: {
  sectionId: string;
  settings: SectionSettings;
  onChange: (s: SectionSettings) => void;
}) {
  const get = (key: string, def: string) => (settings[key] as string) ?? def;
  const set = (key: string, val: unknown) => onChange({ ...settings, [key]: val });

  const Field = ({ label, k, def, multiline = false, placeholder = '' }: {
    label: string; k: string; def: string; multiline?: boolean; placeholder?: string;
  }) => (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1">{label}</label>
      {multiline ? (
        <textarea value={get(k, def)} onChange={e => set(k, e.target.value)} placeholder={placeholder || def}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" rows={2} />
      ) : (
        <input type="text" value={get(k, def)} onChange={e => set(k, e.target.value)} placeholder={placeholder || def}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
      )}
    </div>
  );

  switch (sectionId) {
    case 'hero': return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nhãn pill trên cùng" k="hero_label" def="Tập trung khu vực Bình Dương" />
          <Field label="Placeholder tìm kiếm" k="search_placeholder" def="Tìm theo tên dự án, địa chỉ..." />
        </div>
        <Field label="Tiêu đề chính (H1)" k="title" def="Tìm kiếm bất động sản tại Bình Dương" />
        <Field label="Mô tả phụ" k="subtitle" def="Hơn 5.000 tin đăng nhà đất, căn hộ, đất nền uy tín..." multiline />
        <div className="grid grid-cols-3 gap-3">
          <Field label="Tab 'Mua bán'" k="tab_buy" def="Mua bán" />
          <Field label="Tab 'Cho thuê'" k="tab_rent" def="Cho thuê" />
          <Field label="Nút Tìm kiếm" k="btn_search" def="Tìm kiếm" />
        </div>
        <Field label="URL ảnh nền hero (để trống = dùng banner mặc định)" k="bg_image" def="" placeholder="https://..." />
      </div>
    );
    case 'stats': return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">Dải 4 số liệu bên dưới hero. Mỗi ô gồm số và nhãn.</p>
        {[1,2,3,4].map(i => (
          <div key={i} className="grid grid-cols-2 gap-3">
            <Field label={`Số #${i}`} k={`stat${i}_number`} def={['5.000+','10.000+','7 năm','3'][i-1]} />
            <Field label={`Nhãn #${i}`} k={`stat${i}_label`} def={['Tin đăng','Khách hàng tin tưởng','Kinh nghiệm','Tỉnh phủ sóng'][i-1]} />
          </div>
        ))}
      </div>
    );
    case 'categories': return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">6 danh mục BĐS hiển thị dạng icon grid. Nhãn sẽ được dùng để khớp với loại BĐS trong hệ thống.</p>
        {[1,2,3,4,5,6].map(i => (
          <div key={i} className="grid grid-cols-2 gap-3">
            <Field label={`Danh mục #${i}`} k={`cat${i}_label`} def={['Nhà ở','Căn hộ','Đất nền','Đất nông nghiệp','Biệt thự','Văn phòng'][i-1]} />
            <Field label={`Icon #${i} (tên Lucide)`} k={`cat${i}_icon`} def={['Home','Building2','MapPin','TrendingUp','Shield','Briefcase'][i-1]} />
          </div>
        ))}
      </div>
    );
    case 'featured_sections': return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
        <p className="text-sm font-semibold text-amber-800 mb-1">Cấu hình trong tab riêng</p>
        <p className="text-xs text-amber-700">Section này hiển thị các nhóm tin đăng được cấu hình trong tab <strong>"Tin nổi bật"</strong>. Mỗi nhóm có tiêu đề, bộ lọc, kiểu hiển thị riêng.</p>
      </div>
    );
    case 'region_banners': return (
      <div className="space-y-3">
        <Field label="Tiêu đề section" k="title" def="Khám phá theo khu vực" />
        {[
          { n: 1, dt: 'Bình Dương', ds: 'Thị trường chính – sôi động nhất', dd: 'Thủ Dầu Một, Dĩ An, Thuận An, Bến Cát, Tân Uyên...', db: 'Trọng tâm', di: 'https://images.pexels.com/photos/1732414/pexels-photo-1732414.jpeg', dslug: 'binh-duong' },
          { n: 2, dt: 'Bình Phước', ds: 'Tiềm năng – Giá tốt', dd: 'Đồng Xoài, Bình Long, Phước Long...', db: 'Tiềm năng', di: 'https://images.pexels.com/photos/2119714/pexels-photo-2119714.jpeg', dslug: 'binh-phuoc' },
          { n: 3, dt: 'Đồng Nai', ds: 'Khu vực mở rộng', dd: 'Biên Hòa, Long Thành, Nhơn Trạch...', db: 'Mở rộng', di: 'https://images.pexels.com/photos/280229/pexels-photo-280229.jpeg', dslug: 'dong-nai' },
        ].map(r => (
          <div key={r.n} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-bold text-gray-700">Khu vực {r.n}</p>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Tên" k={`region${r.n}_title`} def={r.dt} />
              <Field label="Nhãn badge" k={`region${r.n}_badge`} def={r.db} />
            </div>
            <Field label="Mô tả ngắn" k={`region${r.n}_subtitle`} def={r.ds} />
            <Field label="Mô tả chi tiết" k={`region${r.n}_desc`} def={r.dd} />
            <Field label="URL ảnh" k={`region${r.n}_image`} def={r.di} placeholder="https://..." />
            <Field label="Area slug (khớp với DB)" k={`region${r.n}_slug`} def={r.dslug} />
          </div>
        ))}
      </div>
    );
    case 'why_us': return (
      <div className="space-y-3">
        <Field label="Tiêu đề section" k="title" def="Tại sao chọn chúng tôi?" />
        {[
          { n: 1, dt: 'Uy tín – Chuyên nghiệp', dd: 'Hơn 7 năm kinh nghiệm trong lĩnh vực BĐS tại Bình Dương' },
          { n: 2, dt: 'Thông tin minh bạch', dd: 'Mọi thông tin BĐS đều được xác thực và kiểm duyệt kỹ lưỡng' },
          { n: 3, dt: 'Hỗ trợ 24/7', dd: 'Đội ngũ chuyên gia sẵn sàng tư vấn mọi lúc bạn cần' },
          { n: 4, dt: 'Pháp lý an toàn', dd: 'Hỗ trợ đầy đủ thủ tục pháp lý từ A đến Z' },
        ].map(f => (
          <div key={f.n} className="border border-gray-200 rounded-lg p-3 space-y-2">
            <p className="text-xs font-bold text-gray-700">Lý do {f.n}</p>
            <Field label="Tiêu đề" k={`f${f.n}_title`} def={f.dt} />
            <Field label="Mô tả" k={`f${f.n}_desc`} def={f.dd} multiline />
          </div>
        ))}
      </div>
    );
    case 'testimonials': return (
      <div className="space-y-3">
        <Field label="Tiêu đề section" k="title" def="Khách hàng nói gì về chúng tôi" />
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Số lượng hiển thị (1–6)</label>
          <input type="number" min={1} max={6} value={(settings['max_count'] as number) ?? 3}
            onChange={e => set('max_count', Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
        <p className="text-xs text-gray-400">Nội dung đánh giá được quản lý trong tab <strong>Đánh giá</strong>.</p>
      </div>
    );
    case 'news': return (
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tiêu đề section" k="title" def="Tin tức thị trường" />
          <Field label="Nút Xem tất cả" k="btn_view_all" def="Xem tất cả" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Số bài hiển thị (1–6)</label>
          <input type="number" min={1} max={6} value={(settings['max_count'] as number) ?? 3}
            onChange={e => set('max_count', Number(e.target.value))}
            className="w-24 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
        <p className="text-xs text-gray-400">Nội dung bài viết được quản lý trong tab <strong>Tin tức</strong>.</p>
      </div>
    );
    case 'cta': return (
      <div className="space-y-3">
        <Field label="Tiêu đề chính" k="title" def="Bạn có bất động sản cần bán hoặc cho thuê?" />
        <Field label="Mô tả phụ" k="subtitle" def="Đăng tin miễn phí ngay hôm nay – tiếp cận hàng nghìn khách hàng tiềm năng" multiline />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Nút đăng tin" k="btn_post" def="Đăng tin ngay" />
          <Field label="Nút gọi điện (để trống = ẩn)" k="btn_call_label" def="" placeholder="Gọi ngay..." />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Màu nền (Tailwind class)</label>
          <input type="text" value={get('bg_class', 'from-red-600 to-red-700')} onChange={e => set('bg_class', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
      </div>
    );
    case 'social_proof': return (
      <div className="space-y-3">
        <p className="text-xs text-gray-500">4 biểu tượng tin cậy hiển thị dưới CTA.</p>
        {[1,2,3,4].map(i => (
          <Field key={i} label={`Mục #${i}`} k={`item${i}_text`} def={['Đăng ký miễn phí','Thông tin được xác thực','Hỗ trợ 7:00–21:00','Pháp lý rõ ràng'][i-1]} />
        ))}
      </div>
    );
    default: return <p className="text-xs text-gray-400 italic">Section này chưa có cấu hình riêng.</p>;
  }
}

// ─── Pages Tab ────────────────────────────────────────────────────────────────

const BLOCK_TYPE_LABELS: Record<string, string> = {
  text: 'Văn bản ngắn', textarea: 'Đoạn văn', image: 'URL ảnh',
  number: 'Số', color: 'Màu', list: 'Danh sách (mỗi dòng 1 mục)',
};

const SECTION_LABELS: Record<string, Record<string, string>> = {
  about: { hero: 'Hero', stats: 'Thống kê', mission: 'Sứ mệnh', vision: 'Tầm nhìn', values: 'Giá trị cốt lõi', timeline: 'Hành trình', team: 'Đội ngũ', awards: 'Giải thưởng' },
  invest: { hero: 'Hero', calculator: 'Công cụ tính ROI', opportunities: 'Cơ hội đầu tư', process: 'Quy trình', cta: 'CTA / Form tư vấn' },
  regions: { hero: 'Hero', main: 'Nội dung chính', cta: 'CTA cuối trang' },
  news: { hero: 'Hero', newsletter: 'Đăng ký nhận tin' },
};

function PageBlockEditor({ block, onSave, onDelete }: {
  block: PageBlock;
  onSave: (val: string) => void;
  onDelete: () => void;
}) {
  const [val, setVal] = useState(block.value ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const dirty = val !== (block.value ?? '');

  const doSave = async () => {
    setSaving(true);
    await onSave(val);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setSaving(false);
  };

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <span className="text-xs font-bold text-gray-800">{block.label}</span>
          <span className="ml-2 text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{BLOCK_TYPE_LABELS[block.type] ?? block.type}</span>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {dirty && (
            <button onClick={doSave} disabled={saving}
              className={`flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors ${saved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-600 text-white hover:bg-red-700'}`}>
              {saving ? <div className="w-3 h-3 border border-white/50 border-t-white rounded-full animate-spin" />
                : saved ? <CheckCircle className="w-3 h-3" /> : <Save className="w-3 h-3" />}
              {saved ? 'Đã lưu' : 'Lưu'}
            </button>
          )}
          <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      {block.type === 'textarea' || block.type === 'list' ? (
        <textarea value={val} onChange={e => setVal(e.target.value)} rows={block.type === 'list' ? 5 : 3}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none font-mono text-xs" />
      ) : block.type === 'image' ? (
        <div className="space-y-2">
          <input type="text" value={val} onChange={e => setVal(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" placeholder="https://..." />
          {val && <img src={val} alt="" className="h-20 rounded-lg object-cover" onError={e => (e.currentTarget.style.display = 'none')} />}
        </div>
      ) : block.type === 'color' ? (
        <div className="flex items-center gap-2">
          <input type="color" value={val || '#000000'} onChange={e => setVal(e.target.value)} className="w-10 h-10 rounded cursor-pointer border border-gray-200" />
          <input type="text" value={val} onChange={e => setVal(e.target.value)} className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
        </div>
      ) : (
        <input type={block.type === 'number' ? 'number' : 'text'} value={val} onChange={e => setVal(e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
      )}
      <p className="text-[10px] text-gray-400 mt-1">key: <code className="bg-gray-100 px-1 rounded">{block.section}/{block.key}</code></p>
    </div>
  );
}

function AddBlockForm({ pageSlug, onAdded }: { pageSlug: string; onAdded: () => void }) {
  const [open, setOpen] = useState(false);
  const [section, setSection] = useState('');
  const [key, setKey] = useState('');
  const [label, setLabel] = useState('');
  const [type, setType] = useState('text');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const doAdd = async () => {
    if (!section.trim() || !key.trim() || !label.trim()) return;
    setSaving(true);
    try {
      await adminSavePageBlock({ page_slug: pageSlug, section: section.trim(), key: key.trim(), label: label.trim(), type, value, order_index: 999 });
      onAdded();
      setSection(''); setKey(''); setLabel(''); setType('text'); setValue('');
      setOpen(false);
    } catch (e) { alert((e as Error).message); }
    setSaving(false);
  };

  if (!open) return (
    <button onClick={() => setOpen(true)} className="flex items-center gap-2 border-2 border-dashed border-gray-200 text-gray-500 hover:border-red-400 hover:text-red-600 rounded-xl px-4 py-3 text-sm font-semibold transition-colors w-full">
      <Plus className="w-4 h-4" />Thêm nội dung mới
    </button>
  );

  return (
    <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-4 space-y-3">
      <p className="text-sm font-bold text-blue-800">Thêm khối nội dung mới</p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Section (nhóm)</label>
          <input value={section} onChange={e => setSection(e.target.value)} placeholder="hero, stats, team..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Key (tên field)</label>
          <input value={key} onChange={e => setKey(e.target.value)} placeholder="title, subtitle, image..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Nhãn hiển thị</label>
          <input value={label} onChange={e => setLabel(e.target.value)} placeholder="Tiêu đề trang..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1">Kiểu nội dung</label>
          <select value={type} onChange={e => setType(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 bg-white">
            {Object.entries(BLOCK_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </div>
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1">Giá trị mặc định</label>
        {type === 'textarea' || type === 'list'
          ? <textarea value={value} onChange={e => setValue(e.target.value)} rows={3} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400 resize-none" />
          : <input type="text" value={value} onChange={e => setValue(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
        }
      </div>
      <div className="flex gap-2">
        <button onClick={doAdd} disabled={saving || !section.trim() || !key.trim() || !label.trim()}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-40">
          <Save className="w-3.5 h-3.5" />Thêm
        </button>
        <button onClick={() => setOpen(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Hủy</button>
      </div>
    </div>
  );
}

function PageContentEditor({ page, onBack }: { page: ManagedPage; onBack: () => void }) {
  const [blocks, setBlocks] = useState<PageBlock[]>([]);
  const [loading, setLoading] = useState(true);

  const load = () => adminGetPageBlocks(page.slug).then(b => { setBlocks(b); setLoading(false); });
  useEffect(() => { load(); }, [page.slug]);

  const grouped: Record<string, PageBlock[]> = {};
  for (const b of blocks) {
    if (!grouped[b.section]) grouped[b.section] = [];
    grouped[b.section].push(b);
  }

  const sectionLabels = SECTION_LABELS[page.slug] ?? {};

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
          <ArrowDown className="w-4 h-4 rotate-90" />
        </button>
        <div>
          <h2 className="text-lg font-black text-gray-900">{page.title}</h2>
          <p className="text-gray-500 text-xs">Chỉnh sửa toàn bộ nội dung trang — thay đổi được lưu ngay lập tức</p>
        </div>
        <div className={`ml-auto px-3 py-1 rounded-full text-xs font-bold ${page.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
          {page.is_active ? 'Đang hiển thị' : 'Ẩn'}
        </div>
      </div>

      {Object.entries(grouped).map(([section, sectionBlocks]) => (
        <div key={section} className="bg-gray-50 rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-5 bg-red-600 rounded-full" />
            <h3 className="font-bold text-gray-700 text-sm">{sectionLabels[section] ?? section}</h3>
          </div>
          {sectionBlocks.map(block => (
            <PageBlockEditor
              key={block.id}
              block={block}
              onSave={async (val) => {
                await adminSavePageBlock({ page_slug: page.slug, section: block.section, key: block.key, label: block.label, type: block.type, value: val, order_index: block.order_index });
                setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, value: val } : b));
              }}
              onDelete={async () => {
                if (!confirm(`Xóa trường "${block.label}"?`)) return;
                await adminDeletePageBlock(block.id);
                setBlocks(prev => prev.filter(b => b.id !== block.id));
              }}
            />
          ))}
        </div>
      ))}

      <AddBlockForm pageSlug={page.slug} onAdded={load} />
    </div>
  );
}

function PagesTab() {
  const [pages, setPages] = useState<ManagedPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPage, setSelectedPage] = useState<ManagedPage | null>(null);
  const [creating, setCreating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [newForm, setNewForm] = useState({ slug: '', title: '', description: '', hero_image: '', is_active: true });

  const load = () => adminGetAllManagedPages().then(p => { setPages(p); setLoading(false); });
  useEffect(() => { load(); }, []);

  const handleCreate = async () => {
    if (!newForm.slug.trim() || !newForm.title.trim()) return;
    setSaving(true);
    try {
      await adminCreateManagedPage({ ...newForm, is_system: false, order_index: pages.length });
      await load();
      setCreating(false);
      setNewForm({ slug: '', title: '', description: '', hero_image: '', is_active: true });
    } catch (e) { alert((e as Error).message); }
    setSaving(false);
  };

  const toggleActive = async (page: ManagedPage) => {
    await adminUpdateManagedPage(page.id, { is_active: !page.is_active });
    setPages(prev => prev.map(p => p.id === page.id ? { ...p, is_active: !p.is_active } : p));
  };

  if (selectedPage) return <PageContentEditor page={selectedPage} onBack={() => setSelectedPage(null)} />;

  if (loading) return <div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" /></div>;

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-red-600" />Quản lý trang
          </h2>
          <p className="text-gray-500 text-sm mt-1">Chỉnh sửa toàn bộ nội dung từng trang — tiêu đề, mô tả, ảnh, văn bản và thêm trang mới.</p>
        </div>
        <button onClick={() => setCreating(true)}
          className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors flex-shrink-0">
          <Plus className="w-4 h-4" />Trang mới
        </button>
      </div>

      {creating && (
        <div className="bg-blue-50 border-2 border-blue-200 rounded-2xl p-5 space-y-3">
          <h3 className="font-bold text-blue-800 text-sm">Tạo trang mới</h3>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Slug (URL) *</label>
              <input value={newForm.slug} onChange={e => setNewForm(f => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, '-') }))}
                placeholder="ve-chung-toi, dau-tu..." className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Tiêu đề trang *</label>
              <input value={newForm.title} onChange={e => setNewForm(f => ({ ...f, title: e.target.value }))}
                placeholder="Về chúng tôi" className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Mô tả ngắn</label>
            <input value={newForm.description} onChange={e => setNewForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Mô tả nội dung trang..." className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">URL ảnh hero</label>
            <input value={newForm.hero_image} onChange={e => setNewForm(f => ({ ...f, hero_image: e.target.value }))}
              placeholder="https://images.pexels.com/..." className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={saving || !newForm.slug.trim() || !newForm.title.trim()}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors disabled:opacity-40">
              <Save className="w-3.5 h-3.5" />{saving ? 'Đang tạo...' : 'Tạo trang'}
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Hủy</button>
          </div>
        </div>
      )}

      {/* System pages */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1.5 h-5 bg-amber-500 rounded-full" />
          <h3 className="font-bold text-gray-700 text-sm">Trang hệ thống</h3>
          <span className="text-xs text-gray-400">({pages.filter(p => p.is_system).length} trang)</span>
        </div>
        <div className="space-y-2">
          {pages.filter(p => p.is_system).map(page => (
            <div key={page.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
              {page.hero_image && (
                <img src={page.hero_image} alt="" className="w-14 h-10 object-cover rounded-lg flex-shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-gray-900 text-sm">{page.title}</span>
                  <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">Hệ thống</span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${page.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {page.is_active ? 'Hiển thị' : 'Ẩn'}
                  </span>
                </div>
                {page.description && <p className="text-gray-400 text-xs mt-0.5 truncate">{page.description}</p>}
                <p className="text-gray-400 text-[10px] mt-0.5">/{page.slug}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => toggleActive(page)} title={page.is_active ? 'Ẩn trang' : 'Hiện trang'}
                  className={`relative w-10 h-5 rounded-full transition-all cursor-pointer ${page.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${page.is_active ? 'left-5' : 'left-0.5'}`} />
                </button>
                <button onClick={() => setSelectedPage(page)}
                  className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors">
                  <Edit2 className="w-3 h-3" />Chỉnh sửa nội dung
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Custom pages */}
      {pages.filter(p => !p.is_system).length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="w-1.5 h-5 bg-blue-500 rounded-full" />
            <h3 className="font-bold text-gray-700 text-sm">Trang tùy chỉnh</h3>
            <span className="text-xs text-gray-400">({pages.filter(p => !p.is_system).length} trang)</span>
          </div>
          <div className="space-y-2">
            {pages.filter(p => !p.is_system).map(page => (
              <div key={page.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center gap-4 shadow-sm">
                {page.hero_image && (
                  <img src={page.hero_image} alt="" className="w-14 h-10 object-cover rounded-lg flex-shrink-0" onError={e => (e.currentTarget.style.display = 'none')} />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{page.title}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${page.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                      {page.is_active ? 'Hiển thị' : 'Ẩn'}
                    </span>
                  </div>
                  {page.description && <p className="text-gray-400 text-xs mt-0.5 truncate">{page.description}</p>}
                  <p className="text-gray-400 text-[10px] mt-0.5">/{page.slug}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => toggleActive(page)}
                    className={`relative w-10 h-5 rounded-full transition-all cursor-pointer ${page.is_active ? 'bg-emerald-500' : 'bg-gray-300'}`}>
                    <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200 ${page.is_active ? 'left-5' : 'left-0.5'}`} />
                  </button>
                  <button onClick={() => setSelectedPage(page)}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-red-600 text-white hover:bg-red-700 rounded-lg transition-colors">
                    <Edit2 className="w-3 h-3" />Chỉnh sửa
                  </button>
                  <button onClick={async () => {
                    if (!confirm(`Xóa trang "${page.title}"?`)) return;
                    await adminDeleteManagedPage(page.id);
                    setPages(prev => prev.filter(p => p.id !== page.id));
                  }} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PageBuilderTab() {
  const [sections, setSections] = useState<PageSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedState, setSavedState] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    getPageLayout().then(data => { setSections(data); setLoading(false); });
  }, []);

  const move = (index: number, dir: -1 | 1) => {
    const next = [...sections];
    const swap = index + dir;
    if (swap < 0 || swap >= next.length) return;
    [next[index], next[swap]] = [next[swap], next[index]];
    setSections(next.map((s, i) => ({ ...s, order_index: i })));
    setDirty(true);
  };

  const toggleVisibility = (id: string) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, is_visible: !s.is_visible } : s));
    setDirty(true);
  };

  const updateSettings = (id: string, settings: SectionSettings) => {
    setSections(prev => prev.map(s => s.id === id ? { ...s, settings } : s));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminSavePageLayout(sections.map((s, i) => ({ id: s.id, is_visible: s.is_visible, order_index: i, settings: s.settings })));
      setDirty(false);
      setSavedState(true);
      setTimeout(() => setSavedState(false), 2500);
    } catch (e) {
      alert('Lưu thất bại: ' + (e as Error).message);
    }
    setSaving(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-4 border-red-600/30 border-t-red-600 rounded-full animate-spin" />
    </div>
  );

  const visibleSections = sections.filter(s => s.is_visible);
  const hiddenSections = sections.filter(s => !s.is_visible);

  return (
    <div className="max-w-3xl space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <PanelLeft className="w-5 h-5 text-red-600" />Bố cục trang chủ
          </h2>
          <p className="text-gray-500 text-sm mt-1">
            Sắp xếp thứ tự, ẩn/hiện và chỉnh sửa toàn bộ nội dung từng section trực tiếp tại đây.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !dirty}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all flex-shrink-0
            ${dirty ? 'bg-red-600 hover:bg-red-700 text-white shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
        >
          {saving ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Đang lưu...</>
            : savedState ? <><CheckCircle className="w-4 h-4" />Đã lưu!</>
            : <><Save className="w-4 h-4" />Lưu thay đổi</>}
        </button>
      </div>

      {/* Live preview bar */}
      <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Thứ tự hiển thị hiện tại</p>
        <div className="flex flex-wrap gap-2">
          {visibleSections.map((s, i) => (
            <div key={s.id} className="flex items-center gap-1.5 bg-white border border-gray-200 rounded-full px-3 py-1 text-xs font-medium text-gray-700 shadow-sm">
              <span className="w-4 h-4 bg-red-600 text-white rounded-full flex items-center justify-center text-[9px] font-black flex-shrink-0">{i + 1}</span>
              {s.label}
            </div>
          ))}
          {visibleSections.length === 0 && <span className="text-gray-400 text-xs italic">Không có section nào được bật</span>}
        </div>
      </div>

      {/* Section list with inline editors */}
      <div className="space-y-2">
        {sections.map((section, index) => {
          const icon = SECTION_ICON_MAP[section.icon ?? ''] ?? <LayoutGrid className="w-5 h-5" />;
          const isFirst = index === 0;
          const isLast = index === sections.length - 1;
          const isExpanded = expandedId === section.id;

          return (
            <div key={section.id}
              className={`bg-white border rounded-xl transition-all duration-200
                ${section.is_visible ? 'border-gray-200 shadow-sm' : 'border-dashed border-gray-200 opacity-55'}`}
            >
              {/* Section header row */}
              <div className="flex items-center gap-3 p-4">
                <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0" />

                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0
                  ${section.is_visible ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-400'}`}>
                  {icon}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-900 text-sm">{section.label}</span>
                    {section.id === 'hero' && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 font-bold px-2 py-0.5 rounded-full">Cố định</span>
                    )}
                    {dirty && sections.find(s => s.id === section.id)?.settings !== undefined && (
                      <span className="text-[10px] bg-orange-100 text-orange-600 font-bold px-1.5 py-0.5 rounded-full">Chưa lưu</span>
                    )}
                  </div>
                  {section.description && !isExpanded && (
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{section.description}</p>
                  )}
                </div>

                {/* Position badge */}
                {section.is_visible && (
                  <span className="text-xs text-gray-400 font-medium w-6 text-center flex-shrink-0">
                    #{visibleSections.findIndex(s => s.id === section.id) + 1}
                  </span>
                )}

                {/* Configure button */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : section.id)}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors flex-shrink-0
                    ${isExpanded ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-red-50 hover:text-red-600'}`}
                >
                  <Edit2 className="w-3 h-3" />
                  {isExpanded ? 'Đóng' : 'Chỉnh sửa'}
                </button>

                {/* Reorder */}
                <div className="flex flex-col gap-0.5 flex-shrink-0">
                  <button onClick={() => move(index, -1)} disabled={isFirst}
                    className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => move(index, 1)} disabled={isLast}
                    className="w-6 h-6 flex items-center justify-center rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Toggle */}
                <button
                  onClick={() => toggleVisibility(section.id)}
                  disabled={section.id === 'hero'}
                  title={section.is_visible ? 'Ẩn section này' : 'Hiện section này'}
                  className={`relative w-10 h-5 rounded-full transition-all flex-shrink-0
                    ${section.id === 'hero' ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}
                    ${section.is_visible ? 'bg-red-500' : 'bg-gray-300'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-all duration-200
                    ${section.is_visible ? 'left-5' : 'left-0.5'}`} />
                </button>
              </div>

              {/* Inline content editor */}
              {isExpanded && (
                <div className="border-t border-gray-100 p-4 bg-gray-50/50">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Nội dung & cấu hình</p>
                  <SectionEditor
                    sectionId={section.id}
                    settings={section.settings as SectionSettings}
                    onChange={s => updateSettings(section.id, s)}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Hidden sections */}
      {hiddenSections.length > 0 && (
        <div className="bg-gray-50 border border-dashed border-gray-200 rounded-xl p-4">
          <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Đang ẩn ({hiddenSections.length})</p>
          <div className="flex flex-wrap gap-2">
            {hiddenSections.map(s => (
              <button key={s.id} onClick={() => toggleVisibility(s.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs text-gray-600 hover:border-red-400 hover:text-red-600 transition-colors">
                <Plus className="w-3 h-3" />{s.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Save reminder */}
      {dirty && (
        <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-orange-700 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            <span>Có thay đổi chưa được lưu — nhấn <strong>Lưu thay đổi</strong> để áp dụng.</span>
          </div>
          <button onClick={handleSave} disabled={saving}
            className="flex items-center gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Save className="w-3.5 h-3.5" />Lưu ngay
          </button>
        </div>
      )}
    </div>
  );
}
