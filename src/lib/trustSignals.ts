import type { Property } from './supabase';
import { buildPropertyGallery, FALLBACK_PROPERTY_IMAGE } from './propertyImages';

const MIN_PHOTOS_FOR_SIGNAL = 3;

export type TrustIcon = 'shield' | 'file' | 'map' | 'images';
export interface TrustSignal {
  key: 'verified' | 'legal' | 'map' | 'photos';
  label: string;
  icon: TrustIcon;
}

export function isVerified(p: Pick<Property, 'is_verified'>): boolean {
  return p.is_verified === true;
}

export function buildTrustSignals(p: Property): TrustSignal[] {
  const signals: TrustSignal[] = [];

  if (isVerified(p)) {
    signals.push({ key: 'verified', label: 'Tin đã xác minh', icon: 'shield' });
  }
  if (p.legal_status && p.legal_status.trim()) {
    signals.push({ key: 'legal', label: `Pháp lý: ${p.legal_status}`, icon: 'file' });
  }
  if (p.latitude != null && p.longitude != null) {
    signals.push({ key: 'map', label: 'Có vị trí trên bản đồ', icon: 'map' });
  }

  const realPhotos = buildPropertyGallery(p.image_url, p.images).filter(u => u !== FALLBACK_PROPERTY_IMAGE);
  if (realPhotos.length >= MIN_PHOTOS_FOR_SIGNAL) {
    signals.push({ key: 'photos', label: `${realPhotos.length} hình thực tế`, icon: 'images' });
  }

  return signals;
}
