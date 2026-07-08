'use client';
import { PropertyDetailPage } from '@/screens/PropertyDetailPage';
import { SiteChrome } from '@/components/SiteChrome';
import { useNavigate } from '@/lib/useNavigate';
import type { Property } from '@/lib/supabase';

// Wrapper client: cấp onNavigate (useNavigate) cho PropertyDetailPage và bọc trong
// SiteChrome. Nhận initialData từ server để tránh nhấp nháy + đồng bộ React Query.
export function PropertyDetailClient({ propertyId, initialData }: {
  propertyId: string;
  initialData: Property | null;
}) {
  const navigate = useNavigate();
  return (
    <SiteChrome currentPage={{ name: 'property', id: propertyId }}>
      <PropertyDetailPage propertyId={propertyId} onNavigate={navigate} initialData={initialData} />
    </SiteChrome>
  );
}
