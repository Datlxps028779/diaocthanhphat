import type { WardPriceStats } from '../lib/supabase-server';
import { pickOverallStat, formatPricePerSqm, formatUpdateDate, PRICE_DISCLAIMER } from '../lib/priceStatsFormat';

// Bảng giá theo TỪNG phường/xã trong 1 khu vực (Tỉnh) — mục 6 updateweb.md, giúp
// AIO trả lời "giá tại phường X là bao nhiêu". Chỉ hiện phường có mẫu thật (không
// bịa). Trung vị mua bán + cho thuê theo triệu/m², kèm số mẫu.
export function WardPriceBreakdown({ areaName, wards }: { areaName: string; wards: WardPriceStats[] }) {
  const rows = wards
    .map(w => {
      const sale = pickOverallStat(w.stats, 'mua_ban');
      const rent = pickOverallStat(w.stats, 'cho_thue');
      const samples = Math.max(sale?.sample_count ?? 0, rent?.sample_count ?? 0);
      return { name: w.name, slug: w.slug, sale, rent, samples };
    })
    .filter(r => r.sale?.median_price_per_sqm || r.rent?.median_price_per_sqm);
  if (rows.length === 0) return null;

  const updatedAt = formatUpdateDate(
    rows.map(r => r.sale?.computed_at || r.rent?.computed_at).find(Boolean)
  );

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-red-600">Giá theo phường/xã</p>
      <h2 className="mt-1 text-2xl font-black text-gray-900">Giá nhà đất từng phường/xã tại {areaName}</h2>
      {updatedAt && <p className="mt-1 text-xs text-gray-500">Tổng hợp từ tin đăng thực tế · cập nhật {updatedAt}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
              <th className="pb-2 pr-4 font-semibold">Phường/Xã</th>
              <th className="pb-2 pr-4 font-semibold">Mua bán (trung vị)</th>
              <th className="pb-2 pr-4 font-semibold">Cho thuê (trung vị)</th>
              <th className="pb-2 font-semibold">Số mẫu</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.slug} className="border-t border-gray-100">
                <td className="py-2 pr-4 font-semibold text-gray-700">{r.name}</td>
                <td className="py-2 pr-4 text-gray-900">{r.sale?.median_price_per_sqm ? formatPricePerSqm(r.sale.median_price_per_sqm) : '—'}</td>
                <td className="py-2 pr-4 text-gray-900">{r.rent?.median_price_per_sqm ? formatPricePerSqm(r.rent.median_price_per_sqm) : '—'}</td>
                <td className="py-2 text-gray-500">{r.samples} tin</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs italic leading-6 text-gray-400">{PRICE_DISCLAIMER}</p>
    </div>
  );
}
