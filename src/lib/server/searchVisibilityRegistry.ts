type ReadClient = { from: (table: string) => any };
type Options = { pageSize?: number; maxRows?: number; timeoutMs?: number };
const UNAVAILABLE = 'Không đọc được snapshot audit đầy đủ.';

export type RegistryVersion = { source_key: string; canonical_url: string | null; source_version: string; eligible: boolean };

export async function readCompleteAuditRows(
  client: ReadClient, table: string, select: string, key = 'id', options: Options = {},
): Promise<Record<string, unknown>[]> {
  const pageSize = options.pageSize ?? 500, maxRows = options.maxRows ?? 20_000, timeoutMs = options.timeoutMs ?? 15_000;
  if (![pageSize, maxRows, timeoutMs].every(n => Number.isSafeInteger(n) && n > 0)
    || pageSize > 500 || maxRows > 20_000 || timeoutMs > 15_000) throw new Error(UNAVAILABLE);
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const page = async (cursor: string | null, limit: number) => {
    if (controller.signal.aborted) throw new Error(UNAVAILABLE);
    let query = client.from(table).select(select, { count: 'exact' }).order(key, { ascending: true }).limit(limit).abortSignal(controller.signal);
    if (cursor !== null) query = query.gt(key, cursor);
    const result = await query;
    if (result.error || !Array.isArray(result.data) || !Number.isSafeInteger(result.count)
      || result.count < 0 || result.count > maxRows || result.data.length > limit || result.data.length > result.count) throw new Error(UNAVAILABLE);
    return result as { data: Record<string, unknown>[]; count: number };
  };
  const read = async () => {
    const rows: Record<string, unknown>[] = [];
    const seen = new Set<string>();
    let total: number | undefined, cursor: string | null = null, pages = 0;
    do {
      if (++pages > 50) throw new Error(UNAVAILABLE);
      const result = await page(cursor, Math.min(pageSize, maxRows - rows.length));
      total ??= result.count;
      if (result.count !== total - rows.length || (!result.data.length && rows.length !== total)) throw new Error(UNAVAILABLE);
      for (const row of result.data) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(UNAVAILABLE);
        const value = row[key];
        if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]+$/.test(value) || seen.has(value)
          || (key === 'id' && cursor !== null && value <= cursor)) throw new Error(UNAVAILABLE);
        seen.add(value);
        cursor = value;
        rows.push(row);
      }
    } while (rows.length < total);
    const probe = await page(null, 1);
    if (probe.count !== total || probe.data.length !== Math.min(1, total) || probe.data[0]?.[key] !== rows[0]?.[key]) throw new Error(UNAVAILABLE);
    return rows;
  };
  try {
    return await Promise.race([read(), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error(UNAVAILABLE)); }, timeoutMs);
    })]);
  } catch {
    controller.abort();
    throw new Error(UNAVAILABLE);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function readRegistryVersion(client: ReadClient): Promise<RegistryVersion[]> {
  const rows = await readCompleteAuditRows(client, 'search_visibility_urls', 'source_key,canonical_url,source_version,eligible', 'source_key');
  return rows.map(row => {
    if (typeof row.source_key !== 'string' || typeof row.source_version !== 'string' || !row.source_version
      || typeof row.eligible !== 'boolean' || (row.canonical_url !== null && typeof row.canonical_url !== 'string')) throw new Error(UNAVAILABLE);
    return { source_key: row.source_key, canonical_url: row.canonical_url as string | null, source_version: row.source_version, eligible: row.eligible };
  });
}
