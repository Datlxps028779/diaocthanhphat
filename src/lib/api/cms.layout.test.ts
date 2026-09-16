import { describe, expect, it, vi, beforeEach } from 'vitest';

// ─── Supabase mock ────────────────────────────────────────────────────────────
// We mock the builder chain used by cms.ts: .from().select()/.update().eq()
// .select().single() / await-thenable. Each test installs its own scripted
// response queue so we can assert on the exact query shape AND the error path.
const supabaseMock = vi.hoisted(() => ({ from: vi.fn() }));
const revalidateHomeMock = vi.hoisted(() => vi.fn(async () => [] as string[]));

vi.mock('@/lib/supabase', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/api/contentRevalidation', () => ({
  revalidateHomeContent: revalidateHomeMock,
  revalidateNeighborhoodContent: vi.fn(),
  revalidateRouteContent: vi.fn(),
  routeRevalidationSnapshot: vi.fn((x: unknown) => x),
  neighborhoodRevalidationSnapshot: vi.fn((x: unknown) => x),
}));

import { adminSavePageLayout, getPageLayout, HomePageLayoutNoRowsError } from './cms';

type Row = Record<string, unknown>;

// The real column is `id text primary key` (see live evidence 2026-09-16), so
// section identity is a stable key like 'hero' / 'featured_sections'.
function row(id: string, order_index: number, extra: Row = {}): Row {
  return {
    id,
    label: id,
    description: null,
    icon: null,
    is_visible: true,
    order_index,
    settings: {},
    created_at: '2026-08-08T00:50:40.000000+00:00',
    updated_at: '2026-08-08T00:50:40.000000+00:00',
    ...extra,
  };
}

// ─── Builder harness ──────────────────────────────────────────────────────────
type ReadResponse = { data: Row[] | null; error: unknown };

/**
 * Builds a mock matching the cms.ts call shapes.
 *  - reads:  .from(t).select(cols).order(col, opts)          -> awaitable
 *  - update: .from(t).update(patch).eq('id', id).eq('updated_at', ts)
 *              .select('*').single()                          -> { data, error }
 *  - insert: .from(t).insert(row).select('*')                -> { data, error }
 */
function makeClient(opts: {
  reads: ReadResponse[];
  updateResults?: Array<{ data: Row | null; error: unknown }>;
  insertResults?: Array<{ data: Row[] | null; error: unknown }>;
}) {
  const calls = {
    reads: [] as Array<{ table: string; columns: string }>,
    updates: [] as Array<{ table: string; patch: Row; id: string; version?: unknown }>,
    inserts: [] as Array<{ table: string; row: Row }>,
  };
  const readQueue = [...opts.reads];
  const updateQueue = [...(opts.updateResults ?? [])];
  const insertQueue = [...(opts.insertResults ?? [])];

  const from = vi.fn((table: string) => {
    return {
      // ── READ: select().order()  |  select().in() ──
      select: vi.fn((columns: string) => {
        const readChain = {
          order: vi.fn(() => {
            calls.reads.push({ table, columns });
            return Promise.resolve(readQueue.shift() ?? { data: [], error: null });
          }),
          in: vi.fn(() => {
            calls.reads.push({ table, columns });
            return Promise.resolve(readQueue.shift() ?? { data: [], error: null });
          }),
          eq: vi.fn(() => readChain),
        };
        return readChain;
      }),
      // ── WRITE: update(patch).eq('id', id).eq('updated_at', ts).select().single() ──
      update: vi.fn((patch: Row) => {
        const entry = { table, patch, id: '', version: undefined as unknown };
        calls.updates.push(entry);
        const chain = {
          eq: vi.fn((column: string, value: unknown) => {
            if (column === 'id') entry.id = String(value);
            if (column === 'updated_at') entry.version = value;
            return chain;
          }),
          select: vi.fn(() => ({
            single: vi.fn(async () => updateQueue.shift() ?? { data: null, error: null }),
          })),
        };
        return chain;
      }),
      // ── INSERT: insert(row).select() ──
      insert: vi.fn((r: Row) => {
        calls.inserts.push({ table, row: r });
        return {
          select: vi.fn(async () => insertQueue.shift() ?? { data: null, error: null }),
        };
      }),
    };
  });

  return { client: { from }, calls };
}

beforeEach(() => {
  vi.clearAllMocks();
});

/** Runs a promise expected to reject and returns the thrown value as a typed bag. */
async function captureFailure(p: Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await p;
  } catch (e) {
    return e as Record<string, unknown>;
  }
  throw new Error('expected the promise to reject, but it resolved');
}

