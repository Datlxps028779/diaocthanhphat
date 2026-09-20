import { useEffect, useRef, useState } from 'react';
import type { Property } from '../lib/supabase';
import type { Page } from '../lib/router';
import type { Map as LeafletMap } from 'leaflet';
import { formatCompactPropertyPrice, getEffectiveListingPrice } from '../lib/listingPrice';
import { buildPropertyCardModel } from '../lib/propertyCardModel';
import { serializePropertyCardPopup } from './property/propertyCardPopup';

export interface MapBounds {
  north: number; south: number; east: number; west: number;
}

interface PropertyMapProps {
  properties: Property[];
  onNavigate: (p: Page) => void;
  height?: string;
  centerLat?: number;
  centerLng?: number;
  zoom?: number;
  onBoundsChange?: (bounds: MapBounds) => void;
  showCountBadge?: boolean;
  // Tự thu bản đồ khít vào các marker đang hiển thị. Khi lọc theo khu vực/quận/xã,
  // bản đồ tự zoom về đúng vùng có tin — càng lọc cụ thể càng zoom sát.
  fitToMarkers?: boolean;
  getGroupKey?: (property: Property) => string;
  selectedGroupKey?: string | null;
  focusGroupKey?: string | null;
  onGroupSelect?: (groupKey: string) => void;
}

function priceTierForProperty(property: Property): { color: string; bg: string; label: string } {
  const effective = getEffectiveListingPrice(property);
  const bil = effective.value == null ? 0 : effective.unit === 'tỷ' ? effective.value : effective.value / 1000;
  if (bil < 1)  return { color: '#15803d', bg: '#dcfce7', label: '< 1 tỷ' };
  if (bil < 3)  return { color: '#b45309', bg: '#fef3c7', label: '1–3 tỷ' };
  if (bil < 8)  return { color: '#b91c1c', bg: '#fee2e2', label: '3–8 tỷ' };
  return         { color: '#6d28d9', bg: '#ede9fe', label: '> 8 tỷ' };
}

function priceLabel(p: Property): string {
  return formatCompactPropertyPrice(p);
}

