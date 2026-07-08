// ─── Design tokens (Sprint 2 — nền GĐ3) ───────────────────────────────────────
// Token dưới dạng JS constant để dùng trong CODE (charts, style động, canvas...)
// — nơi không viết class Tailwind được. Class tĩnh thì dùng alias trong
// tailwind.config.js (primary-600, success-500...). Hai nơi CÙNG bảng màu.

// ─── Bảng màu semantic (khớp Tailwind alias) ─────────────────────────────────
export const COLORS = {
  primary: '#dc2626', // red-600 — brand
  success: '#059669', // emerald-600
  warning: '#d97706', // amber-600
  info: '#2563eb',    // blue-600
  danger: '#dc2626',  // red-600
  neutral: '#4b5563', // gray-600
} as const;

// ─── Palette chart — ĐỦ TƯƠNG PHẢN, phân biệt được cả khi mù màu ──────────────
// Thứ tự tối ưu để 2-3 series đầu khác nhau rõ nhất. Dùng cho analytics Sprint 3.
export const CHART_PALETTE_LIGHT = [
  '#dc2626', // đỏ (primary)
  '#2563eb', // xanh dương
  '#059669', // xanh lá
  '#d97706', // cam
  '#7c3aed', // tím
  '#0891b2', // cyan
  '#db2777', // hồng
  '#65a30d', // vàng chanh
] as const;

// Biến thể dark: sáng hơn ~1 bậc để nổi trên nền tối (Sprint 4 bật dark mode).
export const CHART_PALETTE_DARK = [
  '#f87171', // red-400
  '#60a5fa', // blue-400
  '#34d399', // emerald-400
  '#fbbf24', // amber-400
  '#a78bfa', // violet-400
  '#22d3ee', // cyan-400
  '#f472b6', // pink-400
  '#a3e635', // lime-400
] as const;

// Màu trạng thái lead cho CRM pipeline (Sprint 3) — nhất quán badge + cột kanban.
export const LEAD_STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  new:       { bg: '#eff6ff', text: '#1d4ed8', dot: '#2563eb' }, // xanh dương
  contacted: { bg: '#fffbeb', text: '#b45309', dot: '#d97706' }, // cam
  qualified: { bg: '#f5f3ff', text: '#6d28d9', dot: '#7c3aed' }, // tím
  won:       { bg: '#ecfdf5', text: '#047857', dot: '#059669' }, // xanh lá
  lost:      { bg: '#fef2f2', text: '#b91c1c', dot: '#dc2626' }, // đỏ
} as const;

// ─── Spacing / radius / shadow (khớp tailwind.config) ─────────────────────────
export const RADIUS = { card: '1rem', field: '0.5rem' } as const;
export const SHADOW = {
  card: '0 4px 20px rgba(0,0,0,0.06)',
  cardHover: '0 12px 40px rgba(0,0,0,0.10)',
  pop: '0 8px 32px rgba(0,0,0,0.18)',
} as const;

export type ChartPalette = typeof CHART_PALETTE_LIGHT;
