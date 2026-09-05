import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, BarChart3, Eye, RefreshCw, Users, UserPlus, Activity } from 'lucide-react';
import { diagnoseGoogleAnalytics, getGoogleAnalyticsReport, getLeads, getTeamMembers, type GoogleAnalyticsReport } from '../../../lib/api';
import type { GoogleAnalyticsDiagnostic, GoogleAnalyticsDimension, GoogleAnalyticsDimensionBreakdown } from '../../../lib/api/googleAnalytics';
import { EVENTS, MEASURED_FUNNEL_EVENTS, type AnalyticsEventName } from '../../../lib/analytics';
import { crmMeasurement, measurementBreakdown, measurementFunnel, type CrmMeasurementSummary, type MeasurementEventRow } from '../../../lib/measurement';

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

function MeasuredFunnel({ report }: { report: GoogleAnalyticsReport }) {
  const rows = report.topEvents
    .filter(event => isMeasuredFunnelEvent(event.name))
    .map(event => ({
      eventName: event.name as MeasuredFunnelEvent,
      eventCount: event.eventCount,
      activeUsers: event.activeUsers,
    }));
  const summary = measurementFunnel(rows);
  const stageRows = [
    ['Lượt xem tin', summary.view],
    ['CTA liên hệ', summary.cta],
    ['Lead gửi thành công', summary.lead],
  ] as const;
  const value = (count: number | null) => count === null ? 'Chưa đủ dữ liệu' : number(count);
  const rate = (valueToFormat: number | null) => valueToFormat === null ? '—' : percent(valueToFormat);

  return <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-5 shadow-sm">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div><h3 className="font-bold text-emerald-950">Đo lường view → CTA → lead</h3><p className="mt-0.5 text-xs text-emerald-800">{report.startDate} → {report.endDate} · chỉ dùng event GA4 đã ghi nhận; không suy diễn stage còn thiếu.</p></div>
      <span className="text-xs text-emerald-700">Analytics evidence</span>
    </div>
    {!summary.hasData ? <p className="rounded-lg border border-emerald-200 bg-white/70 p-4 text-sm text-emerald-900">GA4 chưa có event funnel trong khoảng thời gian này.</p> : <>
      <div className="grid gap-3 sm:grid-cols-3">{stageRows.map(([label, count]) => <div key={label} className="rounded-lg bg-white/80 p-3"><p className="text-xs font-semibold text-emerald-800">{label}</p><p className="mt-2 text-xl font-black text-emerald-950">{value(count)}</p></div>)}</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-emerald-200 bg-white/60 p-3"><p className="text-xs text-emerald-800">View → CTA</p><p className="mt-1 font-bold text-emerald-950">{rate(summary.viewToCtaRate)}</p></div><div className="rounded-lg border border-emerald-200 bg-white/60 p-3"><p className="text-xs text-emerald-800">CTA → Lead</p><p className="mt-1 font-bold text-emerald-950">{rate(summary.ctaToLeadRate)}</p></div></div>
      <p className="mt-3 text-[11px] text-emerald-800">Phân rã event theo property, source hoặc channel: chưa có trong response GA4 hiện tại.</p>
    </>}
  </div>;
}

const DIMENSION_LABELS: Array<{ key: GoogleAnalyticsDimension; label: string }> = [
  { key: 'listingId', label: 'Property / listing' },
  { key: 'source', label: 'Source' },
  { key: 'channel', label: 'Channel' },
];

function isAnalyticsEventName(name: string): name is AnalyticsEventName {
  return (Object.values(EVENTS) as string[]).includes(name);
}

function dimensionMeasurementRows(
  dimension: GoogleAnalyticsDimension,
  breakdown: GoogleAnalyticsDimensionBreakdown,
): ReturnType<typeof measurementBreakdown> {
  const rows: MeasurementEventRow[] = breakdown.rows
    .filter(row => isAnalyticsEventName(row.eventName))
    .map(row => ({
      eventName: row.eventName as AnalyticsEventName,
      eventCount: row.eventCount,
      activeUsers: row.activeUsers,
      dimensions: { [dimension]: row.value },
    }));
  return measurementBreakdown(rows, dimension);
}

