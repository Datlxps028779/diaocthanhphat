import { createClient } from '@supabase/supabase-js';
import { unstable_noStore as noStore } from 'next/cache';
import { enrichPublicCardPosters, type PublicCardData } from '../publicCardPosters';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../env';
import type { Property } from '../supabase';
import { salePriceBandPostgrestFilter, type LocalityPriceBand } from '../localityListingScope';

const SELECT = 'id,title,description,price,price_unit,price_label,price_per_month,loan_support,listing_type,area_sqm,address,city,district,ward,area_id,district_id,ward_id,property_type_id,neighborhood_slug,image_url,images,badge,badge_color,legal_status,is_featured,is_hot,is_active,is_verified,views,bedrooms,bathrooms,floor_count,floor_number,direction,road_width,frontage,amenities,latitude,longitude,formatted_address,vr_tour_url,video_url,tags,meta_title,meta_description,focus_keywords,slug,public_code,faq,created_at,updated_at,areas(id,name,slug),property_types(id,name,slug)';

export interface LocalityListingQuery {
  areaId: string;
  listingType?: 'mua_ban' | 'cho_thue';
  districtId?: string;
  wardId?: string;
  typeIds?: string[];
  salePriceBand?: LocalityPriceBand;
}

export async function loadLocalityListings(scope: LocalityListingQuery, limit = 12): Promise<PublicCardData<Property>[]> {
  noStore();
  const expression = scope.salePriceBand === undefined ? null : salePriceBandPostgrestFilter(scope.salePriceBand);
  if (scope.salePriceBand !== undefined && (!expression || (scope.listingType && scope.listingType !== 'mua_ban'))) {
    throw new Error('Phạm vi giá không hợp lệ');
  }
  if (scope.typeIds?.length === 0) return [];
  try {
    const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    let query = sb.from('public_properties').select(SELECT).eq('is_active', true).eq('area_id', scope.areaId)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit);
    if (scope.listingType) query = query.eq('listing_type', scope.listingType);
    if (scope.districtId) query = query.eq('district_id', scope.districtId);
    if (scope.wardId) query = query.eq('ward_id', scope.wardId);
    if (scope.typeIds?.length) query = query.in('property_type_id', scope.typeIds);
    if (expression) query = query.eq('listing_type', 'mua_ban').or(expression);
    const { data, error } = await query;
    if (error) throw error;
    return enrichPublicCardPosters(sb, (data ?? []) as unknown as Property[]);
  } catch {
    throw new Error('Không tải được tin đăng địa phương');
  }
}