// ─── getPageLayout: must surface read errors ──────────────────────────────────
describe('getPageLayout — safe read', () => {
  it('returns rows ordered by order_index on the happy path', async () => {
    const { client, calls } = makeClient({ reads: [{ data: [row('hero', 0), row('stats', 1)], error: null }] });
    supabaseMock.from.mockImplementation(client.from);

    const result = await getPageLayout();

    expect(result.map(s => s.id)).toEqual(['hero', 'stats']);
    expect(calls.reads[0]).toEqual({ table: 'page_sections', columns: '*' });
  });

  it('throws instead of silently returning [] when the read errors (RLS/network)', async () => {
    const err = { message: 'permission denied for table page_sections', code: '42501' };
    const { client } = makeClient({ reads: [{ data: null, error: err }] });
    supabaseMock.from.mockImplementation(client.from);

    await expect(getPageLayout()).rejects.toMatchObject({ message: err.message });
  });

  it('throws a labelled no-rows error when the table read returns zero rows', async () => {
    const { client } = makeClient({ reads: [{ data: [], error: null }] });
    supabaseMock.from.mockImplementation(client.from);

    await expect(getPageLayout()).rejects.toBeInstanceOf(HomePageLayoutNoRowsError);
  });

  it('throws the no-rows error when data is null without an error', async () => {
    const { client } = makeClient({ reads: [{ data: null, error: null }] });
    supabaseMock.from.mockImplementation(client.from);

    await expect(getPageLayout()).rejects.toBeInstanceOf(HomePageLayoutNoRowsError);
  });
});

// ─── adminSavePageLayout: happy path + returned rows ──────────────────────────
describe('adminSavePageLayout — write contract', () => {
  it('reads all target rows first, then writes each with an optimistic version pin', async () => {
    const existing = [row('featured_sections', 3), row('region_banners', 4, { is_visible: false, settings: { region1_slug: '/khu-vuc/binh-duong' } })];
    const { client, calls } = makeClient({
      reads: [{ data: existing, error: null }],
      updateResults: [
        { data: row('featured_sections', 4), error: null },
        { data: row('region_banners', 5), error: null },
      ],
    });
    supabaseMock.from.mockImplementation(client.from);

    const result = await adminSavePageLayout([
      { id: 'featured_sections', order_index: 4 },
      { id: 'region_banners', order_index: 5 },
    ]);

    // Exactly one preflight read, before any write.
    expect(calls.reads).toHaveLength(1);
    expect(calls.updates).toHaveLength(2);
    // Every write is pinned to the version observed during preflight.
    expect(calls.updates.map(u => u.version)).toEqual([
      '2026-08-08T00:50:40.000000+00:00',
      '2026-08-08T00:50:40.000000+00:00',
    ]);
    // Partial fields only: untouched columns are not sent.
    expect(Object.keys(calls.updates[0].patch).sort()).toEqual(['order_index', 'updated_at']);
    expect(Object.keys(calls.updates[1].patch).sort()).toEqual(['order_index', 'updated_at']);
    // Freshly persisted rows come back for parent UI/cache reconciliation.
    expect(result.map(s => s.id)).toEqual(['featured_sections', 'region_banners']);
    expect(result.map(s => s.order_index)).toEqual([4, 5]);
  });

  it('omits expected_updated_at from the request payload (pin travels in the WHERE clause)', async () => {
    const { client, calls } = makeClient({
      reads: [{ data: [row('news', 7)], error: null }],
      updateResults: [{ data: row('news', 7), error: null }],
    });
    supabaseMock.from.mockImplementation(client.from);

    await adminSavePageLayout([{ id: 'news', order_index: 7, expected_updated_at: '2026-08-08T00:50:40.000000+00:00' }]);

    expect(calls.updates[0].patch).not.toHaveProperty('expected_updated_at');
    expect(calls.updates[0].version).toBe('2026-08-08T00:50:40.000000+00:00');
  });

  it('accepts a partial payload of only the fields a caller changed', async () => {
    const { client, calls } = makeClient({
      reads: [{ data: [row('cta', 8)], error: null }],
      updateResults: [{ data: row('cta', 8, { is_visible: false }), error: null }],
    });
    supabaseMock.from.mockImplementation(client.from);

    await adminSavePageLayout([{ id: 'cta', is_visible: false }]);

    expect(calls.updates[0].patch).toMatchObject({ is_visible: false });
    expect(calls.updates[0].patch).not.toHaveProperty('order_index');
    expect(calls.updates[0].patch).not.toHaveProperty('settings');
  });

  it('preserves region_banners visibility when only its settings are edited', async () => {
    const { client, calls } = makeClient({
      reads: [{ data: [row('region_banners', 4, { is_visible: false, settings: { region1_slug: '/khu-vuc/binh-duong' } })], error: null }],
      updateResults: [{ data: row('region_banners', 4, { is_visible: false, settings: { region1_slug: '/khu-vuc/dong-nai', region2_slug: '/khu-vuc/binh-duong' } }), error: null }],
    });
    supabaseMock.from.mockImplementation(client.from);

    await adminSavePageLayout([{ id: 'region_banners', settings: { region1_slug: '/khu-vuc/dong-nai', region2_slug: '/khu-vuc/binh-duong' } }]);

    expect(calls.updates[0].patch).not.toHaveProperty('is_visible');
  });
});

