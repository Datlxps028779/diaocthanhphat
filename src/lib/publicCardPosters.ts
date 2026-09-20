import type { SupabaseClient } from '@supabase/supabase-js';
import type { PublicCardPoster } from './propertyCardModel';

// Read-only decoration; deliberately not part of Property or PropertyWrite.
export type PublicCardData<T> = T & { readonly cardPoster?: PublicCardPoster };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BATCH_SIZE = 100;

export async function loadPublicCardPosters(client: Pick<SupabaseClient, 'rpc'>, propertyIds: readonly string[]) {
  const ids = [...new Set(propertyIds.filter(id => UUID.test(id)))];
  const posters = new Map<string, PublicCardPoster>();
  let unavailableBatches = 0;
  for (let offset = 0; offset < ids.length; offset += BATCH_SIZE) {
    const batch = ids.slice(offset, offset + BATCH_SIZE);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    try {
      const request = client.rpc('public_get_property_card_posters', { p_property_ids: batch });
      const { data, error } = await (typeof request.abortSignal === 'function' ? request.abortSignal(controller.signal) : request);
      if (error || !Array.isArray(data)) {
        unavailableBatches++;
        // A missing RPC affects every remaining chunk; don't retry it per batch.
        if (error?.code === 'PGRST202' || error?.code === '42883') {
          unavailableBatches += Math.ceil((ids.length - offset - batch.length) / BATCH_SIZE);
          break;
        }
        continue;
      }
      const allowed = new Set(batch);
      const seen = new Set<string>();
      const ambiguous = new Set<string>();
      for (const row of data) {
        if (!row || typeof row.property_id !== 'string' || !allowed.has(row.property_id)) continue;
        const id = row.property_id;
        if (seen.has(id)) { ambiguous.add(id); continue; }
        seen.add(id);
        if (row.attribution_kind !== 'published-profile' || typeof row.display_name !== 'string' || !row.display_name.trim()) continue;
        posters.set(id, {
          propertyId: id,
          displayName: row.display_name.trim(),
          avatarUrl: typeof row.avatar_url === 'string' ? row.avatar_url : null,
          profileSlug: typeof row.profile_slug === 'string' ? row.profile_slug : null,
          source: 'published-profile',
        });
      }
      for (const id of ambiguous) posters.delete(id);
    } catch {
      unavailableBatches++;
    } finally {
      clearTimeout(timeout);
    }
  }
  return { posters, unavailableBatches };
}

export async function enrichPublicCardPosters<T extends { id: string }>(
  client: Pick<SupabaseClient, 'rpc'>,
  properties: readonly T[],
): Promise<PublicCardData<T>[]> {
  const { posters } = await loadPublicCardPosters(client, properties.map(property => property.id));
  return properties.map(property => {
    // A failed or empty re-read must never keep an old, now-private identity.
    const { cardPoster: _previous, ...fields } = property as PublicCardData<T>;
    const poster = posters.get(property.id);
    return { ...fields, ...(poster ? { cardPoster: poster } : {}) } as PublicCardData<T>;
  });
}
