'use client';
import { useMemo, useState } from 'react';
import { Bot, Send, Sparkles, X } from 'lucide-react';
import { type Page } from '../lib/router';
import { parseSearchIntent } from '../lib/aiSearch';
import { useAreas, useDistricts, usePropertyTypes, useWards } from '../lib/hooks/useTaxonomy';

const EXAMPLES = [
  'Nhà Dĩ An dưới 3 tỷ sổ hồng',
  'Cho thuê căn hộ Thủ Dầu Một 5-10 triệu',
  'Đất nền Bến Cát trên 100m2 gần VSIP',
];

export function AiSearchChat({ onNavigate }: { onNavigate?: (p: Page) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data: areas = [], isLoading: loadingAreas } = useAreas();
  const { data: propertyTypes = [], isLoading: loadingTypes } = usePropertyTypes();
  const { data: districts = [], isLoading: loadingDistricts } = useDistricts();
  const { data: wards = [], isLoading: loadingWards } = useWards();
  const taxonomyReady = !loadingAreas && !loadingTypes && !loadingDistricts && !loadingWards;

  const intent = useMemo(
    () => parseSearchIntent(query, { areas, districts, wards, propertyTypes }),
    [query, areas, districts, wards, propertyTypes],
  );

  const search = (raw = query) => {
    const text = raw.trim();
    if (!text || !onNavigate) return;
    const parsed = parseSearchIntent(text, { areas, districts, wards, propertyTypes });
    onNavigate({
      name: 'listings',
      listingType: parsed.filters.listingType === 'mua_ban' || parsed.filters.listingType === 'cho_thue' ? parsed.filters.listingType : undefined,
      areaId: parsed.filters.areaId,
      district: parsed.filters.district,
      ward: parsed.filters.ward,
      typeId: parsed.filters.typeId,
      keyword: text,
      minPrice: parsed.filters.minPrice,
      maxPrice: parsed.filters.maxPrice,
      minArea: parsed.filters.minArea,
      maxArea: parsed.filters.maxArea,
      bedrooms: parsed.filters.bedrooms,
      legal: parsed.filters.legal,
      direction: parsed.filters.direction,
      sort: 'relevance',
    });
    setOpen(false);
  };

  return (
    <div className="relative">
      {open && (
        <div className="absolute bottom-16 right-0 w-[320px] max-w-[calc(100vw-2rem)] bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden animate-fade-in">
          <div className="bg-gradient-to-r from-red-600 to-orange-500 text-white p-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2 font-black text-sm"><Bot className="w-4 h-4" />Trợ lý tìm BĐS</div>
              <p className="text-xs text-white/80 mt-1">Nói nhu cầu của bạn, AI sẽ lọc tin phù hợp.</p>
            </div>
            <button onClick={() => setOpen(false)} className="p-1 rounded-full hover:bg-white/15 transition-colors" aria-label="Đóng trợ lý">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="p-4 space-y-3">
            <div className="bg-gray-50 rounded-xl p-3 text-sm text-gray-700">
              Bạn muốn mua/thuê ở khu vực nào, tầm giá bao nhiêu, cần pháp lý hay số phòng ngủ thế nào?
            </div>
            <div className="space-y-2">
              <textarea
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') search();
                }}
                placeholder="Ví dụ: nhà Dĩ An dưới 3 tỷ sổ hồng"
                className="w-full min-h-[86px] resize-none rounded-xl border border-gray-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
              />
              {!taxonomyReady && <p className="text-xs text-gray-400">Đang nạp dữ liệu khu vực/loại BĐS…</p>}
              {intent.matched.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {intent.matched.map(m => (
                    <span key={`${m.kind}-${m.label}`} className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded-full px-2 py-1">
                      {m.label}
                    </span>
                  ))}
                </div>
              )}
              <button
                onClick={() => search()}
                disabled={!query.trim() || !onNavigate || !taxonomyReady}
                className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:hover:bg-red-600 text-white font-semibold text-sm py-2.5 rounded-xl flex items-center justify-center gap-2 transition-colors"
              >
                <Send className="w-4 h-4" />Lọc BĐS phù hợp
              </button>
            </div>
            <div className="space-y-1.5">
              <p className="text-[11px] uppercase tracking-wide text-gray-400 font-bold">Gợi ý nhanh</p>
              {EXAMPLES.map(example => (
                <button key={example} disabled={!taxonomyReady} onClick={() => { setQuery(example); search(example); }} className="block w-full text-left text-xs text-gray-600 hover:text-red-600 bg-gray-50 hover:bg-red-50 disabled:opacity-50 rounded-lg px-3 py-2 transition-colors">
                  {example}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <button
        onClick={() => setOpen(v => !v)}
        className="relative w-12 h-12 rounded-full bg-gradient-to-br from-red-600 to-orange-500 text-white shadow-lg hover:scale-110 transition-all flex items-center justify-center"
        title="AI tìm BĐS cho bạn"
        aria-label="Mở trợ lý AI tìm BĐS"
      >
        <span className="absolute inset-0 rounded-full bg-red-500/30 animate-ping" />
        <Bot className="w-5 h-5 relative z-[1]" />
        <Sparkles className="w-3 h-3 absolute top-2 right-2 z-[1] animate-pulse" />
      </button>
    </div>
  );
}
