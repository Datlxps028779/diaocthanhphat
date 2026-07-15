import { useEffect, useState } from 'react';
import { MessageCircleWarning, MessagesSquare } from 'lucide-react';
import { getChatOpsAlerts } from '../../../lib/api';

export function ChatOpsBell({ onOpenChat }: { onOpenChat: () => void }) {
  const [counts, setCounts] = useState({ attention: 0, active: 0, newSessions: 0 });

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await getChatOpsAlerts();
        if (alive) setCounts(next);
      } catch { /* chuông phụ, không chặn panel */ }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (counts.attention === 0 && counts.newSessions === 0 && counts.active === 0) return null;

  const urgent = counts.attention > 0 || counts.newSessions > 0;
  return (
    <button onClick={onOpenChat}
      title={`${counts.attention} cần admin · ${counts.newSessions} phiên mới · ${counts.active} đang xử lý`}
      className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-colors ${
        urgent ? 'bg-red-100 text-red-700 hover:bg-red-200' : 'bg-blue-100 text-blue-700 hover:bg-blue-200'}`}>
      {urgent
        ? <><MessageCircleWarning className="w-3.5 h-3.5" />{counts.attention + counts.newSessions} phiên chat</>
        : <><MessagesSquare className="w-3.5 h-3.5" />{counts.active} đang chat</>}
    </button>
  );
}