// ─── adminSavePageLayout: failure modes ───────────────────────────────────────
describe('adminSavePageLayout — failure handling', () => {
  it('throws before writing anything when the preflight read fails', async () => {
    const { client, calls } = makeClient({ reads: [{ data: null, error: { message: 'read denied', code: '42501' } }] });
    supabaseMock.from.mockImplementation(client.from);

    const failure = await captureFailure(adminSavePageLayout([{ id: 'hero', order_index: 0 }]));
    expect(String(failure.message)).toContain('read denied');
    expect((failure as { stage?: string }).stage).toBe('preflight');
    expect(calls.updates).toHaveLength(0);
  });

  it('reports a missing row instead of issuing an UPDATE that matches nothing', async () => {
    const { client, calls } = makeClient({ reads: [{ data: [row('hero', 0)], error: null }] });
    supabaseMock.from.mockImplementation(client.from);

    await expect(adminSavePageLayout([{ id: 'hero', order_index: 0 }, { id: 'ghost_section', order_index: 99 }]))
      .rejects.toMatchObject({ message: expect.stringContaining('ghost_section') });
    expect(calls.updates).toHaveLength(0);
  });

  it('treats .select().single() returning no row as an RLS/no-rows rejection', async () => {
    const { client } = makeClient({
      reads: [{ data: [row('hero', 0)], error: null }],
      updateResults: [{ data: null, error: null }], // 200 but zero rows affected
    });
    supabaseMock.from.mockImplementation(client.from);

    await expect(adminSavePageLayout([{ id: 'hero', order_index: 1 }]))
      .rejects.toMatchObject({ message: expect.stringContaining('hero') });
  });

  it('surfaces an explicit CAS conflict when the version pin moved', async () => {
    const { client } = makeClient({
      reads: [{ data: [row('hero', 0)], error: null }],
      updateResults: [{ data: null, error: { message: 'no rows matched the version pin', code: 'PGRST116' } }],
    });
    supabaseMock.from.mockImplementation(client.from);

    await expect(adminSavePageLayout([{ id: 'hero', order_index: 1 }]))
      .rejects.toMatchObject({ message: expect.stringContaining('hero') });
  });

  it('names every already-persisted id when a later write fails (partial failure)', async () => {
    const { client } = makeClient({
      reads: [{ data: [row('hero', 0), row('stats', 1), row('news', 7)], error: null }],
      updateResults: [
        { data: row('hero', 5), error: null },
        { data: row('stats', 6), error: null },
        { data: null, error: { message: 'version conflict', code: 'PGRST116' } },
      ],
    });
    supabaseMock.from.mockImplementation(client.from);

    const failure = await captureFailure(adminSavePageLayout([
      { id: 'hero', order_index: 5 },
      { id: 'stats', order_index: 6 },
      { id: 'news', order_index: 7 },
    ]));

    expect(failure).toBeDefined();
    expect(String(failure.message)).toContain('news');            // the failed id
    expect((failure as { persistedIds?: string[] }).persistedIds).toEqual(['hero', 'stats']);
    expect((failure as { failedId?: string }).failedId).toBe('news');
  });

  it('reports a revalidation failure distinctly after all writes committed', async () => {
    const { client, calls } = makeClient({
      reads: [{ data: [row('hero', 0)], error: null }],
      updateResults: [{ data: row('hero', 0), error: null }],
    });
    supabaseMock.from.mockImplementation(client.from);
    revalidateHomeMock.mockRejectedValueOnce(new Error('revalidate gateway 502'));

    const failure = await captureFailure(adminSavePageLayout([{ id: 'hero', order_index: 0 }]));

    // Writes did land, and the error is labelled as post-write revalidation.
    expect(calls.updates).toHaveLength(1);
    expect(failure).toBeDefined();
    expect(String(failure.message)).toContain('revalidate gateway 502');
    expect((failure as { persistedIds?: string[] }).persistedIds).toEqual(['hero']);
    expect((failure as { stage?: string }).stage).toBe('revalidation');
  });

  it('rejects any stale baseline before writing even the first row', async () => {
    const { client, calls } = makeClient({ reads: [{ data: [row('hero', 0), row('news', 7, { updated_at: 'new-version' })], error: null }] });
    supabaseMock.from.mockImplementation(client.from);
    await expect(adminSavePageLayout([
      { id: 'hero', order_index: 1 },
      { id: 'news', settings: {}, expected_updated_at: 'old-version' },
    ])).rejects.toMatchObject({ stage: 'preflight', failedId: 'news', persistedIds: [] });
    expect(calls.updates).toHaveLength(0);
  });

  it('rejects duplicate section IDs before querying', async () => {
    await expect(adminSavePageLayout([{ id: 'hero' }, { id: 'hero' }])).rejects.toMatchObject({ stage: 'preflight' });
    expect(supabaseMock.from).not.toHaveBeenCalled();
  });

  it('does not call revalidateHomeContent when nothing needed writing', async () => {
    const { client } = makeClient({ reads: [{ data: [row('hero', 0)], error: null }] });
    supabaseMock.from.mockImplementation(client.from);

    await adminSavePageLayout([]);
    expect(revalidateHomeMock).not.toHaveBeenCalled();
  });
});
