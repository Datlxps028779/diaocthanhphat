'use client';
import { useState } from 'react';
import { Search } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { pageToHref } from '../lib/router';
import { parseSearchIntent } from '../lib/aiSearch';
import { useAreas, usePropertyTypes, useDistricts, useWards } from '../lib/hooks/useTaxonomy';
import { track, EVENTS } from '../lib/analytics';

// Ô tìm kiếm nằm trên header, hiện ở mọi trang. Không tự ghép query string:
// parseSearchIntent bóc ý định từ câu tiếng Việt ("nhà Dĩ An dưới 3 tỷ") rồi
// pageToHref sinh URL — cùng đường với hero và trang danh sách.
export function HeaderSearch({ className = '', placeholder = 'Tìm nhà đất, khu vực, dự án...' }: { className?: string; placeholder?: string }) {
  const [keyword, setKeyword] = useState('');
  const router = useRouter();
  const { data: areas = [] } = useAreas();
  const { data: propertyTypes = [] } = usePropertyTypes();
  // Lấy toàn bộ quận/huyện + phường/xã (không truyền tham số): thiếu chúng thì
  // parseSearchIntent không nhận ra "Dĩ An", "Thuận An"... và trả về 0 kết quả.
  const { data: districts = [] } = useDistricts();
  const { data: wards = [] } = useWards();

  const submit = () => {
    const term = keyword.trim();
    if (!term) return;
    const intent = parseSearchIntent(term, { areas, districts, wards, propertyTypes });
    const listingType = intent.filters.listingType === 'mua_ban' || intent.filters.listingType === 'cho_thue'
      ? intent.filters.listingType
      : undefined;
    track(EVENTS.SEARCH, { listingType: listingType ?? 'all', hasKeyword: true, hasArea: !!intent.filters.areaId, source: 'header' });
    router.push(pageToHref({
      name: 'listings',
      listingType,
      areaId: intent.filters.areaId,
      district: intent.filters.district,
      ward: intent.filters.ward,
      typeId: intent.filters.typeId,
      minPrice: intent.filters.minPrice,
      maxPrice: intent.filters.maxPrice,
      keyword: intent.residualKeyword.trim() || undefined,
    }, { areas, districts }));
  };

  return (
    <div className={`relative ${className}`}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        type="search"
        value={keyword}
        onChange={event => setKeyword(event.target.value)}
        onKeyDown={event => { if (event.key === 'Enter') submit(); }}
        placeholder={placeholder}
        aria-label="Tìm kiếm bất động sản"
        className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-20 text-sm text-slate-800 transition-colors placeholder:text-slate-400 focus:border-red-300 focus:bg-white focus:outline-none focus:ring-2 focus:ring-red-100"
      />
      <button type="button" onClick={submit}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-700">
        Tìm
      </button>
    </div>
  );
}