function DimensionBreakdown({ report }: { report: GoogleAnalyticsReport }) {
  return <div className="rounded-xl border border-sky-100 bg-sky-50 p-5 shadow-sm">
    <div className="mb-4 flex items-start justify-between gap-3">
      <div><h3 className="font-bold text-sky-950">Phân rã theo dữ liệu GA4 thật</h3><p className="mt-0.5 text-xs text-sky-800">Chỉ hiển thị property, source và channel khi custom dimension đã được GA4 trả về; không suy diễn từ URL hoặc sample.</p></div>
      <span className="text-xs text-sky-700">Dimension evidence</span>
    </div>
    <div className="grid gap-4 lg:grid-cols-3">
      {DIMENSION_LABELS.map(({ key, label }) => {
        const breakdown = report.dimensionBreakdowns[key];
        const rows = dimensionMeasurementRows(key, breakdown);
        return <section key={key} className="rounded-lg bg-white/80 p-3">
          <h4 className="text-sm font-bold text-sky-950">{label}</h4>
          {breakdown.status === 'unavailable' ? <p className="mt-3 text-xs leading-5 text-sky-800">Chưa đọc được custom dimension này. Kiểm tra đăng ký dimension và quyền GA4.</p> : breakdown.status === 'empty' || rows.length === 0 ? <p className="mt-3 text-xs leading-5 text-sky-800">Chưa đủ dữ liệu có giá trị trong khoảng {report.startDate} → {report.endDate}.</p> : <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[360px] text-left text-xs"><thead><tr className="border-b border-sky-100 text-sky-700"><th className="pb-2 font-semibold">Giá trị</th><th className="pb-2 text-right font-semibold">View</th><th className="pb-2 text-right font-semibold">CTA</th><th className="pb-2 text-right font-semibold">Lead</th></tr></thead><tbody>{rows.map(row => <tr key={row.value} className="border-b border-sky-50 last:border-0"><td className="max-w-[180px] truncate py-2 font-medium text-sky-950" title={row.value}>{row.value}</td><td className="py-2 text-right text-sky-800">{row.view === null ? '—' : number(row.view)}</td><td className="py-2 text-right text-sky-800">{row.cta === null ? '—' : number(row.cta)}</td><td className="py-2 text-right text-sky-800">{row.lead === null ? '—' : number(row.lead)}</td></tr>)}</tbody></table></div>}
        </section>;
      })}
    </div>
  </div>;
}

function CrmEvidence({ summary, error, roster }: { summary: CrmMeasurementSummary | null; error: string; roster: Awaited<ReturnType<typeof getTeamMembers>> }) {
  const workload = summary ? Object.entries(summary.assigneeWorkload)
    .map(([id, count]) => ({
      id,
      count,
      label: roster.find(member => member.id === id)?.display_name?.trim() || 'Nhân viên trong dữ liệu',
    }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)) : [];

  return <div className="rounded-xl border border-violet-100 bg-violet-50 p-5 shadow-sm">
    <div className="mb-4 flex items-start justify-between gap-3"><div><h3 className="font-bold text-violet-950">Bằng chứng CRM read-only</h3><p className="mt-0.5 text-xs text-violet-800">Lead, assignment, activity, follow-up và SLA từ dữ liệu CRM đã phân quyền.</p></div><span className="text-xs text-violet-700">CRM evidence</span></div>
    {error ? <p className="rounded-lg border border-violet-200 bg-white/70 p-4 text-sm text-violet-900">Chưa đọc được dữ liệu CRM: {error}</p> : !summary ? <p className="rounded-lg border border-violet-200 bg-white/70 p-4 text-sm text-violet-900">Đang tải dữ liệu CRM...</p> : <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">{[
        ['Tổng lead', number(summary.totalLeads)],
        ['Đã gán', number(summary.assignedLeads)],
        ['Chưa gán', number(summary.unassignedLeads)],
        ['Có hoạt động gần nhất', number(summary.leadsWithActivity)],
        ['Có follow-up', summary.hasFollowUpData ? number(summary.leadsWithFollowUp) : 'Chưa đủ dữ liệu'],
        ['Follow-up quá hạn', summary.hasFollowUpData ? number(summary.overdueFollowUps ?? 0) : 'Chưa đủ dữ liệu'],
      ].map(([label, value]) => <div key={label} className="rounded-lg bg-white/80 p-3"><p className="text-xs font-semibold text-violet-800">{label}</p><p className="mt-2 text-lg font-black text-violet-950">{value}</p></div>)}</div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg bg-white/80 p-4">
          <h4 className="text-sm font-bold text-violet-950">SLA tham chiếu</h4>
          <p className="mt-1 text-[11px] leading-5 text-violet-700">Tính theo logic hiện có và timestamp thật; chưa phải SLA kinh doanh đã phê duyệt.</p>
          {!summary.sla ? <p className="mt-3 text-xs text-violet-800">Chưa đủ dữ liệu để đánh giá SLA.</p> : <div className="mt-3 grid grid-cols-2 gap-2"><div className="rounded-md bg-red-50 p-2"><p className="text-[11px] text-red-700">Quá hạn</p><p className="mt-1 font-bold text-red-900">{number(summary.sla.overdue)}</p></div><div className="rounded-md bg-amber-50 p-2"><p className="text-[11px] text-amber-700">Cần gọi hôm nay</p><p className="mt-1 font-bold text-amber-900">{number(summary.sla.dueSoon)}</p></div></div>}
        </div>
        <div className="rounded-lg bg-white/80 p-4">
          <h4 className="text-sm font-bold text-violet-950">Workload theo phụ trách</h4>
          <p className="mt-1 text-[11px] leading-5 text-violet-700">Mỗi lead được đếm theo assignment thật; không tự chọn phụ trách chính.</p>
          {!summary.hasAssignmentData || workload.length === 0 ? <p className="mt-3 text-xs text-violet-800">Chưa đủ dữ liệu assignment để phân rã workload.</p> : <div className="mt-3 space-y-2">{workload.map(row => <div key={row.id} className="flex items-center justify-between gap-3 text-xs"><span className="truncate text-violet-900">{row.label}</span><strong className="text-violet-950">{number(row.count)}</strong></div>)}</div>}
        </div>
      </div>
    </>}
  </div>;
}

