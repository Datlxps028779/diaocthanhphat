export const CALLBACK_TIME_PRESETS = ['asap', '30m', 'tonight', 'tomorrow_morning', 'custom'] as const;
export type CallbackTimePreset = (typeof CALLBACK_TIME_PRESETS)[number];

function nextLocalTime(hour: number, minute: number, now: Date): Date {
  const next = new Date(now.getTime());
  next.setHours(hour, minute, 0, 0);
  if (next.getTime() < now.getTime()) next.setDate(next.getDate() + 1);
  return next;
}

export function callbackFollowUpAt(preset: CallbackTimePreset, customTime: string, now = new Date()): string | undefined {
  if (preset === 'asap') return now.toISOString();
  if (preset === '30m') return new Date(now.getTime() + 30 * 60 * 1000).toISOString();
  if (preset === 'tonight') return nextLocalTime(19, 0, now).toISOString();
  if (preset === 'tomorrow_morning') {
    const tomorrow = new Date(now.getTime());
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0);
    return tomorrow.toISOString();
  }
  if (!customTime) return undefined;
  const custom = new Date(customTime);
  return Number.isNaN(custom.getTime()) ? undefined : custom.toISOString();
}

export function callbackTimeLabel(preset: CallbackTimePreset, customTime: string): string {
  if (preset === 'asap') return 'Gọi ngay';
  if (preset === '30m') return 'Trong 30 phút';
  if (preset === 'tonight') return 'Tối nay';
  if (preset === 'tomorrow_morning') return 'Sáng mai';
  if (!customTime) return 'Chọn giờ khác';
  const custom = new Date(customTime);
  if (Number.isNaN(custom.getTime())) return 'Chọn giờ khác';
  return custom.toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
}
