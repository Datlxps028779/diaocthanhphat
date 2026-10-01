import { useEffect, useState } from 'react';
import { CircleDollarSign } from 'lucide-react';
import { getCommerceOperationsAlertCount } from '../../../lib/api/commerce';

export function CommerceOperationsBell({ onOpen }: { onOpen: () => void }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const next = await getCommerceOperationsAlertCount();
        if (alive) setCount(next);
      } catch {
        if (alive) setCount(0);
      }
    };
    load();
    const timer = setInterval(load, 30_000);
    return () => { alive = false; clearInterval(timer); };
  }, []);

  if (count === 0) return null;

  return (
    <button
      onClick={onOpen}
      title={`${count} cảnh báo thanh toán chưa xử lý`}
      className="flex items-center gap-1.5 rounded-lg bg-red-100 px-2.5 py-1.5 text-xs font-bold text-red-700 transition-colors hover:bg-red-200"
    >
      <CircleDollarSign className="w-3.5 h-3.5" />
      {count} thanh toán
    </button>
  );
}
