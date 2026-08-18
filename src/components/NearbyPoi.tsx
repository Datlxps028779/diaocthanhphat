'use client';
import { useState } from 'react';
import { MapPin, GraduationCap, ShoppingCart, Stethoscope, Landmark, Trees, Loader2, RefreshCw } from 'lucide-react';
import { fetchNearbyPoi } from '../lib/api/poi';
import { POI_CATEGORIES, categoryLabel, type NearbyPoi as Poi, type PoiCategoryKey } from '../lib/poi';
import { deriveNearbyPoiViewState, type NearbyPoiRequestState } from '../lib/nearbyPoiState';

const CATEGORY_ICON: Record<PoiCategoryKey, typeof MapPin> = {
  school: GraduationCap,
  market: ShoppingCart,
  hospital: Stethoscope,
  bank: Landmark,
  park: Trees,
};

function distanceLabel(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${m} m`;
}

export function NearbyPoi({ lat, lng }: { lat: number; lng: number }) {
  const [requestState, setRequestState] = useState<NearbyPoiRequestState>('idle');
  const [pois, setPois] = useState<Poi[]>([]);
  const viewState = deriveNearbyPoiViewState(requestState, pois);

  const load = async () => {
    setRequestState('loading');
    const result = await fetchNearbyPoi(lat, lng);
    if (!result.ok) {
      setPois([]);
      setRequestState('error');
      return;
    }
    setPois(result.pois);
    setRequestState('done');
  };

  if (viewState === 'idle') {
    return (
      <button
        onClick={load}
        className="mt-3 w-full sm:w-auto flex items-center justify-center gap-2 text-sm font-semibold text-gray-700 border border-gray-200 hover:border-red-300 hover:text-red-600 rounded-xl py-2.5 px-5 transition-colors"
      >
        <MapPin className="w-4 h-4" />Xem tiện ích xung quanh
      </button>
    );
  }

  if (viewState === 'loading') {
    return (
      <div className="mt-3 flex items-center gap-2 text-sm text-gray-500" role="status">
        <Loader2 className="w-4 h-4 animate-spin" />Đang tìm tiện ích xung quanh…
      </div>
    );
  }

  if (viewState === 'error') {
    return (
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800" role="alert">
        <p>Chưa tải được tiện ích xung quanh. Dữ liệu bản đồ có thể đang tạm thời không khả dụng.</p>
        <button onClick={load} className="mt-2 inline-flex items-center gap-1.5 font-semibold text-amber-900 hover:underline">
          <RefreshCw className="w-3.5 h-3.5" />Thử lại
        </button>
      </div>
    );
  }

  if (viewState === 'empty') {
    return (
      <p className="mt-3 text-sm text-gray-500">
        Chưa tìm thấy tiện ích công khai phù hợp trong phạm vi hiển thị.
      </p>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <h3 className="font-bold text-gray-900 text-sm mb-3">Tiện ích xung quanh</h3>
      <div className="space-y-3">
        {POI_CATEGORIES.map(cat => {
          const items = pois.filter(p => p.category === cat.key);
          if (items.length === 0) return null;
          const Icon = CATEGORY_ICON[cat.key];
          return (
            <div key={cat.key}>
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-500 mb-1.5">
                <Icon className="w-3.5 h-3.5 text-red-500" />{categoryLabel(cat.key)}
              </div>
              <ul className="space-y-1">
                {items.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="flex items-center justify-between text-sm text-gray-700 gap-3">
                    <span className="truncate">{p.name}</span>
                    <span className="text-xs text-gray-400 whitespace-nowrap">{distanceLabel(p.distanceMeters)}</span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-gray-400 mt-3">Nguồn: OpenStreetMap · khoảng cách theo đường chim bay.</p>
    </div>
  );
}
