import { useState, useEffect } from 'react';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { getOpenLeadSla } from '../../../lib/api';
import { countSlaStates, type SlaLead, type SlaCounts } from '../../../lib/leadSla';

// Chuông nhắc SLA ở header admin (mọi tab đều thấy) — đếm lead quá hạn / cần gọi hôm
// nay để NV không bỏ sót lead nóng. Tự tải + làm mới mỗi 60s. Bấm → mở tab Khách hàng.
export function SlaBell({ onOpenLeads }: { onOpenLeads: () => void }) {
  const [counts, setCounts] = useState<SlaCounts>({ overdue: 0, dueSoon: 0, total: 0 });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const rows = await getOpenLeadSla();
        if (alive) setCounts(countSlaStates(rows as SlaLead[], new Date()));
      } catch { /* im lặng — chuông chỉ là nhắc phụ, không chặn admin */ }
    };
    load();
    const t = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (counts.total === 0) return null;

  const hasOverdue = counts.overdue > 0;
  return (
    <button onClick={onOpenLeads}
      title={`${counts.overdue} quá hạn · ${counts.dueSoon} cần gọi hôm nay`}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
        hasOverdue ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'}`}>
      {hasOverdue
        ? <><AlertTriangle className="w-3.5 h-3.5" />{counts.overdue} quá hạn{counts.dueSoon > 0 && ` · ${counts.dueSoon} hôm nay`}</>
        : <><CalendarClock className="w-3.5 h-3.5" />{counts.dueSoon} cần gọi hôm nay</>}
    </button>
  );
}
