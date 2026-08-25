import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, Eye, RefreshCw, Users, UserPlus, Activity } from 'lucide-react';
import { getGoogleAnalyticsReport, type GoogleAnalyticsReport } from '../../../lib/api';

const RANGES = [7, 30, 90] as const;
type Range = (typeof RANGES)[number];

function number(value: number): string {
  return value.toLocaleString('vi-VN');
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function MetricCard({ label, value, icon, tone }: { label: string; value: string; icon: React.ReactNode; tone: string }) {
  return <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
    <div className={`mb-3 flex h-9 w-9 items-center justify-center rounded-lg ${tone}`}>{icon}</div>
    <p className="text-2xl font-black text-gray-900">{value}</p>
    <p className="mt-1 text-xs font-medium text-gray-500">{label}</p>
  </div>;
}

function ReportContent({ report }: { report: GoogleAnalyticsReport }) {
  const maxViews = useMemo(() => Math.max(...report.daily.map(point => point.pageViews), 1), [report.daily]);
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <MetricCard label="Người dùng hoạt động" value={number(report.overview.activeUsers)} icon={<Users className="h-4 w-4 text-blue-600" />} tone="bg-blue-50" />
      <MetricCard label="Người dùng mới" value={number(report.overview.newUsers)} icon={<UserPlus className="h-4 w-4 text-emerald-600" />} tone="bg-emerald-50" />
      <MetricCard label="Phiên truy cập" value={number(report.overview.sessions)} icon={<Activity className="h-4 w-4 text-violet-600" />} tone="bg-violet-50" />
      <MetricCard label="Lượt xem trang" value={number(report.overview.pageViews)} icon={<Eye className="h-4 w-4 text-amber-600" />} tone="bg-amber-50" />
      <MetricCard label="Tỷ lệ tương tác" value={percent(report.overview.engagementRate)} icon={<BarChart3 className="h-4 w-4 text-red-600" />} tone="bg-red-50" />
    </div>

    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><h3 className="font-bold text-gray-900">Lượt xem theo ngày</h3><p className="mt-0.5 text-xs text-gray-500">{report.startDate} → {report.endDate}</p></div>
        <span className="text-xs text-gray-400">Nguồn: GA4</span>
      </div>
      {report.daily.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">GA4 chưa trả về dữ liệu theo ngày.</p> : <div className="space-y-2">
        {report.daily.map(point => <div key={point.date} className="grid grid-cols-[44px_1fr_64px] items-center gap-2 text-xs">
          <span className="text-gray-500">{point.date}</span>
          <div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(2, (point.pageViews / maxViews) * 100)}%` }} /></div>
          <span className="text-right font-semibold text-gray-700">{number(point.pageViews)}</span>
        </div>)}
      </div>}
    </div>

    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="mb-4 font-bold text-gray-900">Trang được xem nhiều nhất</h3>
      {report.topPages.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">GA4 chưa trả về dữ liệu trang.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-gray-100 text-xs text-gray-500"><th className="pb-3 font-semibold">Đường dẫn</th><th className="pb-3 text-right font-semibold">Lượt xem</th><th className="pb-3 text-right font-semibold">Người dùng</th></tr></thead><tbody>{report.topPages.map(page => <tr key={page.path} className="border-b border-gray-50 last:border-0"><td className="py-3 font-medium text-gray-700">{page.path}</td><td className="py-3 text-right text-gray-600">{number(page.pageViews)}</td><td className="py-3 text-right text-gray-600">{number(page.activeUsers)}</td></tr>)}</tbody></table></div>}
    </div>
  </div>;
}

export function GoogleAnalyticsTab() {
  const [days, setDays] = useState<Range>(30);
  const [report, setReport] = useState<GoogleAnalyticsReport | null>(null);
  const [configurationState, setConfigurationState] = useState<'not_configured' | 'configured' | 'invalid' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async (range = days) => {
    setLoading(true); setError('');
    try { const result = await getGoogleAnalyticsReport(range); setConfigurationState(result.configurationState); setReport(result.report); }
    catch (err) { setError(err instanceof Error ? err.message : 'Không tải được báo cáo Google Analytics.'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="flex items-center gap-2 text-lg font-bold text-gray-900"><BarChart3 className="h-5 w-5 text-red-500" />Thống kê website</h2><p className="mt-0.5 text-sm text-gray-500">Báo cáo GA4 server-side; hoạt động admin không được tính vào traffic khách hàng.</p></div>
      <div className="flex items-center gap-2"><div className="flex rounded-lg border border-gray-200 bg-white p-1">{RANGES.map(range => <button key={range} onClick={() => { setDays(range); void load(range); }} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${days === range ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{range} ngày</button>)}</div><button onClick={() => void load()} disabled={loading} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-50" title="Tải lại"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button></div>
    </div>

    {error && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"><AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" /><div><p className="text-sm font-semibold text-red-800">Không tải được báo cáo</p><p className="mt-0.5 text-xs text-red-700">{error}</p></div></div>}
    {!error && configurationState !== 'configured' && !loading && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><p className="font-bold text-amber-900">GA4 chưa sẵn sàng</p><p className="mt-1 text-sm leading-6 text-amber-800">Cần cấu hình GOOGLE_ANALYTICS_CLIENT_EMAIL, GOOGLE_ANALYTICS_PRIVATE_KEY và GOOGLE_ANALYTICS_PROPERTY_ID trên server, sau đó cấp quyền Viewer cho service account trong GA4.</p></div>}
    {loading && <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">Đang tải báo cáo GA4...</div>}
    {!loading && !error && report && <ReportContent report={report} />}
  </div>;
}