type MeasuredFunnelEvent = typeof MEASURED_FUNNEL_EVENTS[number];

function isMeasuredFunnelEvent(name: string): name is MeasuredFunnelEvent {
  return (MEASURED_FUNNEL_EVENTS as readonly string[]).includes(name);
}

function ReportContent({ report }: { report: GoogleAnalyticsReport }) {
  const maxViews = useMemo(() => Math.max(...report.daily.map(point => point.pageViews), 1), [report.daily]);
  const maxFunnel = Math.max(...report.funnel.map(step => step.eventCount), 1);
  return <div className="space-y-5">
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <MetricCard label="Người dùng hoạt động" value={number(report.overview.activeUsers)} icon={<Users className="h-4 w-4 text-blue-600" />} tone="bg-blue-50" />
      <MetricCard label="Người dùng mới" value={number(report.overview.newUsers)} icon={<UserPlus className="h-4 w-4 text-emerald-600" />} tone="bg-emerald-50" />
      <MetricCard label="Phiên truy cập" value={number(report.overview.sessions)} icon={<Activity className="h-4 w-4 text-violet-600" />} tone="bg-violet-50" />
      <MetricCard label="Lượt xem trang" value={number(report.overview.pageViews)} icon={<Eye className="h-4 w-4 text-amber-600" />} tone="bg-amber-50" />
      <MetricCard label="Tỷ lệ tương tác" value={percent(report.overview.engagementRate)} icon={<BarChart3 className="h-4 w-4 text-red-600" />} tone="bg-red-50" />
    </div>

    <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm text-blue-900">
      <strong>Phạm vi dữ liệu:</strong> bảng trang và phễu lọc các đường dẫn quản trị `/quantrihethong/*`, `/quantrithethong/*`, `/noi-bo/*`. Các chỉ số tổng hợp/nguồn/thiết bị có thể còn gồm dữ liệu lịch sử trước khi chặn GA4 ở workspace nội bộ.
    </div>

    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3"><div><h3 className="font-bold text-gray-900">Phễu event GA4 tham khảo</h3><p className="mt-0.5 text-xs text-gray-500">Tìm kiếm → xem tin → mở liên hệ → gửi lead · không thay thế CRM funnel</p></div><span className="text-xs text-gray-400">GA4 events</span></div>
      <div className="grid gap-3 sm:grid-cols-4">{report.funnel.map(step => <div key={step.name} className="rounded-lg bg-gray-50 p-3"><p className="text-xs font-semibold text-gray-500">{step.label}</p><p className="mt-2 text-xl font-black text-gray-900">{number(step.eventCount)}</p><p className="mt-1 text-[11px] text-gray-500">{number(step.activeUsers)} người dùng · {percent(step.eventCount / maxFunnel)} so với bước cao nhất</p><div className="mt-2 h-1.5 rounded-full bg-gray-200"><div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(2, (step.eventCount / maxFunnel) * 100)}%` }} /></div></div>)}</div>
    </div>

    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="mb-4 font-bold text-gray-900">Nguồn truy cập</h3><div className="overflow-x-auto"><table className="w-full min-w-[460px] text-left text-sm"><thead><tr className="border-b border-gray-100 text-xs text-gray-500"><th className="pb-3 font-semibold">Nguồn / phương tiện</th><th className="pb-3 text-right font-semibold">Phiên</th><th className="pb-3 text-right font-semibold">Người dùng</th></tr></thead><tbody>{report.acquisition.map(row => <tr key={row.sourceMedium} className="border-b border-gray-50 last:border-0"><td className="py-3 font-medium text-gray-700">{row.sourceMedium}</td><td className="py-3 text-right text-gray-600">{number(row.sessions)}</td><td className="py-3 text-right text-gray-600">{number(row.activeUsers)}</td></tr>)}</tbody></table></div></div>
      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="mb-4 font-bold text-gray-900">Thiết bị</h3><div className="overflow-x-auto"><table className="w-full min-w-[420px] text-left text-sm"><thead><tr className="border-b border-gray-100 text-xs text-gray-500"><th className="pb-3 font-semibold">Thiết bị</th><th className="pb-3 text-right font-semibold">Phiên</th><th className="pb-3 text-right font-semibold">Lượt xem</th></tr></thead><tbody>{report.devices.map(row => <tr key={row.category} className="border-b border-gray-50 last:border-0"><td className="py-3 font-medium capitalize text-gray-700">{row.category}</td><td className="py-3 text-right text-gray-600">{number(row.sessions)}</td><td className="py-3 text-right text-gray-600">{number(row.pageViews)}</td></tr>)}</tbody></table></div></div>
    </div>

    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="mb-4 font-bold text-gray-900">Lượt xem theo ngày</h3><p className="mb-4 text-xs text-gray-500">{report.startDate} → {report.endDate} · dữ liệu tổng hợp GA4</p>{report.daily.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">GA4 chưa trả về dữ liệu theo ngày.</p> : <div className="space-y-2">{report.daily.map(point => <div key={point.date} className="grid grid-cols-[44px_1fr_64px] items-center gap-2 text-xs"><span className="text-gray-500">{point.date}</span><div className="h-2 overflow-hidden rounded-full bg-gray-100"><div className="h-full rounded-full bg-red-500" style={{ width: `${Math.max(2, (point.pageViews / maxViews) * 100)}%` }} /></div><span className="text-right font-semibold text-gray-700">{number(point.pageViews)}</span></div>)}</div>}</div>

    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="mb-4 font-bold text-gray-900">Hành động nổi bật</h3>{report.topEvents.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">Chưa có event hành vi trong khoảng thời gian này.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-gray-100 text-xs text-gray-500"><th className="pb-3 font-semibold">Event</th><th className="pb-3 text-right font-semibold">Số lần</th><th className="pb-3 text-right font-semibold">Người dùng</th></tr></thead><tbody>{report.topEvents.map(event => <tr key={event.name} className="border-b border-gray-50 last:border-0"><td className="py-3 font-medium text-gray-700">{event.name}</td><td className="py-3 text-right text-gray-600">{number(event.eventCount)}</td><td className="py-3 text-right text-gray-600">{number(event.activeUsers)}</td></tr>)}</tbody></table></div>}</div>

    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm"><h3 className="mb-4 font-bold text-gray-900">Trang được xem nhiều nhất</h3>{report.topPages.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">GA4 chưa trả về dữ liệu trang.</p> : <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm"><thead><tr className="border-b border-gray-100 text-xs text-gray-500"><th className="pb-3 font-semibold">Đường dẫn</th><th className="pb-3 text-right font-semibold">Lượt xem</th><th className="pb-3 text-right font-semibold">Người dùng</th></tr></thead><tbody>{report.topPages.map(page => <tr key={page.path} className="border-b border-gray-50 last:border-0"><td className="py-3 font-medium text-gray-700">{page.path}</td><td className="py-3 text-right text-gray-600">{number(page.pageViews)}</td><td className="py-3 text-right text-gray-600">{number(page.activeUsers)}</td></tr>)}</tbody></table></div>}</div>
  </div>;
}

export function GoogleAnalyticsTab() {
  const [days, setDays] = useState<Range>(30);
  const [report, setReport] = useState<GoogleAnalyticsReport | null>(null);
  const [crmLeads, setCrmLeads] = useState<Awaited<ReturnType<typeof getLeads>> | null>(null);
  const [crmRoster, setCrmRoster] = useState<Awaited<ReturnType<typeof getTeamMembers>>>([]);
  const [configurationState, setConfigurationState] = useState<'not_configured' | 'configured' | 'invalid' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [crmError, setCrmError] = useState('');
  const [diagnostic, setDiagnostic] = useState<GoogleAnalyticsDiagnostic | null>(null);
  const [diagnosing, setDiagnosing] = useState(false);

  const load = async (range = days) => {
    setLoading(true); setError(''); setCrmError('');
    setDiagnostic(null);
    const [analyticsResult, crmResult, rosterResult] = await Promise.allSettled([
      getGoogleAnalyticsReport(range),
      getLeads(),
      getTeamMembers(),
    ]);
    if (analyticsResult.status === 'fulfilled') {
      setConfigurationState(analyticsResult.value.configurationState);
      setReport(analyticsResult.value.report);
    } else {
      setError(analyticsResult.reason instanceof Error ? analyticsResult.reason.message : 'Không tải được báo cáo Google Analytics.');
    }
    if (crmResult.status === 'fulfilled') {
      setCrmLeads(crmResult.value);
    } else {
      setCrmLeads(null);
      setCrmError(crmResult.reason instanceof Error ? crmResult.reason.message : 'Không tải được dữ liệu CRM.');
    }
    if (rosterResult.status === 'fulfilled') {
      setCrmRoster(rosterResult.value);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const crmSummary = useMemo(() => crmLeads ? crmMeasurement(
    crmLeads.map(lead => ({
      assigneeCount: lead.lead_assignments?.length ?? 0,
      assignmentIds: lead.lead_assignments?.map(assignment => assignment.user_id),
      activityCount: lead.last_activity_at ? 1 : 0,
      followUpAt: lead.follow_up_at,
      status: lead.status,
      createdAt: lead.created_at,
      lastActivityAt: lead.last_activity_at,
    })),
    new Date(),
  ) : null, [crmLeads]);

  return <div className="space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><h2 className="flex items-center gap-2 text-lg font-bold text-gray-900"><BarChart3 className="h-5 w-5 text-red-500" />Thống kê website</h2><p className="mt-0.5 text-sm text-gray-500">Báo cáo GA4 server-side; hoạt động admin không được tính vào traffic khách hàng.</p></div>
      <div className="flex items-center gap-2"><div className="flex rounded-lg border border-gray-200 bg-white p-1">{RANGES.map(range => <button key={range} onClick={() => { setDays(range); void load(range); }} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${days === range ? 'bg-red-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{range} ngày</button>)}</div><button onClick={() => void load()} disabled={loading} className="rounded-lg border border-gray-200 p-2 text-gray-500 hover:bg-gray-50 disabled:opacity-50" title="Tải lại"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button><button onClick={async () => { setDiagnosing(true); setDiagnostic(null); try { setDiagnostic(await diagnoseGoogleAnalytics()); } catch (err) { setError(err instanceof Error ? err.message : 'Không chạy được chẩn đoán.'); } finally { setDiagnosing(false); } }} disabled={diagnosing} className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50">{diagnosing ? 'Đang kiểm tra…' : 'Kiểm tra kết nối'}</button></div>
    </div>

    {error && <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4"><AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" /><div><p className="text-sm font-semibold text-red-800">Không tải được báo cáo</p><p className="mt-0.5 text-xs text-red-700">{error}</p></div></div>}
    {diagnostic && <div className={`rounded-xl border p-4 ${diagnostic.ok ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'}`}><p className={`text-sm font-bold ${diagnostic.ok ? 'text-emerald-800' : 'text-red-800'}`}>{diagnostic.ok ? 'Kết nối GA4 thành công' : 'Chẩn đoán xác định lỗi'}</p><p className={`mt-1 text-xs ${diagnostic.ok ? 'text-emerald-700' : 'text-red-700'}`}>{diagnostic.message}</p><p className="mt-2 text-[11px] text-gray-600">Giai đoạn: {diagnostic.stage} · Property: {diagnostic.propertyId ?? 'không đọc được'} · Service account: {diagnostic.serviceAccount ?? 'không đọc được'}</p></div>}
    {!error && configurationState !== 'configured' && !loading && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5"><p className="font-bold text-amber-900">GA4 chưa sẵn sàng</p><p className="mt-1 text-sm leading-6 text-amber-800">Cần cấu hình GOOGLE_ANALYTICS_CLIENT_EMAIL, GOOGLE_ANALYTICS_PRIVATE_KEY và GOOGLE_ANALYTICS_PROPERTY_ID trên server, sau đó cấp quyền Viewer cho service account trong GA4.</p></div>}
    {loading && <div className="rounded-xl border border-gray-200 bg-white p-12 text-center text-sm text-gray-400">Đang tải báo cáo GA4...</div>}
    {!loading && !error && report && <>
      <MeasuredFunnel report={report} />
      <DimensionBreakdown report={report} />
      <ReportContent report={report} />
    </>}
    <CrmEvidence summary={crmSummary} error={crmError} roster={crmRoster} />
  </div>;
}
