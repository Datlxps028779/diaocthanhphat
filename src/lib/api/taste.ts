import { supabase } from '../supabase';
import type { Signal, SignalKind } from '../taste';

interface TasteSignalRow {
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
    .select('kind, area_id, type_id, listing_type, price, ts')
    .eq('user_id', user.id)
    .order('ts', { ascending: false })
    .limit(60);
  return ((data ?? []) as TasteSignalRow[]).map(r => ({
    kind: r.kind,
    areaId: r.area_id,
    typeId: r.type_id,
    listingType: r.listing_type,
    price: r.price,
    ts: new Date(r.ts).getTime(),
  }));
}

export async function pushTasteSignal(kind: SignalKind, attrs: {
  areaId?: string | null; typeId?: string | null; listingType?: string | null; price?: number | null;
}): Promise<void> {
  const hasContent = attrs.areaId || attrs.typeId || attrs.listingType || (typeof attrs.price === 'number' && attrs.price > 0);
  if (!hasContent) return;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from('user_taste_signals').insert({
    kind,
    area_id: attrs.areaId ?? null,
    type_id: attrs.typeId ?? null,
    listing_type: attrs.listingType ?? null,
    price: attrs.price ?? null,
  });
}
