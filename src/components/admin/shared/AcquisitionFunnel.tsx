import { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, MessageCircle, Phone, Trophy, UserPlus } from 'lucide-react';
import type { Lead } from '../../../lib/supabase';
import { getChatSessions } from '../../../lib/api';
import { acquisitionFunnel } from '../../../lib/acquisitionFunnel';
import { useQuery } from '@tanstack/react-query';

export function AcquisitionFunnel({ leads }: { leads: Lead[] }) {
  const [open, setOpen] = useState(false);
  const { data: sessions = [] } = useQuery({ queryKey: ['acquisitionChatSessions'], queryFn: () => getChatSessions('all') });
  const report = useMemo(() => acquisitionFunnel(sessions, leads), [sessions, leads]);
  const maxCount = Math.max(1, ...report.steps.map(s => s.count));

  if (report.totals.opened === 0) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
      <button onClick={() => setOpen(o => !o)} className="w-full flex items-center justify-between px-4 py-3 text-left">
        <span className="flex items-center gap-2 font-bold text-gray-900 text-sm">
          <MessageCircle className="w-4 h-4 text-red-500" />
          Phễu AI Advisor → Lead
          <span className="text-xs font-normal text-gray-400">({report.totals.opened} phiên chat)</span>
        </span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-600">
            <Trophy className="w-3.5 h-3.5" />Chốt {report.steps[3]?.pctOfOpened ?? 0}%
          </span>
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-5 border-t border-gray-100 pt-4">
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Để SĐT/gặp NV', value: `${report.steps[1]?.pctOfPrevious ?? 0}%`, icon: <Phone className="w-4 h-4 text-blue-500" />, hint: `${report.totals.contactIntent}/${report.totals.opened} phiên` },
              { label: 'Thành lead', value: `${report.steps[2]?.pctOfPrevious ?? 0}%`, icon: <UserPlus className="w-4 h-4 text-violet-500" />, hint: `${report.totals.leads}/${report.totals.contactIntent} có nhu cầu` },
              { label: 'Chốt', value: `${report.steps[3]?.pctOfPrevious ?? 0}%`, icon: <Trophy className="w-4 h-4 text-amber-500" />, hint: `${report.totals.won}/${report.totals.leads} lead` },
            ].map(k => (
              <div key={k.label} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center gap-1.5 mb-1">{k.icon}<span className="text-xs text-gray-500">{k.label}</span></div>
                <p className="text-xl font-black text-gray-900">{k.value}</p>
                <p className="text-[10px] text-gray-400">{k.hint}</p>
              </div>
            ))}
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1">
              <BarChart3 className="w-3.5 h-3.5 text-red-500" />Từ chat tới khách chốt
            </p>
            <div className="space-y-2">
              {report.steps.map(s => (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="text-xs text-gray-600 w-28 flex-shrink-0">{s.label}</span>
                  <div className="flex-1 h-5 bg-gray-100 rounded-md overflow-hidden">
                    <div className="h-full rounded-md bg-red-500 transition-all duration-500" style={{ width: `${Math.round((s.count / maxCount) * 100)}%` }} />
                  </div>
                  <span className="text-xs font-semibold text-gray-700 w-20 flex-shrink-0 text-right">{s.count} · {s.pctOfOpened}%</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray-400 mt-3">“Đóng phiên chat” khác “chốt deal”: bậc Chốt dùng trạng thái lead = won.</p>
          </div>
        </div>
      )}
    </div>
  );
}
