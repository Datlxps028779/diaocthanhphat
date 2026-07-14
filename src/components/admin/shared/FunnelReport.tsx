import { useState, useMemo } from 'react';
import { BarChart3, ChevronDown, TrendingUp, Trophy, CalendarRange } from 'lucide-react';
import type { Lead } from '../../../lib/supabase';
import { funnelReport, conversionRate, staffPerformance, leadsInLastDays, type AnalyticsLead } from '../../../lib/leadAnalytics';
import type { TeamMember } from '../../../lib/leadAssignment';
import { stageMeta } from '../../../lib/leadPipeline';

// Báo cáo phễu CRM: phân tích trên toàn bộ lead đang tải ở LeadsTab (không fetch thêm).
// Mặc định thu gọn để không che danh sách; bung ra khi cần xem tổng quan.
export function FunnelReport({ leads, roster }: { leads: Lead[]; roster: TeamMember[] }) {
  const [open, setOpen] = useState(false);
  const now = useMemo(() => new Date(), []);

  // Chuẩn hoá Lead → AnalyticsLead (status + assignee_ids + created_at) cho hàm thuần.
  const analyticsLeads = useMemo<AnalyticsLead[]>(
    () => leads.map(l => ({ status: l.status, created_at: l.created_at, assignee_ids: (l.lead_assignments ?? []).map(a => a.user_id) })),
    [leads],
  );
  const rows = useMemo(() => funnelReport(analyticsLeads), [analyticsLeads]);
  const conv = useMemo(() => conversionRate(analyticsLeads), [analyticsLeads]);
  const staff = useMemo(() => staffPerformance(analyticsLeads, roster), [analyticsLeads, roster]);
  const last7 = useMemo(() => leadsInLastDays(analyticsLeads, 7, now), [analyticsLeads, now]);
  const last30 = useMemo(() => leadsInLastDays(analyticsLeads, 30, now), [analyticsLeads, now]);
  const maxCount = Math.max(1, ...rows.map(r => r.count));

  if (leads.length === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <button onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2 font-bold text-gray-900 text-sm">
          <BarChart3 className="w-4 h-4 text-red-500" />
          Báo cáo phễu chuyển đổi
          <span className="text-xs font-normal text-gray-400">({leads.length} khách)</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
            <TrendingUp className="w-3.5 h-3.5" />Chốt {conv}%
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5 border-t border-gray-100 pt-4">
          {/* KPI hàng ngang */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Tỉ lệ chốt', value: `${conv}%`, icon: <TrendingUp className="w-4 h-4 text-emerald-500" />, hint: 'trên số đã kết thúc' },
              { label: '7 ngày qua', value: last7, icon: <CalendarRange className="w-4 h-4 text-blue-500" />, hint: 'khách mới' },
              { label: '30 ngày qua', value: last30, icon: <CalendarRange className="w-4 h-4 text-violet-500" />, hint: 'khách mới' },
            ].map(k => (
              <div key={k.label} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">{k.icon}<span className="text-xs text-gray-500">{k.label}</span></div>
                <p className="text-xl font-black text-gray-900">{k.value}</p>
                <p className="text-[10px] text-gray-400">{k.hint}</p>
              </div>
            ))}
          </div>

          {/* Phễu theo giai đoạn */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Phân bố theo giai đoạn</p>
            <div className="space-y-2">
              {rows.map(r => (
                <div key={r.key} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-24 flex-shrink-0">{r.label}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden">
                    <div className={`h-full rounded-md transition-all duration-500 ${stageMeta(r.key).dot}`}
                      style={{ width: `${Math.round((r.count / maxCount) * 100)}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-16 flex-shrink-0 text-right">{r.count} · {r.pct}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Hiệu suất nhân viên */}
          {staff.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
                <Trophy className="w-3.5 h-3.5 text-amber-500" />Hiệu suất nhân viên
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-gray-400 border-b border-gray-100">
                      <th className="text-left font-medium py-1.5">Nhân viên</th>
                      <th className="text-right font-medium">Tổng</th>
                      <th className="text-right font-medium">Đang xử lý</th>
                      <th className="text-right font-medium">Chốt</th>
                      <th className="text-right font-medium">Tỉ lệ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map(s => (
                      <tr key={s.name} className="border-b border-gray-50 last:border-0">
                        <td className="py-1.5 text-gray-800 font-medium">{s.name}</td>
                        <td className="text-right text-gray-600">{s.total}</td>
                        <td className="text-right text-gray-600">{s.open}</td>
                        <td className="text-right text-emerald-600 font-semibold">{s.won}</td>
                        <td className="text-right text-gray-700 font-semibold">{s.winRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
