'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Scale, X, Trash2, Check, Plus, Share2 } from 'lucide-react';
import { getCompareList, removeFromCompare, clearCompare, setCompareList, COMPARE_EVENT, COMPARE_MAX, type CompareProperty } from '../lib/compare';
import { buildPropertyPath, getPropertyById } from '../lib/api/properties';
import { Breadcrumb } from '../components/Layout';
import { type Page } from '../lib/router';

// Bảng so sánh BĐS đã chọn (tối đa 3). Đọc localStorage sau mount (tránh lệch
// hydration) và lắng nghe COMPARE_EVENT để cập nhật khi user gỡ bớt.
export function ComparePage({ onNavigate }: { onNavigate: (p: Page) => void }) {
  const [items, setItems] = useState<CompareProperty[]>([]);
  const [shared, setShared] = useState(false);

  useEffect(() => {
    const sync = () => setItems(getCompareList());
    window.addEventListener(COMPARE_EVENT, sync);

    // Link chia sẻ ?ids=a,b,c → dựng lại danh sách từ DB rồi dọn query khỏi URL.
    const ids = new URLSearchParams(window.location.search).get('ids');
    const wanted = ids ? ids.split(',').map(s => s.trim()).filter(Boolean).slice(0, COMPARE_MAX) : [];
    if (wanted.length) {
      Promise.all(wanted.map(id => getPropertyById(id)))
        .then(props => {
          const found = props.filter((p): p is NonNullable<typeof p> => p != null);
          if (found.length) setCompareList(found);
          sync();
        })
        .catch(() => sync());
      window.history.replaceState(null, '', window.location.pathname);
    } else {
      sync();
    }

    return () => window.removeEventListener(COMPARE_EVENT, sync);
  }, []);

  const share = async () => {
    const url = `${window.location.origin}${window.location.pathname}?ids=${items.map(p => p.id).join(',')}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'So sánh bất động sản', url });
      } else {
        await navigator.clipboard.writeText(url);
        setShared(true);
        setTimeout(() => setShared(false), 2000);
      }
    } catch {
      // user huỷ hộp chia sẻ hoặc clipboard bị chặn → bỏ qua.
    }
  };

  const price = (p: CompareProperty) => p.price_label ?? `${p.price} ${p.price_unit}`;
  const priceTrieu = (p: CompareProperty) => p.price ? (p.price_unit === 'tỷ' ? p.price * 1000 : p.price) : null;
  const pricePerSqm = (p: CompareProperty) => {
    const t = priceTrieu(p);
    return p.area_sqm && t ? t / p.area_sqm : null;
  };

  // `metric` trả về giá trị số để so sánh; `better` quyết định giá trị nào là "tốt
  // nhất" trong hàng (giá & giá/m² thấp hơn thắng, còn lại cao hơn thắng).
  type Row = {
    label: string;
    render: (p: CompareProperty) => React.ReactNode;
    metric?: (p: CompareProperty) => number | null;
    better?: 'min' | 'max';
  };
  const rows: Row[] = [
    { label: 'Giá', render: p => <span className="text-red-600 font-bold">{price(p)}</span>, metric: priceTrieu, better: 'min' },
    { label: 'Diện tích', render: p => p.area_sqm ? `${p.area_sqm} m²` : '—', metric: p => p.area_sqm || null, better: 'max' },
    { label: 'Giá/m²', render: p => { const v = pricePerSqm(p); return v ? `${v.toFixed(1)} tr/m²` : '—'; }, metric: pricePerSqm, better: 'min' },
    { label: 'Phòng ngủ', render: p => p.bedrooms ? `${p.bedrooms}` : '—', metric: p => p.bedrooms || null, better: 'max' },
    { label: 'Phòng tắm', render: p => p.bathrooms ? `${p.bathrooms}` : '—', metric: p => p.bathrooms || null, better: 'max' },
    { label: 'Hướng', render: p => p.direction || '—' },
    { label: 'Pháp lý', render: p => p.legal_status || '—' },
    { label: 'Khu vực', render: p => `${p.district ? p.district + ', ' : ''}${p.city}` },
    { label: 'Hình thức', render: p => p.listing_type === 'cho_thue' ? 'Cho thuê' : 'Mua bán' },
  ];

  // ID các BĐS "thắng" ở một hàng. Chỉ đánh dấu khi có ≥2 giá trị hợp lệ và giá trị
  // tốt nhất không phải toàn bộ bằng nhau (nếu tất cả bằng nhau thì không nổi bật ai).
  const bestIds = (r: Row): Set<string> => {
    if (!r.metric || !r.better || items.length < 2) return new Set();
    const vals = items.map(p => ({ id: p.id, v: r.metric!(p) })).filter(x => x.v != null) as { id: string; v: number }[];
    if (vals.length < 2) return new Set();
    const best = r.better === 'min' ? Math.min(...vals.map(x => x.v)) : Math.max(...vals.map(x => x.v));
    const winners = vals.filter(x => x.v === best);
    if (winners.length === vals.length) return new Set();
    return new Set(winners.map(x => x.id));
  };

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
          <div className="flex items-center gap-4">
            <button onClick={share}
              className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 text-sm transition-colors">
              <Share2 className="w-4 h-4" />{shared ? 'Đã sao chép link' : 'Chia sẻ'}
            </button>
            <button onClick={() => clearCompare()}
              className="flex items-center gap-1.5 text-gray-500 hover:text-red-600 text-sm transition-colors">
              <Trash2 className="w-4 h-4" />Xóa tất cả
            </button>
          </div>
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
                {items.length < COMPARE_MAX && (
                  <th className="p-3 align-top min-w-[180px]">
                    <button onClick={() => onNavigate({ name: 'listings' })}
                      className="w-full h-full min-h-[128px] flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500 transition-colors">
                      <Plus className="w-6 h-6" />
                      <span className="text-xs font-medium">Thêm BĐS để so sánh</span>
                    </button>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const best = bestIds(r);
                return (
                  <tr key={r.label} className={i % 2 ? 'bg-gray-50/60' : ''}>
                    <td className="p-3 text-gray-500 font-medium text-xs">{r.label}</td>
                    {items.map(p => {
                      const isBest = best.has(p.id);
                      return (
                        <td key={p.id} className={`p-3 text-gray-800 ${isBest ? 'bg-green-50' : ''}`}>
                          <span className={isBest ? 'inline-flex items-center gap-1 font-semibold text-green-700' : ''}>
                            {r.render(p)}
                            {isBest && <Check className="w-3.5 h-3.5 text-green-600 shrink-0" />}
                          </span>
                        </td>
                      );
                    })}
                    {items.length < COMPARE_MAX && <td className="p-3"></td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {items.length > 1 && (
        <p className="text-xs text-gray-400 mt-3 flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5 text-green-600" />
          Ô được tô xanh là lựa chọn tốt nhất ở tiêu chí đó (giá & giá/m² thấp hơn, diện tích & số phòng nhiều hơn).
        </p>
      )}
    </div>
  );
}
