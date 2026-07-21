'use client';
import { useEffect, useRef } from 'react';

// Yêu cầu geocode + zoom tới một khu vực. Đổi `nonce` để ép geocode lại dù `query`
// trùng (nút "Tìm trên bản đồ" bấm nhiều lần với cùng địa chỉ vẫn bắn).
export interface GeocodeTarget {
  query: string;
  zoom: number;
  nonce: number;
}

interface LocationPickerProps {
  lat: string;
  lng: string;
  onChange: (lat: string, lng: string) => void;
  geocodeTarget?: GeocodeTarget;
  onReverseGeocode?: (address: string) => void;
  height?: string;
}

const PIN_SVG = `<svg viewBox="0 0 24 32" xmlns="http://www.w3.org/2000/svg" style="width:28px;height:36px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4))"><path d="M12 0C5.37 0 0 5.37 0 12c0 9 12 20 12 20s12-11 12-20C24 5.37 18.63 0 12 0z" fill="#dc2626"/><circle cx="12" cy="12" r="5" fill="white"/></svg>`;

// Rút địa chỉ gọn từ Nominatim reverse: ưu tiên số nhà + đường + phường/xã, bỏ phần
// tỉnh/quốc gia vốn đã chọn ở dropdown.
function shortAddress(data: { address?: Record<string, string>; display_name?: string }): string {
  const a = data.address;
  if (a) {
    const parts = [
      [a.house_number, a.road].filter(Boolean).join(' '),
      a.suburb || a.village || a.hamlet || a.quarter,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(', ');
  }
  return data.display_name?.split(',').slice(0, 2).join(',').trim() ?? '';
}

// Bản đồ thả ghim dùng chung cho form đăng tin (user/nhân viên) và form admin.
// Click/kéo ghim → cập nhật tọa độ (+ reverse-geocode ra địa chỉ nếu bật); chọn
// khu vực/địa chỉ ở form → geocodeTarget đẩy bản đồ tới đúng chỗ với độ zoom mong muốn.
export function LocationPicker({ lat, lng, onChange, geocodeTarget, onReverseGeocode, height = '280px' }: LocationPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<import('leaflet').Map | null>(null);
  const markerRef = useRef<import('leaflet').Marker | null>(null);
  const iconRef = useRef<import('leaflet').DivIcon | null>(null);
  const lastNonceRef = useRef<number>(-1);
  const reverseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onReverseRef = useRef(onReverseGeocode);
  onReverseRef.current = onReverseGeocode;

  // Thả ghim → tọa độ; debounce reverse-geocode để tránh vượt rate-limit Nominatim (1 req/s).
  const emit = (nlat: number, nlng: number) => {
    onChangeRef.current(nlat.toFixed(6), nlng.toFixed(6));
    if (!onReverseRef.current) return;
    if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
    reverseTimerRef.current = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${nlat}&lon=${nlng}&zoom=18&addressdetails=1`)
        .then(r => r.json())
        .then((data) => {
          const addr = shortAddress(data);
          if (addr) onReverseRef.current?.(addr);
        })
        .catch(() => {});
    }, 600);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    let map: import('leaflet').Map;
    import('leaflet').then(module => {
      const L = module.default;
      import('leaflet/dist/leaflet.css');
      if (!containerRef.current || mapRef.current) return;
      map = L.map(containerRef.current, {
        center: [10.9804, 106.6519],
        zoom: 10,
        zoomControl: true,
        attributionControl: false,
      });
      mapRef.current = map;
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
      L.control.attribution({ prefix: '© OpenStreetMap' }).addTo(map);
      iconRef.current = L.divIcon({ className: '', html: PIN_SVG, iconSize: [28, 36], iconAnchor: [14, 36] });

      map.on('click', (e: import('leaflet').LeafletMouseEvent) => {
        const { lat: clat, lng: clng } = e.latlng;
        if (markerRef.current) {
          markerRef.current.setLatLng([clat, clng]);
        } else {
          markerRef.current = L.marker([clat, clng], { icon: iconRef.current!, draggable: true }).addTo(map);
          markerRef.current.on('dragend', () => {
            const pos = markerRef.current!.getLatLng();
            emit(pos.lat, pos.lng);
          });
        }
        emit(clat, clng);
      });
    });

    return () => {
      if (reverseTimerRef.current) clearTimeout(reverseTimerRef.current);
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; markerRef.current = null; }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Đồng bộ lat/lng bên ngoài → di chuyển ghim + recenter.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !lat || !lng) return;
    const latN = parseFloat(lat), lngN = parseFloat(lng);
    if (isNaN(latN) || isNaN(lngN)) return;
    import('leaflet').then(module => {
      const L = module.default;
      if (!mapRef.current) return;
      if (markerRef.current) {
        markerRef.current.setLatLng([latN, lngN]);
      } else {
        const icon = iconRef.current ?? L.divIcon({ className: '', html: PIN_SVG, iconSize: [28, 36], iconAnchor: [14, 36] });
        markerRef.current = L.marker([latN, lngN], { icon, draggable: true }).addTo(map);
        markerRef.current.on('dragend', () => {
          const pos = markerRef.current!.getLatLng();
          emit(pos.lat, pos.lng);
        });
      }
      map.setView([latN, lngN], Math.max(map.getZoom(), 14));
    });
  }, [lat, lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // geocodeTarget đổi (nonce mới) → geocode chuỗi rồi flyTo với zoom yêu cầu.
  useEffect(() => {
    if (!geocodeTarget || !geocodeTarget.query) return;
    if (geocodeTarget.nonce === lastNonceRef.current) return;
    lastNonceRef.current = geocodeTarget.nonce;
    const map = mapRef.current;
    if (!map) return;
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(geocodeTarget.query + ', Vietnam')}&format=json&limit=1`)
      .then(r => r.json())
      .then((results: Array<{ lat: string; lon: string }>) => {
        if (results.length > 0 && mapRef.current) {
          mapRef.current.flyTo([parseFloat(results[0].lat), parseFloat(results[0].lon)], geocodeTarget.zoom, { duration: 1.2 });
        }
      })
      .catch(() => {});
  }, [geocodeTarget]);

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm" style={{ height }}>
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
}
