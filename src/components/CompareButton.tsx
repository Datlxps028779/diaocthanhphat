'use client';
import { useEffect, useState } from 'react';
import { Scale } from 'lucide-react';
import type { Property } from '../lib/supabase';
import { isInCompare, toggleCompare, COMPARE_EVENT, COMPARE_MAX } from '../lib/compare';

// Nút thêm/bớt BĐS khỏi danh sách so sánh. Tự quản trạng thái qua localStorage +
// COMPARE_EVENT nên đặt được trên mọi card mà không cần thread state từ parent.
// variant 'overlay' cho card grid (nút tròn nổi trên ảnh), 'inline' cho list.
export function CompareButton({ property, variant = 'overlay', className = '' }: {
  property: Property;
  variant?: 'overlay' | 'inline';
  className?: string;
}) {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const sync = () => setActive(isInCompare(property.id));
    sync();
    window.addEventListener(COMPARE_EVENT, sync);
    return () => window.removeEventListener(COMPARE_EVENT, sync);
  }, [property.id]);

  const handle = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const { full } = toggleCompare(property);
    if (full) {
      alert(`Chỉ so sánh tối đa ${COMPARE_MAX} bất động sản cùng lúc.`);
    }
  };

  const base = variant === 'overlay'
    ? 'w-7 h-7 bg-white/90 rounded-full flex items-center justify-center shadow hover:scale-110 transition-transform'
    : 'w-8 h-8 border rounded-lg flex items-center justify-center transition-colors';
  const state = active
    ? 'text-red-600' + (variant === 'inline' ? ' border-red-400 bg-red-50' : '')
    : 'text-gray-400' + (variant === 'inline' ? ' border-gray-200 hover:border-red-400' : '');

  return (
    <button onClick={handle} title={active ? 'Bỏ khỏi so sánh' : 'Thêm vào so sánh'}
      aria-label={active ? 'Bỏ khỏi so sánh' : 'Thêm vào so sánh'}
      className={`${base} ${state} ${className}`}>
      <Scale className="w-3.5 h-3.5" />
    </button>
  );
}
