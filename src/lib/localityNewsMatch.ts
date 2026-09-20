export type LocalityNewsCandidate = {
  id: string;
  area_id?: string | null;
  geo_area?: string | null;
};

export function normalizeLocalityLabel(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ');
}

export function buildLocalityGeoAreaAllowlist(areaName: string, aliases: readonly string[] = []): ReadonlySet<string> {
  return new Set([areaName, ...aliases].map(normalizeLocalityLabel).filter(Boolean));
}

export function localityNewsMatches(
  candidate: LocalityNewsCandidate,
  areaId: string,
  geoAreaAllowlist: ReadonlySet<string>,
): boolean {
  return candidate.area_id === areaId || geoAreaAllowlist.has(normalizeLocalityLabel(candidate.geo_area));
}

export function dedupeLocalityNews<T extends LocalityNewsCandidate>(rows: readonly T[]): T[] {
  const seen = new Set<string>();
  return rows.filter(row => {
    if (!row.id || seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

export const LOCALITY_NEWS_MINIMUM = 3;

/**
 * Tên khu vực đã chuẩn hoá -> slug, dùng chung cho mọi entrypoint purge cache Tin tức.
 * Một tên khớp về nhiều slug khác nhau (hoặc trùng lặp) bị loại hoàn toàn để bài
 * narrative không bị gán bừa vào khu vực sai.
 */
export function buildAreaNames(
  rows: ReadonlyArray<{ slug: string | null; name: string | null }>,
): Map<string, string> {
  const counts = new Map<string, number>();
  const resolved = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const row of rows) {
    if (!row.slug || !row.name) continue;
    const label = normalizeLocalityLabel(row.name);
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
    const existing = resolved.get(label);
    if (existing === undefined) resolved.set(label, row.slug);
    else if (existing !== row.slug) ambiguous.add(label);
  }
  for (const label of ambiguous) resolved.delete(label);
  for (const [label, count] of counts) if (count > 1) resolved.delete(label);
  return resolved;
}
