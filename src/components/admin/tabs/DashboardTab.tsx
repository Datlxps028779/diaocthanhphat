import { Building2, Users, Star, Newspaper, TrendingUp, Eye, Plus, CheckCircle, ChevronDown, BarChart3, ArrowUp, ArrowDown, Home, Tag } from 'lucide-react';
import { type DashboardStats } from '../../../lib/api';
import type { AdminTab } from '../types';

// ─── Dashboard ────────────────────────────────────────────────────────────────
export function DashboardTab({ stats, setTab }: { stats: DashboardStats; setTab: (t: AdminTab) => void }) {
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
