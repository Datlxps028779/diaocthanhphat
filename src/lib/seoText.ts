export const META_TITLE_MAX = 60;

export function clampSeoTitle(raw: string | null | undefined, max = META_TITLE_MAX): string {
  const value = (raw ?? '').trim().replace(/\s+/g, ' ');
  const chars = [...value];
  if (chars.length <= max) return value;
  const cut = chars.slice(0, Math.max(1, max - 1)).join('');
  const lastSpace = cut.lastIndexOf(' ');
  const boundary = lastSpace > 0 ? cut.slice(0, lastSpace).trimEnd() : cut;
  return `${boundary}…`;
}
