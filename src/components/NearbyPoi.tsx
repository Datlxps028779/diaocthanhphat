'use client';
import { useState } from 'react';
import { MapPin, GraduationCap, ShoppingCart, Stethoscope, Landmark, Trees, Loader2 } from 'lucide-react';
import { fetchNearbyPoi } from '../lib/api/poi';
import { POI_CATEGORIES, categoryLabel, type NearbyPoi as Poi, type PoiCategoryKey } from '../lib/poi';

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
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [pois, setPois] = useState<Poi[]>([]);

  const load = async () => {
    setState('loading');
    const result = await fetchNearbyPoi(lat, lng);
    setPois(result);
    setState('done');
  };

  if (state === 'idle') {
    return (
      <button
        onClick={load}
        className="mt-3 w-full sm:w-auto flex items-center justify-center gap-2 text-sm font-semibold text-gray-700 border border-gray-200 hover:border-red-300 hover:text-red-600 rounded-xl py-2.5 px-5 transition-colors"
      >
        <MapPin className="w-4 h-4" />Xem tiện ích xung quanh
      </button>
    );
  }

  if (state === 'loading') {
    return (
      <div className="mt-3 flex items-center gap-2 text-sm text-gray-500">
        <Loader2 className="w-4 h-4 animate-spin" />Đang tìm tiện ích xung quanh…
      </div>
    );
  }

  if (pois.length === 0) return null;

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
