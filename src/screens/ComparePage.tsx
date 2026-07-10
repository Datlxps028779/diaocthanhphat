'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Scale, X, Trash2 } from 'lucide-react';
import { getCompareList, removeFromCompare, clearCompare, COMPARE_EVENT, type CompareProperty } from '../lib/compare';
import { buildPropertyPath } from '../lib/api/properties';
import { Breadcrumb } from '../components/Layout';
import { type Page } from '../lib/router';

// Bảng so sánh BĐS đã chọn (tối đa 3). Đọc localStorage sau mount (tránh lệch
// hydration) và lắng nghe COMPARE_EVENT để cập nhật khi user gỡ bớt.
export function ComparePage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [items, setItems] = useState<CompareProperty[]>([]);

  useEffect(() => {
    const sync = () => setItems(getCompareList());
    sync();
    window.addEventListener(COMPARE_EVENT, sync);
    return () => window.removeEventListener(COMPARE_EVENT, sync);
  }, []);

  const price = (p: CompareProperty) => p.price_label ?? `${p.price} ${p.price_unit}`;
  const rows: { label: string; render: (p: CompareProperty) => React.ReactNode }[] = [
    { label: 'Giá', render: p => <span className="text-red-600 font-bold">{price(p)}</span> },
    { label: 'Diện tích', render: p => p.area_sqm ? `${p.area_sqm} m²` : '—' },
    { label: 'Giá/m²', render: p => p.area_sqm && p.price ? `${(((p.price_unit === 'tỷ' ? p.price * 1000 : p.price)) / p.area_sqm).toFixed(1)} tr/m²` : '—' },
    { label: 'Phòng ngủ', render: p => p.bedrooms ? `${p.bedrooms}` : '—' },
    { label: 'Phòng tắm', render: p => p.bathrooms ? `${p.bathrooms}` : '—' },
    { label: 'Hướng', render: p => p.direction || '—' },
    { label: 'Pháp lý', render: p => p.legal_status || '—' },
    { label: 'Khu vực', render: p => `${p.district ? p.district + ', ' : ''}${p.city}` },
    { label: 'Hình thức', render: p => p.listing_type === 'cho_thue' ? 'Cho thuê' : 'Mua bán' },
  ];

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <Breadcrumb items={[{ label: 'Trang chủ', onClick: () => onNavigate({ name: 'home' }) }, { label: 'So sánh BĐS' }]} />

      <div className="flex items-center justify-between mb-6 mt-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-red-600 rounded-xl flex items-center justify-center">
            <Scale className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-black text-gray-900">So sánh bất động sản</h1>
        </div>
        {items.length > 0 && (
          <button onClick={() => clearCompare()}
            className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 text-sm transition-colors">
            <Trash2 className="w-4 h-4" />Xóa tất cả
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-2xl border border-gray-100">
          <Scale className="w-12 h-12 text-gray-200 mx-auto mb-3" />
          <p className="text-gray-500 font-medium">Chưa có BĐS nào để so sánh.</p>
          <p className="text-gray-400 text-sm mt-1">Bấm biểu tượng cân trên các tin để thêm vào so sánh (tối đa 3).</p>
          <button onClick={() => onNavigate({ name: 'listings' })}
            className="mt-4 inline-block px-5 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors">
            Xem danh sách BĐS
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-2xl border border-gray-100 shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="w-28 p-3"></th>
                {items.map(p => (
                  <th key={p.id} className="p-3 align-top min-w-[180px]">
                    <div className="relative">
                      <button onClick={() => removeFromCompare(p.id)}
                        className="absolute -top-1 -right-1 z-[2] w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-red-50 hover:border-red-300 transition-colors">
                        <X className="w-3.5 h-3.5 text-gray-500" />
                      </button>
                      <Link href={buildPropertyPath(p)} className="block">
                        <div className="h-24 rounded-lg overflow-hidden mb-2">
                          <img src={p.image_url ?? 'https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg'}
                            alt={p.title} className="w-full h-full object-cover" />
                        </div>
                        <span className="text-gray-900 font-semibold text-xs leading-snug line-clamp-2 hover:text-red-600 text-left block">{p.title}</span>
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.label} className={i % 2 ? 'bg-gray-50/60' : ''}>
                  <td className="p-3 text-gray-500 font-medium text-xs">{r.label}</td>
                  {items.map(p => (
                    <td key={p.id} className="p-3 text-gray-800">{r.render(p)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
