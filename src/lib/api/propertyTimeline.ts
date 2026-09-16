import { supabase, type Property } from '../supabase';
import { timelineDay, timelineDayBounds } from '../propertyTimeline';

export type TimelineProperty = Pick<Property,
  'id' | 'title' | 'price' | 'price_unit' | 'price_label' | 'price_per_month' |
  'listing_type' | 'area_sqm' | 'city' | 'district' | 'slug' | 'public_code' | 'created_at' | 'areas'
>;

export const TIMELINE_PAGE_SIZE = 60;
export const TIMELINE_PROPERTY_SELECT = 'id,title,price,price_unit,price_label,price_per_month,listing_type,area_sqm,city,district,slug,public_code,created_at,areas(slug)';

export async function getPropertyTimelinePage(day: string, page: number, signal: AbortSignal, now = new Date()): Promise<{
  data: TimelineProperty[]; total: number; nextPage: number | undefined;
}> {
  const { start, end } = timelineDayBounds(day);
  if (day > timelineDay(now) || !Number.isSafeInteger(page) || page < 0) throw new Error('Khoảng thời gian không hợp lệ');
  // created_at là mốc tạo property; duyệt lại giữ nguyên identity và mốc này.
  const { data, error, count } = await supabase.from('public_properties')
    .select(TIMELINE_PROPERTY_SELECT, { count: 'exact' })
    .eq('is_active', true)
    .gte('created_at', start)
    .lt('created_at', end)
    .lte('created_at', now.toISOString())
    .order('created_at', { ascending: true })
    .order('id', { ascending: true })
    .range(page * TIMELINE_PAGE_SIZE, (page + 1) * TIMELINE_PAGE_SIZE - 1)
    .abortSignal(signal);
  if (error) throw error;
  const total = count ?? 0;
  return {
    data: (data ?? []) as unknown as TimelineProperty[],
    total,
    nextPage: (data?.length ?? 0) > 0 && (page + 1) * TIMELINE_PAGE_SIZE < total ? page + 1 : undefined,
  };
}
