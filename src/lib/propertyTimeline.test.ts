import { describe, expect, it } from 'vitest';
import { groupTimelineProperties, layoutTimelineProperties, shiftTimelineDay, timelineDay, timelineDayBounds, timelineHour, timelineMonthDays } from './propertyTimeline';

describe('wide timeline cards', () => {
  const buckets = () => Array.from({ length: 12 }, () => [] as string[]);

  it('spans two columns and moves adjacent or same-hour cards to separate rows', () => {
    const input = buckets();
    input[4] = ['08:a', '08:b'];
    input[5] = ['10:a'];
    input[6] = ['12:a'];
    expect(layoutTimelineProperties(input)).toEqual([
      { property: '08:a', slot: 4, column: 4, row: 0 },
      { property: '08:b', slot: 4, column: 4, row: 1 },
      { property: '10:a', slot: 5, column: 5, row: 2 },
      { property: '12:a', slot: 6, column: 6, row: 0 },
    ]);
  });

  it('keeps the last time slot within the grid without overlapping the preceding slot', () => {
    const input = buckets();
    input[0] = ['00:a'];
    input[10] = ['20:a'];
    input[11] = ['22:a', '22:b'];
    const cards = layoutTimelineProperties(input);
    expect(cards.filter(card => card.slot === 11)).toEqual([
      { property: '22:a', slot: 11, column: 10, row: 1 },
      { property: '22:b', slot: 11, column: 10, row: 2 },
    ]);
    expect(cards.every(card => card.column >= 0 && card.column + 2 <= 12)).toBe(true);
  });

  it('never overlaps or drops cards on a busy day', () => {
    const input = buckets().map((_, slot) => Array.from({ length: 5 }, (_, item) => `${slot}:${item}`));
    const cards = layoutTimelineProperties(input);
    const occupied = new Set<string>();
    expect(cards).toHaveLength(60);
    for (const card of cards) {
      for (const column of [card.column, card.column + 1]) {
        const cell = `${card.row}:${column}`;
        expect(occupied.has(cell)).toBe(false);
        occupied.add(cell);
      }
    }
    expect(layoutTimelineProperties(buckets())).toEqual([]);
  });
});

describe('property timeline Vietnam dates', () => {
  it('uses Vietnam midnight regardless of browser timezone', () => {
    expect(timelineDay(new Date('2026-09-08T16:59:59Z'))).toBe('2026-09-08');
    expect(timelineDay(new Date('2026-09-08T17:00:00Z'))).toBe('2026-09-09');
    expect(timelineDayBounds('2026-09-09')).toEqual({ start: '2026-09-08T17:00:00.000Z', end: '2026-09-09T17:00:00.000Z' });
  });
  it('moves by a day or a week across months, years and leap years', () => {
    expect(shiftTimelineDay('2026-01-01', -1)).toBe('2025-12-31');
    expect(shiftTimelineDay('2026-09-09', 7)).toBe('2026-09-16');
    expect(shiftTimelineDay('2024-03-01', -1)).toBe('2024-02-29');
  });
  it.each(['2026-02-29', '2026-13-01', 'garbage', '2026-9-1'])('rejects invalid day %s', day => {
    expect(() => timelineDayBounds(day)).toThrow();
  });
  it('groups only the selected day into twelve two-hour slots and deduplicates IDs', () => {
    const rows = [
      { id: 'a', created_at: '2026-09-08T17:00:00Z' },
      { id: 'b', created_at: '2026-09-08T18:59:59Z' },
      { id: 'c', created_at: '2026-09-08T19:00:00Z' },
      { id: 'd', created_at: '2026-09-09T16:59:59Z' },
      { id: 'outside', created_at: '2026-09-09T17:00:00Z' },
      { id: 'bad', created_at: 'invalid' },
    ];
    const buckets = groupTimelineProperties([...rows, rows[0]], '2026-09-09');
    expect(buckets).toHaveLength(12);
    expect(buckets[0].map(row => row.id)).toEqual(['a', 'b']);
    expect(buckets[1].map(row => row.id)).toEqual(['c']);
    expect(buckets[11].map(row => row.id)).toEqual(['d']);
    expect(buckets.flat()).toHaveLength(4);
    expect(timelineHour(new Date('2026-09-09T16:59:59Z'))).toBe(23);
  });
  it('builds a Monday-first calendar with complete weeks', () => {
    const days = timelineMonthDays('2026-09-01');
    expect(days[0]).toBe('2026-08-31');
    expect(days.at(-1)).toBe('2026-10-04');
    expect(days.length % 7).toBe(0);
  });
});
