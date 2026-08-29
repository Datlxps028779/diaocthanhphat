import { supabase } from '../supabase';
import { createSignalEventId, normalizeSignalAttrs, signalDedupeKey, type Signal, type SignalAttrs, type SignalKind } from '../taste';
import type { RecordSignalOptions } from '../tasteStore';

interface TasteSignalRow {
  event_id: string | null;
  kind: SignalKind;
  area_id: string | null;
  type_id: string | null;
  listing_type: string | null;
  price: number | null;
  ts: string;
}

export async function getRemoteTasteSignals(): Promise<Signal[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from('user_taste_signals')
    .select('event_id, kind, area_id, type_id, listing_type, price, ts')
    .eq('user_id', user.id)
    .order('ts', { ascending: false })
    .limit(60);
  return ((data ?? []) as TasteSignalRow[]).map(r => ({
    eventId: r.event_id,
    kind: r.kind,
    areaId: r.area_id,
    typeId: r.type_id,
    listingType: r.listing_type,
    price: r.price,
    ts: new Date(r.ts).getTime(),
  }));
}

export async function pushTasteSignal(
  kind: SignalKind,
  attrs: SignalAttrs,
  opts: RecordSignalOptions = {},
): Promise<string | null> {
  const normalized = normalizeSignalAttrs(attrs);
  const hasContent = normalized.areaId || normalized.typeId || normalized.listingType || normalized.price;
  if (!hasContent) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  const dedupeWindowMs = kind === 'search' && opts.dedupeWindowMs && opts.dedupeWindowMs > 0
    ? opts.dedupeWindowMs
    : undefined;
  const eventId = opts.eventId ?? createSignalEventId();
  const { data, error } = await supabase.rpc('record_user_taste_signal', {
    p_kind: kind,
    p_event_id: eventId,
    p_area_id: normalized.areaId,
    p_type_id: normalized.typeId,
    p_listing_type: normalized.listingType,
    p_price: normalized.price,
    p_dedupe_key: kind === 'search' ? signalDedupeKey(kind, normalized) : null,
    p_dedupe_window_seconds: dedupeWindowMs ? Math.ceil(dedupeWindowMs / 1000) : 1800,
  });
  if (error) throw error;
  return typeof data === 'string' ? data : null;
}