function markerHtml(p: Property, selected = false): string {
  const tier = priceTierForProperty(p);
  const isRent = p.listing_type === 'cho_thue';
  const badgeBg = isRent ? '#1d4ed8' : tier.color;
  const label = priceLabel(p);

  return `
    <div style="
      position:relative;
      display:inline-flex;
      flex-direction:column;
      align-items:center;
      filter:drop-shadow(0 3px 8px rgba(0,0,0,0.28));
      ${selected ? 'transform:scale(1.12);' : ''}
      cursor:pointer;
    ">
      <!-- Pill badge -->
      <div style="
        background:${badgeBg};
        color:#fff;
        font-family:Inter,system-ui,sans-serif;
        font-size:11px;
        font-weight:800;
        padding:4px 9px;
        border-radius:20px;
        white-space:nowrap;
        line-height:1.3;
        border:2px solid rgba(255,255,255,0.9);
        display:flex;
        align-items:center;
        gap:4px;
        letter-spacing:0.1px;
      ">
        ${isRent
          ? `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2.5"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>`
          : `<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" stroke-width="2.5"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>`
        }
        ${label}
      </div>
      <!-- Down arrow tip -->
      <div style="
        width:0;height:0;
        border-left:5px solid transparent;
        border-right:5px solid transparent;
        border-top:6px solid ${badgeBg};
        margin-top:-1px;
      "></div>
    </div>
  `;
}

// Nội dung popup lấy từ MODEL DÙNG CHUNG (buildPropertyCardModel) rồi qua serializer escape —
// không tự định dạng lại giá/diện tích/ngày để popup và card React không lệch nhau, đồng thời
// chống XSS (popup cũ nội suy thẳng title/ảnh/địa điểm vào HTML).
//
// Poster: bản đồ chưa có nguồn poster theo lô (batch RPC) nên KHÔNG truyền poster — model trả
// nhãn trung tính UNKNOWN_CARD_POSTER và `identified: false`. Không bịa tên người đăng, không
// gọi RPC theo từng thẻ.
function popupHtml(p: Property): string {
  return serializePropertyCardPopup(buildPropertyCardModel(p));
}

export function PropertyMap({
  properties,
  onNavigate,
  height = '500px',
  centerLat = 11.1,
  centerLng = 106.7,
  zoom = 10,
  onBoundsChange,
  showCountBadge = true,
  fitToMarkers = false,
  getGroupKey,
  selectedGroupKey,
  focusGroupKey,
  onGroupSelect,
}: PropertyMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || mapRef.current) return;

    let cancelled = false;
    let boundsTimer: ReturnType<typeof setTimeout> | null = null;

    import('leaflet').then(module => {
      if (cancelled || !containerRef.current) return;
      const L = module.default;
      import('leaflet/dist/leaflet.css');

      const el = containerRef.current as HTMLDivElement & { _leaflet_id?: number };
      if (el._leaflet_id) delete el._leaflet_id;
      const nextMap = L.map(el, {
        center: [centerLat, centerLng],
        zoom,
        zoomControl: true,
        attributionControl: false,
      });
      mapRef.current = nextMap;
      setMapReady(true);

      // Cleaner map tile
      L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
        maxZoom: 19,
        subdomains: 'abcd',
      }).addTo(nextMap);

      L.control.attribution({ prefix: '© OpenStreetMap © Carto' }).addTo(nextMap);

      const emitBounds = () => {
        if (cancelled || !onBoundsChange) return;
        const b = nextMap.getBounds();
        onBoundsChange({ north: b.getNorth(), south: b.getSouth(), east: b.getEast(), west: b.getWest() });
      };

      nextMap.on('moveend', emitBounds);
      nextMap.on('zoomend', emitBounds);
      boundsTimer = setTimeout(emitBounds, 300);

      addMarkers(L, nextMap, properties, onNavigate, getGroupKey, selectedGroupKey, onGroupSelect);
    });

    return () => {
      cancelled = true;
      if (boundsTimer) clearTimeout(boundsTimer);
      if (mapRef.current) {
        mapRef.current.off();
        mapRef.current.remove();
        mapRef.current = null;
        setMapReady(false);
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    let cancelled = false;
    import('leaflet').then(module => {
      if (cancelled || mapRef.current !== map) return;
      const L = module.default;
      map.eachLayer(layer => {
        if ((layer as { _isMarker?: boolean })._isMarker) map.removeLayer(layer);
      });
      addMarkers(L, map, properties, onNavigate, getGroupKey, selectedGroupKey, onGroupSelect);

      // Tự thu bản đồ khít các marker đang hiển thị: lọc khu vực/quận/xã càng cụ
      // thể thì vùng nhìn càng sát. Một điểm → panTo + zoom gần; nhiều điểm →
      // fitBounds có padding. Không marker thì giữ nguyên view.
      if (fitToMarkers && !focusGroupKey) {
        const pts = properties
          .filter(p => p.latitude != null && p.longitude != null)
          .map(p => [p.latitude!, p.longitude!] as [number, number]);
        if (pts.length === 1) {
          map.setView(pts[0], 15, { animate: true });
        } else if (pts.length > 1) {
          map.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 16, animate: true });
        }
      }
    });
    return () => { cancelled = true; };
  }, [properties, onNavigate, fitToMarkers, getGroupKey, onGroupSelect, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !focusGroupKey || !getGroupKey) return;
    const points = properties
      .filter(property => getGroupKey(property) === focusGroupKey && property.latitude != null && property.longitude != null)
      .map(property => [property.latitude!, property.longitude!] as [number, number]);
    if (!points.length) return;
    map.invalidateSize({ pan: false, animate: false });
    import('leaflet').then(module => {
      if (!mapRef.current) return;
      const L = module.default;
      if (points.length === 1) map.setView(points[0], 15, { animate: true });
      else map.fitBounds(L.latLngBounds(points), { padding: [48, 48], maxZoom: 16, animate: true });
    });
  }, [properties, focusGroupKey, getGroupKey, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    map.eachLayer(layer => {
      const marker = layer as unknown as { _isMarker?: boolean; _groupKey?: string; getElement?: () => HTMLElement | null };
      if (!marker._isMarker) return;
      const content = marker.getElement?.()?.firstElementChild as HTMLElement | null;
      if (content) content.style.transform = marker._groupKey === selectedGroupKey ? 'scale(1.12)' : '';
    });
  }, [selectedGroupKey, mapReady]);
  const visibleCount = properties.filter(p => p.latitude && p.longitude).length;

  return (
    <div className="relative rounded-2xl overflow-hidden border border-gray-200 shadow-md" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />

      {/* Legend — ẩn trên màn nhỏ để không đè zoom control */}
      <div className="hidden sm:block absolute bottom-8 left-3 z-[999] bg-white/95 backdrop-blur-sm rounded-xl px-3 py-2.5 shadow-lg border border-gray-100 pointer-events-none">
        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-widest mb-2">Mức giá</p>
        {[
          { label: '< 1 tỷ',  color: '#15803d' },
          { label: '1–3 tỷ',  color: '#b45309' },
          { label: '3–8 tỷ',  color: '#b91c1c' },
          { label: '> 8 tỷ',  color: '#6d28d9' },
          { label: 'Cho thuê', color: '#1d4ed8' },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-2 mb-1">
            <div className="w-3 h-3 rounded-full flex-shrink-0 border-2 border-white shadow-sm" style={{ background: l.color }} />
            <span className="text-[10px] text-gray-600 font-medium">{l.label}</span>
          </div>
        ))}
      </div>

      {/* Property count badge */}
      {showCountBadge && (
        <div className="absolute top-3 right-3 z-[999] bg-red-600 text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg pointer-events-none flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-white/80 animate-pulse" />
          {visibleCount} BĐS
        </div>
      )}

      {/* Inject popup styles */}
      <style>{`
        .leaflet-popup-content-wrapper {
          padding: 0 !important;
          border-radius: 12px !important;
          overflow: hidden !important;
          box-shadow: 0 8px 30px rgba(0,0,0,0.16) !important;
          border: none !important;
        }
        .leaflet-popup-content {
          margin: 0 !important;
        }
        .leaflet-popup-tip {
          display: none !important;
        }
        .leaflet-popup-close-button {
          /* Vùng chạm 44x44 tối thiểu (WCAG 2.5.8) trên nền tối để tương phản với
             badge giao dịch/gallery phía sau; trước đây chỉ 18px nên rất khó bấm. */
          display: flex !important;
          align-items: center !important;
          justify-content: center !important;
          width: 44px !important;
          height: 44px !important;
          padding: 0 !important;
          top: 0 !important;
          right: 0 !important;
          border-radius: 0 12px 0 12px !important;
          background: rgba(17,24,39,0.55) !important;
          color: #fff !important;
          font-size: 24px !important;
          line-height: 1 !important;
          font-weight: 700 !important;
          z-index: 10 !important;
          text-shadow: none !important;
          opacity: 1 !important;
        }
        .leaflet-popup-close-button:hover,
        .leaflet-popup-close-button:focus-visible {
          background: rgba(17,24,39,0.78) !important;
        }
        .pcpopup-cta:hover { opacity: 0.88; }
      `}</style>
    </div>
  );
}

function addMarkers(
  L: typeof import('leaflet'),
  map: import('leaflet').Map,
  properties: Property[],
  onNavigate: (p: Page) => void,
  getGroupKey?: (property: Property) => string,
  selectedGroupKey?: string | null,
  onGroupSelect?: (groupKey: string) => void,
) {
  const valid = properties.filter(p => p.latitude && p.longitude);

  valid.forEach(p => {
    const groupKey = getGroupKey?.(p);
    const html = markerHtml(p, Boolean(groupKey && groupKey === selectedGroupKey));
    const icon = L.divIcon({
      className: '',
      html,
      iconAnchor: [0, 0],
      popupAnchor: [0, -8],
    });

    const marker = L.marker([p.latitude!, p.longitude!], { icon });
    (marker as unknown as { _isMarker: boolean; _groupKey?: string })._isMarker = true;
    (marker as unknown as { _groupKey?: string })._groupKey = groupKey;

    marker.bindPopup(popupHtml(p), {
      // Khớp đúng bề rộng serializer phát ra (max-width:280px). Lệch nhau khiến Leaflet
      // tự thêm/bớt ~10px và nội dung bị nhảy giữa các popup.
      maxWidth: 280,
      minWidth: 252,
      className: 'property-popup',
      offset: [6, 0],
    });

    marker.on('click', () => {
      if (groupKey) onGroupSelect?.(groupKey);
    });

    // Hover opens popup
    marker.on('mouseover', () => marker.openPopup());

    // Click delegation on popup content via data-nav-id attribute
    marker.on('popupopen', () => {
      const popup = marker.getPopup();
      if (!popup) return;
      const el = popup.getElement();
      if (!el) return;
      const image = el.querySelector<HTMLImageElement>('[data-card-image]');
      if (image) {
        const showFallback = () => {
          image.hidden = true;
          const fallback = el.querySelector<HTMLElement>('[data-card-fallback]');
          if (fallback) fallback.hidden = false;
        };
        image.onerror = showFallback;
        if (image.complete && !image.naturalWidth) showFallback();
      }
      const btn = el.querySelector<HTMLElement>('[data-nav-id]');
      if (btn) {
        btn.onclick = () => onNavigate({ name: 'property', id: btn.dataset.navId!, slug: btn.dataset.navSlug || undefined });
      }
    });

    marker.addTo(map);
  });
}
