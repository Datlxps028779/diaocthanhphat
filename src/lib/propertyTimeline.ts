const VIETNAM_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
export const TIMELINE_HOURS = Array.from({ length: 12 }, (_, index) => index * 2);
export const TIMELINE_TIME_ZONE = 'Asia/Ho_Chi_Minh';

export function timelineDay(now: Date): string {
  return new Date(now.getTime() + VIETNAM_OFFSET_MS).toISOString().slice(0, 10);
}

function parseDay(day: string): Date {
  const date = new Date(`${day}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
    throw new Error('Ngày không hợp lệ');
  }
  return date;
}

export function shiftTimelineDay(day: string, days: number): string {
  return new Date(parseDay(day).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

export function timelineDayBounds(day: string): { start: string; end: string } {
  const start = parseDay(day).getTime() - VIETNAM_OFFSET_MS;
  return { start: new Date(start).toISOString(), end: new Date(start + DAY_MS).toISOString() };
}

export function timelineHour(now: Date): number {
  return new Date(now.getTime() + VIETNAM_OFFSET_MS).getUTCHours();
}

export function timelineMonthDays(month: string): string[] {
  const first = parseDay(`${month.slice(0, 7)}-01`);
  const offset = (first.getUTCDay() + 6) % 7;
  const last = new Date(first.getTime());
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  const length = Math.ceil((offset + last.getUTCDate()) / 7) * 7;
  return Array.from({ length }, (_, index) => shiftTimelineDay(first.toISOString().slice(0, 10), index - offset));
}

export function layoutTimelineProperties<T>(buckets: T[][]): { property: T; slot: number; column: number; row: number }[] {
  const occupied: Set<number>[] = [];
  return buckets.flatMap((properties, slot) => properties.map(property => {
    // Cột 22:00 mở rộng sang trái để thẻ không bị cắt ở mép cuối timeline.
    const column = Math.min(slot, TIMELINE_HOURS.length - 2);
    let row = occupied.findIndex(cells => !cells.has(column) && !cells.has(column + 1));
    if (row < 0) {
      row = occupied.length;
      occupied.push(new Set());
    }
    occupied[row].add(column);
    occupied[row].add(column + 1);
    return { property, slot, column, row };
  }));
}

export function groupTimelineProperties<T extends { id: string; created_at: string }>(rows: T[], day: string): T[][] {
  const buckets: T[][] = Array.from({ length: 12 }, () => []);
  const seen = new Set<string>();
  for (const row of rows) {
    const date = new Date(row.created_at);
    if (!Number.isFinite(date.getTime()) || timelineDay(date) !== day || seen.has(row.id)) continue;
    seen.add(row.id);
    buckets[Math.floor(timelineHour(date) / 2)].push(row);
  }
  return buckets;
}
