import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, query } = vi.hoisted(() => {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'gte', 'lt', 'lte', 'order', 'range', 'abortSignal']) query[method] = vi.fn();
  return { from: vi.fn(), query };
});
vi.mock('../supabase', () => ({ supabase: { from } }));
import { getPropertyTimelinePage, TIMELINE_PAGE_SIZE, TIMELINE_PROPERTY_SELECT } from './propertyTimeline';

beforeEach(() => {
  vi.clearAllMocks();
  from.mockReturnValue(query);
  for (const method of Object.keys(query)) query[method].mockReturnValue(query);
  query.abortSignal.mockResolvedValue({ data: [], count: 0, error: null });
});

describe('public property timeline query', () => {
  it('uses only public fields, active rows, Vietnam day bounds and stable bounded pagination', async () => {
    const signal = new AbortController().signal;
    await getPropertyTimelinePage('2026-09-09', 1, signal, new Date('2026-09-16T01:00:00Z'));
    expect(from).toHaveBeenCalledWith('public_properties');
    expect(query.select).toHaveBeenCalledWith(TIMELINE_PROPERTY_SELECT, { count: 'exact' });
    expect(TIMELINE_PROPERTY_SELECT).not.toMatch(/contact|owner|description|\*/);
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
    expect(query.gte).toHaveBeenCalledWith('created_at', '2026-09-08T17:00:00.000Z');
    expect(query.lt).toHaveBeenCalledWith('created_at', '2026-09-09T17:00:00.000Z');
    expect(query.lte).toHaveBeenCalledWith('created_at', '2026-09-16T01:00:00.000Z');
    expect(query.order.mock.calls).toEqual([['created_at', { ascending: true }], ['id', { ascending: true }]]);
    expect(query.range).toHaveBeenCalledWith(TIMELINE_PAGE_SIZE, TIMELINE_PAGE_SIZE * 2 - 1);
    expect(query.abortSignal).toHaveBeenCalledWith(signal);
  });
  it('propagates errors rather than reporting an empty day', async () => {
    query.abortSignal.mockResolvedValue({ data: null, count: null, error: new Error('offline') });
    await expect(getPropertyTimelinePage('2026-09-09', 0, new AbortController().signal)).rejects.toThrow('offline');
  });
  it('returns pagination metadata without hiding additional listings', async () => {
    query.abortSignal.mockResolvedValue({ data: Array.from({ length: TIMELINE_PAGE_SIZE }, (_, id) => ({ id })), count: 61, error: null });
    const result = await getPropertyTimelinePage('2026-09-09', 0, new AbortController().signal);
    expect(result.total).toBe(61);
    expect(result.nextPage).toBe(1);
  });
  it('rejects future dates and invalid pages before reading', async () => {
    const signal = new AbortController().signal;
    await expect(getPropertyTimelinePage('2026-09-17', 0, signal, new Date('2026-09-16T00:00:00Z'))).rejects.toThrow();
    await expect(getPropertyTimelinePage('2026-09-09', -1, signal)).rejects.toThrow();
    expect(from).not.toHaveBeenCalled();
  });
});
