/** @type {import('tailwindcss').Config} */
import colors from 'tailwindcss/colors';

// ─── Design tokens (Sprint 2 — nền GĐ3) ───────────────────────────────────────
// Nguyên tắc: ADDITIVE. Các class cũ (red-600, gray-200, emerald-500...) VẪN chạy
// nguyên. Đây chỉ THÊM alias semantic để code mới (charts/kanban/bulk-ops Sprint 3)
// dùng tên có nghĩa thay vì màu thô — về sau đổi brand chỉ sửa 1 chỗ.
//   primary  = đỏ (brand, khớp red-600 đang dùng 90+ lần)
//   success  = emerald   warning = amber   info = blue   danger = red   neutral = gray
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class', // sẵn sàng cho dark mode (Sprint 4), chưa bật ở đâu
  theme: {
    extend: {
      colors: {
        primary: colors.red,
        success: colors.emerald,
        warning: colors.amber,
        info: colors.blue,
        danger: colors.red,
        neutral: colors.gray,
      },
      borderWidth: { 6: '6px' },
      borderRadius: {
        card: '1rem',    // 16px — bo card chuẩn (đang dùng rounded-2xl rải rác)
        field: '0.5rem', // 8px  — input/button
      },
      boxShadow: {
        card: '0 4px 20px rgba(0,0,0,0.06)',
        'card-hover': '0 12px 40px rgba(0,0,0,0.10)',
        pop: '0 8px 32px rgba(0,0,0,0.18)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
