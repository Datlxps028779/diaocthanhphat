'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Scale, X } from 'lucide-react';
import { getCompareList, clearCompare, removeFromCompare, COMPARE_EVENT, type CompareProperty } from '../lib/compare';
import { pageToHref } from '../lib/router';

// Thanh nổi hiện ở đáy màn hình khi có BĐS trong danh sách so sánh, cho lối tắt
// tới trang /so-sanh. Đọc localStorage + lắng nghe COMPARE_EVENT (client-only).
export function CompareBar() {
  const [items, setItems] = useState<CompareProperty[]>([]);

  useEffect(() => {
    const sync = () => setItems(getCompareList());
    sync();
    window.addEventListener(COMPARE_EVENT, sync);
    return () => window.removeEventListener(COMPARE_EVENT, sync);
  }, []);

  if (items.length === 0) return null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-[min(94vw,640px)]">
      <div className="bg-white rounded-2xl shadow-xl border border-gray-200 p-3 flex items-center gap-3">
        <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto">
          {items.map(p => (
            <div key={p.id} className="relative flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border border-gray-100">
              <img src={p.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'}
                alt={p.title} className="w-full h-full object-cover" />
              <button onClick={() => removeFromCompare(p.id)}
                className="absolute top-0 right-0 w-4 h-4 bg-black/60 flex items-center justify-center rounded-bl">
                <X className="w-2.5 h-2.5 text-white" />
              </button>
            </div>
          ))}
        </div>
        <button onClick={() => clearCompare()} className="text-gray-400 hover:text-gray-600 text-xs flex-shrink-0">Xóa</button>
        <Link href={pageToHref({ name: 'compare' })}
          className="flex-shrink-0 bg-red-600 hover:bg-red-700 text-white font-semibold px-4 py-2 rounded-xl text-sm flex items-center gap-1.5 transition-colors">
          <Scale className="w-4 h-4" />So sánh ({items.length})
        </Link>
      </div>
    </div>
  );
}
