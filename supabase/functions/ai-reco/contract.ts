export const MAX_RECO_CANDIDATES = 20;
export const MAX_RECO_BODY_BYTES = 32_000;

export interface NormalizedProfileDigest {
  areas: string[];
  types: string[];
  listingTypes: string[];
}

export interface NormalizedRecoInput {
  profileDigest: NormalizedProfileDigest;
  candidateIds: string[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const LISTING_TYPE_LABELS: Record<string, string> = {
  mua_ban: 'mua bán',
  cho_thue: 'cho thuê',
  can_mua: 'cần mua',
  can_thue: 'cần thuê',
};

export function listingTypeLabel(value: string | null | undefined): string | null {
  return value ? LISTING_TYPE_LABELS[value] ?? null : null;
}

function hasControlCharacter(value: string): boolean {
  return Array.from(value).some(char => {
    const code = char.charCodeAt(0);
    return code < 32 || code === 127;
  });
}

function normalizeStringList(value: unknown, maxItems: number, maxLength: number): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > maxItems) return null;
  const normalized: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || hasControlCharacter(item)) return null;
    const text = item.trim().replace(/\s+/g, ' ');
    if (!text || text.length > maxLength) return null;
    normalized.push(text);
  }
  return [...new Set(normalized)];
}

function candidateIdOf(value: unknown): string | null {
  if (typeof value === 'string') return UUID_RE.test(value) ? value : null;
  if (!value || typeof value !== 'object') return null;
  const id = (value as { id?: unknown }).id;
  return typeof id === 'string' && UUID_RE.test(id) ? id : null;
}

export function normalizeRecoInput(body: unknown): NormalizedRecoInput | null {
  if (!body || typeof body !== 'object') return null;
  const raw = body as { profileDigest?: unknown; candidateIds?: unknown; candidates?: unknown };
  if (!raw.profileDigest || typeof raw.profileDigest !== 'object') return null;
  const digest = raw.profileDigest as { areas?: unknown; types?: unknown; listingTypes?: unknown };
  const areas = normalizeStringList(digest.areas, 3, 80);
  const types = normalizeStringList(digest.types, 3, 80);
  const listingTypes = normalizeStringList(digest.listingTypes, 2, 24);
  if (!areas || !types || !listingTypes) return null;

  const candidateSource = Array.isArray(raw.candidateIds) ? raw.candidateIds : raw.candidates;
  if (!Array.isArray(candidateSource) || candidateSource.length === 0 || candidateSource.length > MAX_RECO_CANDIDATES) return null;
  const candidateIds: string[] = [];
  for (const candidate of candidateSource) {
    const id = candidateIdOf(candidate);
    if (!id) return null;
    if (!candidateIds.includes(id)) candidateIds.push(id);
  }
  if (!candidateIds.length) return null;

  return {
    profileDigest: { areas, types, listingTypes },
    candidateIds,
  };
}
