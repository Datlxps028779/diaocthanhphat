import type { PriceStat, ListingType } from '../lib/supabase';
import { pickOverallStat, formatPricePerSqm, formatUpdateDate, buildPriceAnswer, PRICE_DISCLAIMER } from '../lib/priceStatsFormat';

// Khối "Giá nhà đất tham khảo" dùng chung cho Entity Page khu dân cư và trang khu
// vực (mục 6 updateweb.md). Tự ẩn khi không có mẫu thật (không bịa dữ liệu). Luôn
// kèm số mẫu + ngày cập nhật + câu miễn trừ. showAnswer=false khi trang đã có
// Answer Block ở hero (tránh lặp), true để nhúng câu trả lời trực tiếp cho AIO.

function PriceRow({ label, stat }: { label: string; stat: PriceStat | null }) {
  if (!stat || !stat.median_price_per_sqm) return null;
  return (
    <tr className="border-t border-gray-100">
      <td className="py-2 pr-4 font-semibold text-gray-700">{label}</td>
      <td className="py-2 pr-4 text-gray-900">{formatPricePerSqm(stat.median_price_per_sqm)}</td>
      <td className="py-2 pr-4 text-gray-500">{formatPricePerSqm(stat.min_price_per_sqm)} – {formatPricePerSqm(stat.max_price_per_sqm)}</td>
      <td className="py-2 text-gray-500">{stat.sample_count} tin</td>
    </tr>
  );
}

export function PriceStatsBlock({ entityName, priceStats, showAnswer = true }: { entityName: string; priceStats: PriceStat[]; showAnswer?: boolean }) {
  const saleStat = pickOverallStat(priceStats, 'mua_ban' as ListingType);
  const rentStat = pickOverallStat(priceStats, 'cho_thue' as ListingType);
  const hasPrice = Boolean(saleStat?.median_price_per_sqm || rentStat?.median_price_per_sqm);
  if (!hasPrice) return null;
  const answer = showAnswer
    ? (buildPriceAnswer(entityName, priceStats, 'mua_ban') ?? buildPriceAnswer(entityName, priceStats, 'cho_thue'))
    : null;
  const updatedAt = formatUpdateDate(saleStat?.computed_at || rentStat?.computed_at);

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm md:p-6">
      <p className="text-xs font-bold uppercase tracking-wide text-red-600">Giá nhà đất tham khảo</p>
      <h2 className="mt-1 text-2xl font-black text-gray-900">Giá tại {entityName}</h2>
      {updatedAt && <p className="mt-1 text-xs text-gray-500">Tổng hợp từ tin đăng thực tế · cập nhật {updatedAt}</p>}
      {answer && <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm font-semibold leading-6 text-gray-800">{answer}</p>}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400">
              <th className="pb-2 pr-4 font-semibold">Loại</th>
              <th className="pb-2 pr-4 font-semibold">Trung vị</th>
              <th className="pb-2 pr-4 font-semibold">Khoảng</th>
              <th className="pb-2 font-semibold">Số mẫu</th>
            </tr>
          </thead>
          <tbody>
            <PriceRow label="Mua bán" stat={saleStat} />
            <PriceRow label="Cho thuê" stat={rentStat} />
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs italic leading-6 text-gray-400">{PRICE_DISCLAIMER}</p>
    </div>
  );
}
